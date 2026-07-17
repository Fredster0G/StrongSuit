// ===== Sync orchestration (spec §4.23) =====
// Glues the crypto (lib/sync) to the data layer: manages this device's
// identity, builds outbound packets from the tables, and merges inbound ones.
// Coach → client packet carries the client's program + exercises. Client →
// coach packet carries logs + check-ins. Everything is E2EE per pairing.

import { db, ALL_TABLES } from '@/db/schema'
import { trainerRepo, devicesRepo, clientsRepo } from '@/db/repo'
import { makeRepo } from '@/db/repo/base'
import { nowIso, newId } from '@/lib/core'
import {
  generateIdentity, deriveSharedKey, sealSyncPacket, openSyncPacket,
  type PairingCode,
} from '@/lib/sync'
import type { Base, Device, SyncIdentity } from '@/db/types'

/** Get (or lazily create + persist) this device's cryptographic identity. */
export async function getIdentity(): Promise<SyncIdentity> {
  const trainer = await trainerRepo.getOrCreate()
  if (trainer.syncIdentity) return trainer.syncIdentity
  const { publicJwk, privateJwk } = await generateIdentity()
  const identity: SyncIdentity = {
    deviceId: newId(),
    name: trainer.businessName || trainer.trainerName || 'This device',
    publicJwk, privateJwk, createdAt: nowIso(),
  }
  await trainerRepo.patch({ syncIdentity: identity })
  return identity
}

export interface SyncPayload {
  tables: Partial<Record<(typeof ALL_TABLES)[number], Base[]>>
}

/** Tables a coach sends to a specific client's device (program delivery). */
const COACH_TO_CLIENT_TABLES = ['clients', 'programs', 'exercises'] as const
/** Tables a client sends back to the coach (logged work). */
const CLIENT_TO_COACH_TABLES = ['sessionLogs', 'checkIns', 'metrics'] as const

async function collect(tableNames: readonly string[], clientId?: string): Promise<SyncPayload> {
  const out: SyncPayload = { tables: {} }
  for (const name of tableNames) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (db as any)[name]
    let rows: Base[] = await table.toArray()
    if (clientId && name !== 'exercises') {
      rows = rows.filter((r: Base & { clientId?: string; id: string }) =>
        r.clientId === clientId || r.id === clientId)
    }
    out.tables[name as keyof SyncPayload['tables']] = rows
  }
  return out
}

/** Build a sealed outbound packet for a paired device. */
export async function buildPacket(device: Device): Promise<{ filename: string; text: string }> {
  const identity = await getIdentity()
  const key = await deriveSharedKey(identity.privateJwk, device.publicJwk)
  const tableNames = device.role === 'client' ? COACH_TO_CLIENT_TABLES : CLIENT_TO_COACH_TABLES
  const payload = await collect(tableNames, device.clientId)
  const seq = device.outSeq || 1
  const text = await sealSyncPacket(
    key,
    { from: identity.deviceId, to: device.id, seq, createdAt: nowIso() },
    payload,
  )
  await devicesRepo.update(device.id, { outSeq: seq + 1, lastSyncAt: nowIso() })
  return { filename: `coachwright-sync-${new Date().toISOString().slice(0, 10)}.cwsync`, text }
}

export interface ApplyResult { applied: number; skipped: number; replayed: boolean; from: string }

/** Open + merge an inbound packet. Rejects replays (seq ≤ lastSeq). */
export async function applyPacket(device: Device, text: string): Promise<ApplyResult> {
  const identity = await getIdentity()
  const key = await deriveSharedKey(identity.privateJwk, device.publicJwk)
  const packet = await openSyncPacket<SyncPayload>(key, text)

  if (packet.seq <= (device.lastSeq || 0)) {
    return { applied: 0, skipped: 0, replayed: true, from: packet.from }
  }

  let applied = 0, skipped = 0
  for (const [name, rows] of Object.entries(packet.payload.tables)) {
    if (!ALL_TABLES.includes(name as (typeof ALL_TABLES)[number]) || !rows) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (db as any)[name]
    const r = await makeRepo(table).mergeUpsert(rows as Base[])
    applied += r.applied; skipped += r.skipped
  }
  await devicesRepo.update(device.id, { lastSeq: packet.seq, lastSyncAt: nowIso() })
  return { applied, skipped, replayed: false, from: packet.from }
}

/** Save a newly paired device from a scanned/pasted pairing code. */
export async function pairDevice(code: PairingCode, opts: { verified: boolean; clientId?: string }): Promise<Device> {
  const existing = (await devicesRepo.all()).find(d => d.id === code.deviceId)
  const base: Device = {
    id: code.deviceId,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    name: code.name,
    role: code.role,
    clientId: opts.clientId,
    publicJwk: code.pub,
    verified: opts.verified,
    lastSeq: existing?.lastSeq ?? 0,
    outSeq: existing?.outSeq ?? 1,
    lastSyncAt: existing?.lastSyncAt,
  }
  await devicesRepo.table.put(base)
  if (opts.clientId) await clientsRepo.update(opts.clientId, { linkedDeviceId: code.deviceId })
  return base
}
