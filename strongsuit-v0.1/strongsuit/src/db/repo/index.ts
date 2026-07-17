import { db } from '../schema'
import { makeRepo } from './base'
import { newId, nowIso, stamp } from '@/lib/core'
import type { Trainer, Client, ClientNote, Program, SessionLog, Metric, Waiver, Device, CoachMessage } from '../types'

// ---------- trainer (singleton) ----------
const TRAINER_ID = 'trainer'
export const trainerRepo = {
  ...makeRepo<Trainer>(db.trainer),
  async get(): Promise<Trainer | undefined> {
    return db.trainer.get(TRAINER_ID)
  },
  async getOrCreate(): Promise<Trainer> {
    const existing = await db.trainer.get(TRAINER_ID)
    if (existing) return existing
    const t = nowIso()
    const fresh: Trainer = {
      id: TRAINER_ID, createdAt: t, updatedAt: t,
      businessName: '', trainerName: '', units: 'lb', weekStartsOn: 1,
      defaultRestSeconds: 90, currency: 'USD', onboardingComplete: false,
      companionCredit: true, density: 'compact', theme: 'system',
    }
    await db.trainer.add(fresh)
    return fresh
  },
  async patch(patch: Partial<Trainer>) {
    await db.trainer.update(TRAINER_ID, { ...patch, updatedAt: nowIso() })
    return db.trainer.get(TRAINER_ID)
  },
}

// ---------- clients ----------
export const clientsRepo = {
  ...makeRepo<Client>(db.clients),
  async active() {
    return db.clients.where('status').equals('active').toArray()
  },
  async archive(id: string) {
    await db.clients.update(id, { status: 'archived', archivedAt: nowIso(), updatedAt: nowIso() })
  },
  /** Hard delete (Settings → Data only): removes client + all child rows. */
  async hardDelete(id: string) {
    await db.transaction('rw', [db.clients, db.clientNotes, db.programs, db.sessionLogs, db.checkIns, db.metrics, db.payments, db.appointments, db.waivers], async () => {
      await db.clientNotes.where('clientId').equals(id).delete()
      await db.programs.where('clientId').equals(id).delete()
      await db.sessionLogs.where('clientId').equals(id).delete()
      await db.checkIns.where('clientId').equals(id).delete()
      await db.metrics.where('clientId').equals(id).delete()
      await db.payments.where('clientId').equals(id).delete()
      await db.appointments.where('clientId').equals(id).delete()
      await db.waivers.where('clientId').equals(id).delete()
      await db.clients.delete(id)
    })
  },
  async purgeDemo() {
    const demo = await db.clients.filter(c => !!c.isDemo).toArray()
    for (const c of demo) await this.hardDelete(c.id)
  },
}

// ---------- exercises ----------
export const exercisesRepo = makeRepo(db.exercises)

// ---------- client notes ----------
export const clientNotesRepo = {
  ...makeRepo<ClientNote>(db.clientNotes),
  async forClient(clientId: string) {
    return db.clientNotes.where('clientId').equals(clientId).reverse().sortBy('createdAt')
  },
}

// ---------- programs ----------
export const programsRepo = {
  ...makeRepo<Program>(db.programs),
  async templates() {
    return db.programs.where('status').equals('template').toArray()
  },
  async forClient(clientId: string) {
    return db.programs.where('clientId').equals(clientId).toArray()
  },
  async assignToClient(programId: string, clientId: string, startDate: string) {
    await db.transaction('rw', [db.programs, db.clients], async () => {
      await db.programs.update(programId, { clientId, status: 'active', startDate, updatedAt: nowIso() })
      await db.clients.update(clientId, { activeProgramId: programId, updatedAt: nowIso() })
    })
  },
  /** Deep-duplicate a program (template instantiation / duplicate week uses lib fns). */
  async duplicate(programId: string, overrides: Partial<Program> = {}) {
    const src = await db.programs.get(programId)
    if (!src) throw new Error('Program not found')
    const clone: Program = stamp({
      ...structuredClone(src),
      ...overrides,
      id: newId(),
      sourceTemplateId: src.status === 'template' ? src.id : src.sourceTemplateId,
    })
    // re-key nested ids so dnd/undo identities never collide
    clone.weeks = clone.weeks.map(w => ({
      ...w, id: newId(),
      days: w.days.map(d => ({
        ...d, id: newId(),
        blocks: d.blocks.map(b => ({
          ...b, id: newId(),
          exercises: b.exercises.map(e => ({ ...e, id: newId() })),
        })),
      })),
    }))
    await db.programs.add(clone)
    return clone
  },
}

// ---------- logs ----------
export const logsRepo = {
  ...makeRepo<SessionLog>(db.sessionLogs),
  async forClient(clientId: string) {
    return db.sessionLogs.where('clientId').equals(clientId).reverse().sortBy('date')
  },
  async lastForClient(clientId: string) {
    const all = await db.sessionLogs.where('clientId').equals(clientId).sortBy('date')
    return all.at(-1)
  },
  /** Exercise history across sessions, newest first (history drawer, spec §4.5). */
  async exerciseHistory(clientId: string, exerciseId: string, limit = 5) {
    const logs = await db.sessionLogs.where('clientId').equals(clientId).sortBy('date')
    const hits: { date: string; sets: SessionLog['entries'][number]['sets'] }[] = []
    for (const log of logs.reverse()) {
      const entry = log.entries.find(e => e.exerciseId === exerciseId)
      if (entry) hits.push({ date: log.date, sets: entry.sets })
      if (hits.length >= limit) break
    }
    return hits
  },
}

// ---------- simple repos ----------
export const checkInsRepo = makeRepo(db.checkIns)
export const metricsRepo = {
  ...makeRepo<Metric>(db.metrics),
  async forClient(clientId: string) {
    return db.metrics.where('clientId').equals(clientId).sortBy('date')
  }
}
export const paymentsRepo = makeRepo(db.payments)
export const appointmentsRepo = {
  ...makeRepo(db.appointments),
  /** All series masters + one-offs (occurrences are expanded at read time). */
  async masters() {
    return db.appointments.toArray()
  },
}
export const expensesRepo = makeRepo(db.expenses)

// ---------- waivers (liability audit trail) ----------
export const waiversRepo = {
  ...makeRepo<Waiver>(db.waivers),
  async forClient(clientId: string) {
    return db.waivers.where('clientId').equals(clientId).reverse().sortBy('signedDate')
  },
}

// ---------- paired sync devices ----------
export const devicesRepo = {
  ...makeRepo<Device>(db.devices),
  async all() {
    return db.devices.toArray()
  },
  async forClient(clientId: string) {
    return db.devices.where('clientId').equals(clientId).first()
  },
}

// ---------- messages ----------
export const messagesRepo = {
  ...makeRepo<CoachMessage>(db.messages),
  async forClient(clientId: string) {
    return db.messages.where('clientId').equals(clientId).reverse().sortBy('date')
  },
}
