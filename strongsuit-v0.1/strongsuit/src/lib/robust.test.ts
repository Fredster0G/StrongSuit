import { describe, it, expect } from 'vitest'
import {
  generateIdentity, deriveSharedKey, safetyNumber, encodePairingCode, decodePairingCode,
  sealSyncPacket, openSyncPacket, isSyncPacket, sha256Hex,
} from './sync'
import { goalPlan, ALL_GOALS } from './goals'
import { sessionLoad, acwr, monotonyStrain, strengthStanding, type DayLoad } from './trainingLoad'
import { screen, PARQ_QUESTIONS, assumptionOfRiskText } from './parq'
import { expandAppointment, expandAll, describeRule } from './schedule'
import type { Appointment } from '@/db/types'

// ---------------- secure sync ----------------
describe('secure sync (E2EE)', () => {
  it('two devices derive the same key and safety number, and exchange a sealed packet', async () => {
    const coach = await generateIdentity()
    const client = await generateIdentity()

    // both derive the shared key from their own private + peer public
    const kCoach = await deriveSharedKey(coach.privateJwk, client.publicJwk)
    const kClient = await deriveSharedKey(client.privateJwk, coach.publicJwk)

    // safety numbers match on both sides (order-independent)
    const sasA = await safetyNumber(coach.publicJwk, client.publicJwk)
    const sasB = await safetyNumber(client.publicJwk, coach.publicJwk)
    expect(sasA).toBe(sasB)
    expect(sasA).toMatch(/^\d{6}$/)

    // coach seals a packet; client opens it
    const meta = { from: 'coach', to: 'client', seq: 1, createdAt: '2026-07-16T00:00:00Z' }
    const packet = await sealSyncPacket(kCoach, meta, { logs: [{ id: 'a', reps: 5 }] })
    expect(isSyncPacket(packet)).toBe(true)
    const opened = await openSyncPacket<{ logs: { id: string; reps: number }[] }>(kClient, packet)
    expect(opened.from).toBe('coach')
    expect(opened.seq).toBe(1)
    expect(opened.payload.logs[0].reps).toBe(5)
  })

  it('a packet cannot be opened with the wrong pairing', async () => {
    const a = await generateIdentity()
    const b = await generateIdentity()
    const c = await generateIdentity()
    const kAB = await deriveSharedKey(a.privateJwk, b.publicJwk)
    const kAC = await deriveSharedKey(a.privateJwk, c.publicJwk)
    const packet = await sealSyncPacket(kAB, { from: 'a', to: 'b', seq: 1, createdAt: 'x' }, { secret: 42 })
    await expect(openSyncPacket(kAC, packet)).rejects.toThrow(/different pairing|altered/)
  })

  it('tampering with the ciphertext is detected', async () => {
    const a = await generateIdentity(); const b = await generateIdentity()
    const k = await deriveSharedKey(a.privateJwk, b.publicJwk)
    const packet = await sealSyncPacket(k, { from: 'a', to: 'b', seq: 1, createdAt: 'x' }, { n: 1 })
    const lines = packet.split('\n')
    lines[2] = lines[2].slice(0, -2) + (lines[2].endsWith('AA') ? 'BB' : 'AA') // flip ciphertext tail
    await expect(openSyncPacket(k, lines.join('\n'))).rejects.toThrow()
  })

  it('pairing codes round-trip and reject junk', () => {
    const enc = encodePairingCode({ v: 1, deviceId: 'd1', name: 'Coach iPad', role: 'coach', pub: { kty: 'EC', x: 'a', y: 'b' } })
    const dec = decodePairingCode(enc)
    expect(dec.deviceId).toBe('d1')
    expect(dec.role).toBe('coach')
    expect(() => decodePairingCode('not-a-code')).toThrow()
  })

  it('sha256Hex is stable', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

// ---------------- goal engine ----------------
describe('goal engine', () => {
  it('every goal has coherent, cited targets', () => {
    for (const g of ALL_GOALS) {
      const p = goalPlan(g)
      expect(p.repRange[0]).toBeLessThanOrEqual(p.repRange[1])
      expect(p.intensityPct[0]).toBeLessThanOrEqual(p.intensityPct[1])
      expect(p.proteinPerKg).toBeGreaterThanOrEqual(1.4)
      expect(p.rationale.length).toBeGreaterThanOrEqual(2)
      for (const r of p.rationale) expect(r.source.length).toBeGreaterThan(8)
    }
  })
  it('goals map to sensible nutrition and rep ranges', () => {
    expect(goalPlan('strength').repRange[1]).toBeLessThanOrEqual(6)
    expect(goalPlan('endurance').repRange[0]).toBeGreaterThanOrEqual(12)
    expect(goalPlan('fat-loss').calorieAdjustmentPct).toBeLessThan(0)
    expect(goalPlan('fat-loss').nutritionGoal).toBe('cut')
    expect(goalPlan('lean-gain').calorieAdjustmentPct).toBeGreaterThan(0)
    expect(goalPlan('hypertrophy').setsPerMusclePerWeek[0]).toBeGreaterThanOrEqual(10)
  })
})

// ---------------- training load ----------------
describe('training load', () => {
  const build = (weeks: number, perWeek: number, load: number, today: string): DayLoad[] => {
    const out: DayLoad[] = []
    const end = new Date(today + 'T00:00:00')
    for (let d = 0; d < weeks * 7; d++) {
      const day = new Date(end); day.setDate(end.getDate() - d)
      if (day.getDay() % Math.max(1, Math.floor(7 / perWeek)) === 0) out.push({ date: day.toISOString().slice(0, 10), load })
    }
    return out
  }

  it('sessionLoad = rpe × minutes', () => {
    expect(sessionLoad(8, 60)).toBe(480)
  })

  it('steady training lands in the ACWR sweet spot; a spike reads danger', () => {
    const steady = build(4, 3, 300, '2026-07-16')
    const a = acwr(steady, '2026-07-16')
    expect(a.zone).toBe('sweet-spot')
    expect(a.ratio).toBeGreaterThanOrEqual(0.8)
    expect(a.ratio).toBeLessThanOrEqual(1.3)

    // chronic base + a big acute spike this week
    const spike: DayLoad[] = [
      ...build(4, 3, 200, '2026-07-16'),
      { date: '2026-07-15', load: 3000 }, { date: '2026-07-14', load: 3000 },
    ]
    expect(acwr(spike, '2026-07-16').ratio).toBeGreaterThan(1.5)
    expect(acwr(spike, '2026-07-16').zone).toBe('danger')
  })

  it('empty history is flagged as insufficient', () => {
    expect(acwr([], '2026-07-16').zone).toBe('detraining')
  })

  it('monotony rises when every day is identical', () => {
    const flat: DayLoad[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date('2026-07-16T00:00:00'); d.setDate(16 - i)
      return { date: d.toISOString().slice(0, 10), load: 300 }
    })
    expect(monotonyStrain(flat, '2026-07-16').monotony).toBeGreaterThan(2)
  })

  it('places strength standards by bodyweight ratio', () => {
    expect(strengthStanding('squat', 160, 100, 'male')?.level).toBe('intermediate') // 1.6×
    expect(strengthStanding('squat', 200, 100, 'male')?.level).toBe('advanced')      // 2.0×
    expect(strengthStanding('bench', 220, 100, 'male')?.level).toBe('elite')         // 2.2×
    expect(strengthStanding('deadlift', 90, 100, 'male')?.level).toBe('untrained')   // 0.9×
    expect(strengthStanding('squat', 0, 100, 'male')).toBeNull()
  })
})

// ---------------- PAR-Q ----------------
describe('PAR-Q screening', () => {
  it('all-no clears; any yes flags and lists it', () => {
    const noAll = screen(PARQ_QUESTIONS.map(q => ({ q, yes: false })))
    expect(noAll.cleared).toBe(true)
    expect(noAll.flags).toHaveLength(0)

    const withYes = screen(PARQ_QUESTIONS.map((q, i) => ({ q, yes: i === 1 })))
    expect(withYes.cleared).toBe(false)
    expect(withYes.flags).toHaveLength(1)
  })
  it('liability template names the parties', () => {
    const txt = assumptionOfRiskText('Iron Works', 'Jordan Reyes')
    expect(txt).toContain('Jordan Reyes')
    expect(txt).toContain('Iron Works')
    expect(txt.toLowerCase()).toContain('assume')
  })
})

// ---------------- recurring schedule ----------------
const appt = (over: Partial<Appointment>): Appointment => ({
  id: 'm1', createdAt: '', updatedAt: '', title: 'Session',
  start: '2026-07-06T09:00:00.000Z', end: '2026-07-06T10:00:00.000Z', ...over,
})

describe('recurring schedule', () => {
  it('a one-off appears once, inside its window only', () => {
    const a = appt({})
    expect(expandAppointment(a, '2026-07-01', '2026-07-31')).toHaveLength(1)
    expect(expandAppointment(a, '2026-08-01', '2026-08-31')).toHaveLength(0)
  })

  it('weekly recurrence produces one per week until the end date', () => {
    const a = appt({ recurrenceRule: { freq: 'weekly', until: '2026-08-03' } })
    const occ = expandAppointment(a, '2026-07-01', '2026-08-31')
    // Jul 6, 13, 20, 27, Aug 3
    expect(occ.map(o => o.date)).toEqual(['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03'])
    expect(occ.every(o => o.isRecurring)).toBe(true)
  })

  it('count limits the series; biweekly steps two weeks', () => {
    const a = appt({ recurrenceRule: { freq: 'biweekly', count: 3 } })
    const occ = expandAppointment(a, '2026-07-01', '2026-12-31')
    expect(occ.map(o => o.date)).toEqual(['2026-07-06', '2026-07-20', '2026-08-03'])
  })

  it('multi-weekday weekly (Mon/Wed/Fri)', () => {
    // master start Mon 2026-07-06; byWeekday Mon(1) Wed(3) Fri(5)
    const a = appt({ recurrenceRule: { freq: 'weekly', byWeekday: [1, 3, 5], count: 3 } })
    const occ = expandAppointment(a, '2026-07-06', '2026-07-12')
    expect(occ.map(o => o.date)).toEqual(['2026-07-06', '2026-07-08', '2026-07-10'])
  })

  it('exceptions remove a single occurrence (cancel one in a series)', () => {
    const a = appt({ recurrenceRule: { freq: 'weekly', count: 4 }, exceptions: ['2026-07-13'] })
    const occ = expandAppointment(a, '2026-07-01', '2026-08-31')
    expect(occ.map(o => o.date)).toEqual(['2026-07-06', '2026-07-20', '2026-07-27'])
  })

  it('expandAll merges + sorts, and describeRule reads for humans', () => {
    const all = expandAll([
      appt({ id: 'x', start: '2026-07-10T12:00:00.000Z', end: '2026-07-10T13:00:00.000Z' }),
      appt({ id: 'y', recurrenceRule: { freq: 'weekly', count: 2 } }),
    ], '2026-07-01', '2026-07-31')
    expect(all.length).toBe(3)
    expect(all[0].start <= all[1].start).toBe(true)
    expect(describeRule({ freq: 'weekly', byWeekday: [1, 3], until: '2026-09-01' })).toContain('Mon')
    expect(describeRule(undefined)).toBe('One-time')
  })
})
