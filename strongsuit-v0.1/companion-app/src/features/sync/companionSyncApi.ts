// ===== Real sync against the coach, from the client side =====
// See docs/CLIENT_APP_STRATEGY.md §3.5/§7 for the full pairing → transport →
// merge flow. One payload shape each direction, one merge function each
// side, and THREE interchangeable transports carrying it:
//   1. the coach's relay (self-hosted or managed) — `syncNow`
//   2. the coach's desktop app over the same WiFi network — `syncOverLan`
//      (no server anywhere; the Electron app hosts a LAN endpoint)
//   3. a sealed file moved any way at all — `exportLogsFile` out,
//      `importCoachPacketText` in
// Outbound rows are pushed in the coach app's own SessionLog/Metric/
// CoachMessage shapes (the coach side's `applyPacket` + `remapClientId`
// merge them, whichever transport delivered them). Inbound coach packets
// (programs, exercises, messages, this client's own Client row) all land in
// `applyCoachPacket` below — same replay guard and newest-wins merge the
// coach app uses.

import { deriveSharedKey, sealSyncPacket, openSyncPacket, isSyncPacket } from '@/lib/sync'
import {
  profileRepo, coachLinkRepo, workoutsRepo, metricsRepo, messagesRepo,
  assignedProgramsRepo, coachExercisesRepo,
} from '@/db/repo'
import { nowIso } from '@/lib/core'
import type { CoachLink, AssignedProgram, CoachExercise } from '@/db/types'

function relayConfig(link: CoachLink) {
  if (!link.relayUrl) return null
  return { url: link.relayUrl.replace(/\/+$/, ''), apiKey: link.relayApiKey || 'default-coachwright-key' }
}

// ---- logged workouts/metrics → coach (best-effort shape match, see header) ----

interface CoachSessionLogRow {
  id: string; createdAt: string; updatedAt: string
  clientId: string; date: string; title: string
  entries: { exerciseId: string; sets: { reps: number; load?: number; rpe?: number }[] }[]
  source: 'companion-import'
}
interface CoachMetricRow {
  id: string; createdAt: string; updatedAt: string
  clientId: string; date: string; type: string; key: string; value: number; unit: string
}
/** The coach app's CoachMessage shape — outbound rows carry this client's
 *  side of the thread so messaging survives with NO relay at all (a fully
 *  local coach gets messages inside the same file/LAN packet as the logs). */
interface CoachMessageRow {
  id: string; createdAt: string; updatedAt: string
  clientId: string; date: string; direction: 'inbound' | 'outbound'
  channel: 'app'; content: string
}
interface OutboundPayload {
  tables: { sessionLogs: CoachSessionLogRow[]; metrics: CoachMetricRow[]; messages: CoachMessageRow[] }
}

/** Builds and seals the same client→coach payload regardless of how it's
 *  going to travel (network relay or a manually-shared file) — one shape,
 *  two transports, so a coach can mix file and network sync for the same
 *  pairing without the merge logic caring which one delivered a given
 *  packet. `clientId` is stamped as this device's OWN deviceId — a
 *  stand-in `applyPacket`'s `remapClientId` (coach app, `syncApi.ts`)
 *  rewrites onto the real `Client.id` before merging, either way. */
async function buildOutboundLogsPacket(coachLink: CoachLink): Promise<string> {
  const identity = await profileRepo.getOrCreateIdentity()
  const key = await deriveSharedKey(identity.privateJwk, coachLink.coachPublicJwk)
  const [workouts, metrics, allMessages] = await Promise.all([
    workoutsRepo.all(), metricsRepo.all(), messagesRepo.all(),
  ])

  const payload: OutboundPayload = {
    tables: {
      sessionLogs: workouts.map(w => ({
        id: w.id, createdAt: w.createdAt, updatedAt: w.updatedAt,
        clientId: identity.deviceId, date: w.date, title: w.title,
        entries: w.exercises.map(e => ({ exerciseId: e.name, sets: e.sets })),
        source: 'companion-import',
      })),
      metrics: metrics.map(m => ({
        id: m.id, createdAt: m.createdAt, updatedAt: m.updatedAt,
        clientId: identity.deviceId, date: m.date,
        type: m.type === 'bodyfat' ? 'bodyfat' : 'measurement',
        key: m.type, value: m.value, unit: m.type === 'bodyfat' ? '%' : '',
      })),
      // Only THIS side's authored messages — the coach's own come back in
      // their packet under the same ids, so neither side ever re-imports an
      // echo of something it wrote.
      messages: allMessages.filter(m => m.direction === 'to-coach').map(m => ({
        id: m.id, createdAt: m.createdAt, updatedAt: m.createdAt,
        clientId: identity.deviceId, date: m.createdAt,
        direction: 'inbound' as const, channel: 'app' as const, content: m.content,
      })),
    },
  }
  return sealSyncPacket(key, { from: identity.deviceId, to: coachLink.coachDeviceId, seq: Date.now(), createdAt: nowIso() }, payload)
}

/** The same sealed payload every other path sends, exposed for the P2P
 *  transport (`p2pClient.ts`).
 *
 *  Deliberately the SAME builder rather than a P2P-specific one: one payload
 *  shape, many pipes, is the rule this whole sync design rests on — and it is
 *  also what keeps cycle data out of P2P for free, since the shape simply has
 *  no field for it. */
export function buildOutboundPacketForP2p(coachLink: CoachLink): Promise<string> {
  return buildOutboundLogsPacket(coachLink)
}

// ---- coach → client: the one merge point, whatever transport delivered it ----

/** What a coach packet carries (built by the coach app's `buildPacket` for a
 *  client-role device): this client's own Client row, assigned programs, the
 *  exercise library rows they reference, and the coach's side of the message
 *  thread. Shapes are the coach app's own — stored as-is. */
interface InboundCoachPayload {
  tables: {
    clients?: { id: string; firstName?: string; lastName?: string }[]
    programs?: AssignedProgram[]
    exercises?: CoachExercise[]
    messages?: CoachMessageRow[]
  }
}

export interface CoachApplyResult {
  replayed: boolean
  programs: number
  messages: number
}

/** Open + merge a sealed coach packet. The exact counterpart of the coach
 *  app's `applyPacket`: replay guard first (seq ≤ lastSeqFromCoach = already
 *  merged), then newest-wins merges per table. Every inbound transport —
 *  relay pull, LAN response, imported file — funnels through here, which is
 *  what keeps the three hosting tiers from drifting into three protocols. */
export async function applyCoachPacket(coachLink: CoachLink, text: string): Promise<CoachApplyResult> {
  const identity = await profileRepo.getOrCreateIdentity()
  const key = await deriveSharedKey(identity.privateJwk, coachLink.coachPublicJwk)
  const packet = await openSyncPacket<InboundCoachPayload>(key, text)

  if (packet.from !== coachLink.coachDeviceId) {
    throw new Error("That packet wasn't sealed by your paired coach.")
  }
  if (packet.seq <= (coachLink.lastSeqFromCoach || 0)) {
    return { replayed: true, programs: 0, messages: 0 }
  }

  const t = packet.payload.tables || {}
  const programs = await assignedProgramsRepo.mergeUpsert(t.programs ?? [])
  await coachExercisesRepo.mergeUpsert(t.exercises ?? [])

  // Coach-authored messages only (direction 'outbound' in the coach's
  // schema) — this side's own messages come back under known ids and would
  // merge harmlessly, but skipping them avoids flipping their direction.
  let messages = 0
  for (const m of t.messages ?? []) {
    if (m.direction !== 'outbound') continue
    if (await messagesRepo.has(m.id)) continue
    await messagesRepo.put({ id: m.id, direction: 'from-coach', content: m.content, createdAt: m.date })
    messages++
  }

  const myRow = (t.clients ?? [])[0]
  await coachLinkRepo.patch(coachLink.id, {
    lastSeqFromCoach: packet.seq,
    lastSyncAt: nowIso(),
    ...(myRow ? { clientIdOnCoachSide: myRow.id } : {}),
  })
  return { replayed: false, programs, messages }
}

/** Pull the coach's latest packet off their relay (it sits under THIS
 *  device's id, type 'coach' — the coach pushes one per paired client). */
export async function pullFromCoach(coachLink: CoachLink): Promise<CoachApplyResult | null> {
  const cfg = relayConfig(coachLink)
  if (!cfg) return null
  const identity = await profileRepo.getOrCreateIdentity()
  const res = await fetch(`${cfg.url}/sync/pull/coach/${identity.deviceId}`, { headers: { 'x-api-key': cfg.apiKey } })
  if (!res.ok) throw new Error("Couldn't reach the coach's server to check for updates.")
  const { encryptedPayload } = (await res.json()) as { encryptedPayload: string | null }
  if (!encryptedPayload) return null
  return applyCoachPacket(coachLink, encryptedPayload)
}

/** The fully-local inbound path: the coach used Studio Link's "Local Export"
 *  for this device and sent the .cwsync file over — same merge as the
 *  network paths. */
export async function importCoachPacketText(coachLink: CoachLink, text: string): Promise<CoachApplyResult> {
  if (!isSyncPacket(text.trim())) throw new Error("That file isn't a Coachwright sync packet.")
  return applyCoachPacket(coachLink, text.trim())
}

// ---- LAN sync — the no-server, same-WiFi transport ----

/** Push this device's packet straight to the coach's desktop app on the
 *  local network (their WiFi Sync dialog shows the address as a QR code) and
 *  merge the coach packet that comes back in the same response. Nothing
 *  transits the internet; the payloads are the same sealed packets as every
 *  other transport. */
export async function syncOverLan(coachLink: CoachLink, lanUrl: string): Promise<CoachApplyResult> {
  const url = lanUrl.trim().replace(/\/+$/, '')
  const identity = await profileRepo.getOrCreateIdentity()
  const sealed = await buildOutboundLogsPacket(coachLink)
  let res: Response
  try {
    res = await fetch(`${url}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: identity.deviceId, text: sealed }),
    })
  } catch {
    throw new Error("Couldn't reach the coach's computer — same WiFi network, and is their sync server running?")
  }
  const data = (await res.json().catch(() => null)) as { success: boolean; message?: string } | null
  if (!res.ok || !data?.success) {
    throw new Error(data?.message === 'Device not paired'
      ? "The coach's app doesn't recognize this device — pair it in their Studio Link first."
      : "The coach's app couldn't apply the sync — try again, or export a file instead.")
  }
  await coachLinkRepo.patch(coachLink.id, { lanUrl: url, lastSyncAt: nowIso() })
  if (data.message && isSyncPacket(data.message)) {
    return applyCoachPacket({ ...coachLink, lanUrl: url }, data.message)
  }
  return { replayed: false, programs: 0, messages: 0 }
}

/** Seals and pushes this device's logged workouts/metrics to the coach's
 *  relay. Only works when the coach actually has one configured (self-
 *  hosted or managed) — for a fully-local coach, use `exportLogsFile`
 *  instead; see docs/CLIENT_APP_STRATEGY.md §7 for which tier uses which. */
export async function pushLogsToCoach(coachLink: CoachLink): Promise<void> {
  const cfg = relayConfig(coachLink)
  if (!cfg) throw new Error("This coach hasn't given you a server address yet — export a file instead, or ask them for their Cloud Sync Server URL.")
  const sealed = await buildOutboundLogsPacket(coachLink)
  const identity = await profileRepo.getOrCreateIdentity()
  const res = await fetch(`${cfg.url}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify({ id: identity.deviceId, type: 'client', coachId: coachLink.coachDeviceId, encryptedPayload: sealed }),
  })
  if (!res.ok) throw new Error("Couldn't reach the coach's server — check the address and try again.")
  await coachLinkRepo.patch(coachLink.id, { lastSyncAt: nowIso() })
}

/** The fully-local fallback: seals the exact same payload `pushLogsToCoach`
 *  would push, but hands back sealed text to save as a file instead of
 *  POSTing it anywhere. The coach drops the resulting file onto their
 *  existing "Local Import" button (Studio Link → this device) — that
 *  already calls the same `applyPacket`/`remapClientId` merge logic the
 *  network path uses, so this needs zero coach-side changes to work. */
export async function exportLogsFile(coachLink: CoachLink): Promise<{ filename: string; text: string }> {
  const sealed = await buildOutboundLogsPacket(coachLink)
  await coachLinkRepo.patch(coachLink.id, { lastSyncAt: nowIso() })
  return { filename: `companion-sync-${new Date().toISOString().slice(0, 10)}.cwsync`, text: sealed }
}

// ---- messages — fully interoperable with the coach app's messageRelay.ts today ----

interface RelayMessagePayload { content: string }

/** Send a message to the coach. Saved locally FIRST under a stable id (the
 *  same id travels over the relay and inside sync packets, so no transport
 *  can double-deliver it). With a relay configured it's delivered live —
 *  mirrors messageRelay.ts's `pushRelayMessage` exactly, `direction:
 *  'client'` instead of `'coach'`. Without one it's not an error: the
 *  message is queued and rides the next sync packet (WiFi or file) like
 *  everything else a fully-local coach receives.
 *  Returns true if delivered live, false if queued for the next sync. */
export async function pushMessageToCoach(coachLink: CoachLink, content: string): Promise<boolean> {
  const row = await messagesRepo.create({ direction: 'to-coach', content })
  const cfg = relayConfig(coachLink)
  if (!cfg) return false

  const identity = await profileRepo.getOrCreateIdentity()
  const key = await deriveSharedKey(identity.privateJwk, coachLink.coachPublicJwk)
  const sealed = await sealSyncPacket<RelayMessagePayload>(
    key,
    { from: identity.deviceId, to: coachLink.coachDeviceId, seq: 0, createdAt: nowIso() },
    { content },
  )
  const res = await fetch(`${cfg.url}/messages/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify({ id: row.id, coachId: coachLink.coachDeviceId, clientId: identity.deviceId, direction: 'client', encryptedPayload: sealed }),
  })
  if (!res.ok) throw new Error("Saved, but couldn't deliver — check the coach's server address. It'll go out with your next sync either way.")
  return true
}

/** Pull + decrypt any coach→client messages since a given ISO timestamp,
 *  and save them locally. Mirrors `pullRelayMessages`'s query shape with
 *  `for: 'client'` — the coach app's existing `pushRelayMessage` already
 *  writes messages in the shape this expects. */
export async function pullMessagesFromCoach(coachLink: CoachLink, since?: string): Promise<number> {
  const cfg = relayConfig(coachLink)
  if (!cfg) return 0
  const identity = await profileRepo.getOrCreateIdentity()
  const key = await deriveSharedKey(identity.privateJwk, coachLink.coachPublicJwk)
  const params = new URLSearchParams({
    coachId: coachLink.coachDeviceId, clientId: identity.deviceId, for: 'client',
    ...(since ? { since } : {}),
  })
  const res = await fetch(`${cfg.url}/messages/pull?${params}`, { headers: { 'x-api-key': cfg.apiKey } })
  if (!res.ok) throw new Error("Couldn't check for new messages.")
  const { messages } = (await res.json()) as { messages: { id: string; encryptedPayload: string; createdAt: string }[] }

  let count = 0
  for (const m of messages) {
    try {
      const packet = await openSyncPacket<RelayMessagePayload>(key, m.encryptedPayload)
      // Keep the relay row's id — it's the coach's own message id, so a copy
      // arriving later inside a sync packet lands on this same row.
      if (await messagesRepo.has(m.id)) continue
      await messagesRepo.put({ id: m.id, direction: 'from-coach', content: packet.payload.content, createdAt: m.createdAt })
      count++
    } catch {
      // wrong pairing or corrupted — skip, don't fail the whole pull
    }
  }
  if (count) await coachLinkRepo.patch(coachLink.id, { lastSyncAt: nowIso() })
  return count
}

/** Poll `/reminders/due` and surface anything due as a coach message
 *  ("Reminder: …"), deduped by the reminder's own id. The server marks
 *  fetched reminders sent, so a reminder is delivered exactly once. NOTE:
 *  the coach app has no scheduling UI yet (PROGRESS debt #56) — the payload
 *  contract is `{ content }` sealed with the pairing key, same as messages;
 *  build the coach-side composer against that. */
export async function pullReminders(coachLink: CoachLink): Promise<number> {
  const cfg = relayConfig(coachLink)
  if (!cfg) return 0
  const identity = await profileRepo.getOrCreateIdentity()
  const key = await deriveSharedKey(identity.privateJwk, coachLink.coachPublicJwk)
  const res = await fetch(`${cfg.url}/reminders/due?clientId=${identity.deviceId}`, { headers: { 'x-api-key': cfg.apiKey } })
  if (!res.ok) return 0
  const { reminders } = (await res.json()) as { reminders: { id: string; encryptedPayload: string; sendAt: string }[] }
  let count = 0
  for (const r of reminders) {
    try {
      const packet = await openSyncPacket<RelayMessagePayload>(key, r.encryptedPayload)
      if (await messagesRepo.has(r.id)) continue
      await messagesRepo.put({ id: r.id, direction: 'from-coach', content: `Reminder: ${packet.payload.content}`, createdAt: r.sendAt })
      count++
    } catch { /* wrong pairing or corrupted — skip */ }
  }
  return count
}

/** Full "Sync now" over the relay — push what's been logged, pull the
 *  coach's packet (program, messages), and drain the live message queue.
 *  Called on demand (no push infrastructure exists, so this only ever runs
 *  when the app is open — see SERVER_STRATEGY.md §2.5). */
export async function syncNow(coachLink: CoachLink): Promise<{ pulled: number; programs: number }> {
  await pushLogsToCoach(coachLink)
  const coachSide = await pullFromCoach(coachLink)
  const pulled = await pullMessagesFromCoach(coachLink, coachLink.lastSyncAt)
  return {
    pulled: pulled + (coachSide?.messages ?? 0),
    programs: coachSide?.programs ?? 0,
  }
}
