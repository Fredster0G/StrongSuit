// ===== Sync orchestration (spec §4.23) =====
// Glues the crypto (lib/sync) to the data layer: manages this device's
// identity, builds outbound packets from the tables, and merges inbound ones.
// Coach → client packet carries the client's program + exercises. Client →
// coach packet carries logs + check-ins. Everything is E2EE per pairing.

import { db, ALL_TABLES } from '@/db/schema'
import { trainerRepo, devicesRepo, clientsRepo } from '@/db/repo'
import { makeRepo } from '@/db/repo/base'
import { nowIso, newId, stamp } from '@/lib/core'
import { policyFor, type Conflict } from '@/lib/conflict'
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

/** Tables a coach sends to a specific client's device (program delivery +
 *  the message thread, so messaging works over ANY transport — file, LAN,
 *  or relay — not just the live relay path). */
const COACH_TO_CLIENT_TABLES = ['clients', 'programs', 'exercises', 'messages'] as const
/** Tables a client sends back to the coach (logged work + their side of the
 *  message thread). */
const CLIENT_TO_COACH_TABLES = ['sessionLogs', 'checkIns', 'metrics', 'messages'] as const

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

export interface ApplyResult {
  applied: number
  skipped: number
  /** Rows the merge refused to decide — parked for a human (§7). Optional so
   *  existing callers that don't read it still typecheck. */
  conflicted?: number
  replayed: boolean
  from: string
}

/** Park a row two devices disagree about. Idempotent per (table, rowId): a
 *  repeated sync of the same disagreement updates the parked copy rather than
 *  stacking duplicates in the coach's face. */
async function recordConflict(
  table: string,
  c: { incoming: Base; existing: Base; reason: string },
  fromDeviceId: string,
): Promise<void> {
  const existingRow = await db.syncConflicts
    .where('rowId').equals(c.incoming.id)
    .filter(r => r.table === table && !r.resolvedAt)
    .first()
  const payload = {
    table,
    rowId: c.incoming.id,
    incomingJson: JSON.stringify(c.incoming),
    existingJson: JSON.stringify(c.existing),
    reason: c.reason,
    fromDeviceId,
  }
  if (existingRow) {
    await db.syncConflicts.update(existingRow.id, { ...payload, updatedAt: nowIso() })
  } else {
    await db.syncConflicts.add(stamp(payload as unknown as Conflict))
  }
}

/** Unresolved conflicts, newest first. Drives the Conflicts view and the
 *  badge that tells a coach there is something to settle. */
export async function pendingConflicts(): Promise<Conflict[]> {
  const all = await db.syncConflicts.toArray()
  return all.filter(c => !c.resolvedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Settle one conflict by choosing a side.
 *
 * Choosing `incoming` writes it; choosing `existing` writes nothing, because
 * the stored row was never touched — the merge parked the disagreement
 * instead of applying it. That asymmetry is the point of the whole design.
 */
export async function resolveConflict(conflictId: string, choose: 'incoming' | 'existing'): Promise<void> {
  const c = await db.syncConflicts.get(conflictId)
  if (!c) return
  if (choose === 'incoming') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (db as any)[c.table]
    if (table) await table.put(JSON.parse(c.incomingJson))
  }
  await db.syncConflicts.update(conflictId, { resolvedAt: nowIso(), resolvedAs: choose, updatedAt: nowIso() })
}

/** A genuine client-side app (Companion) doesn't know the coach's internal
 *  `Client.id` for its own user — it can only stamp its own device id as a
 *  placeholder on rows it pushes. Remap that onto the real, coach-known
 *  `Client.id` (from the `Device.clientId` link made when the coach accepted
 *  the pairing) before merging — otherwise synced logs land under an id no
 *  `Client` row actually has and never show up anywhere in the coach's UI.
 *  Only applies to genuine client devices with a linked Client; a coach's own
 *  second device already sends rows with the correct real clientId and must
 *  NOT be rewritten. */
export function remapClientId<T extends Base>(rows: T[], device: Device): T[] {
  if (device.role !== 'client' || !device.clientId) return rows
  return rows.map(r => ('clientId' in r ? { ...r, clientId: device.clientId! } : r))
}

/** Open + merge an inbound packet. Rejects replays (seq ≤ lastSeq). Handles
 *  BOTH transports identically — this is called from the cloud-relay pull
 *  (`SyncCenterPage.tsx`'s `doCloudSync`) and from a manually-imported
 *  `.cwsync` file (`DeviceRow`'s `onFile`) alike, so the clientId remap
 *  below applies no matter which hosting tier (or none) got the packet here. */
export async function applyPacket(device: Device, text: string): Promise<ApplyResult> {
  const identity = await getIdentity()
  const key = await deriveSharedKey(identity.privateJwk, device.publicJwk)
  const packet = await openSyncPacket<SyncPayload>(key, text)

  if (packet.seq <= (device.lastSeq || 0)) {
    return { applied: 0, skipped: 0, replayed: true, from: packet.from }
  }

  let applied = 0, skipped = 0, conflicted = 0
  for (const [name, rows] of Object.entries(packet.payload.tables)) {
    if (!ALL_TABLES.includes(name as (typeof ALL_TABLES)[number]) || !rows) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (db as any)[name]
    const remapped = remapClientId(rows as (Base & { clientId?: string })[], device)
    // Per-table policy (docs/plans/01-CONNECTIVITY.md §7): session logs merge
    // their entries instead of being replaced wholesale, and money is never
    // auto-resolved. Without this, two trainers logging the same client
    // silently overwrite one another.
    const r = await makeRepo(table).mergeUpsert(remapped as Base[], policyFor(name))
    applied += r.applied; skipped += r.skipped
    for (const c of r.conflicts) {
      await recordConflict(name, c, packet.from)
      conflicted++
    }
  }
  await devicesRepo.update(device.id, { lastSeq: packet.seq, lastSyncAt: nowIso() })
  return { applied, skipped, conflicted, replayed: false, from: packet.from }
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
