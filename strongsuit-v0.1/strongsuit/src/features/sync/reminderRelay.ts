// ===== Scheduled reminders over the relay (closes debt #56) =====
// The relay has had /reminders/* since S11 and Companion has polled
// /reminders/due since S13, but nothing coach-side ever called
// /reminders/schedule — the pipe was real and permanently empty.
//
// Same E2EE model as messaging: the reminder body is sealed with the
// coach↔client pairing key before it leaves, so the relay stores and releases
// ciphertext on a timer without ever being able to read it. The payload
// contract is `{ content }`, matching what Companion's `pullReminders`
// already expects — don't change the shape on one side alone.

import { getIdentity } from './syncApi'
import { deriveSharedKey, sealSyncPacket, openSyncPacket } from '@/lib/sync'
import { newId } from '@/lib/core'
import type { Device, Trainer } from '@/db/types'

interface ReminderPayload { content: string }

interface RelayConfig { url: string; apiKey: string }

function relayConfig(trainer: Trainer): RelayConfig | null {
  if (!trainer.syncServerUrl) return null
  return { url: trainer.syncServerUrl.replace(/\/+$/, ''), apiKey: trainer.syncServerApiKey || 'default-coachwright-key' }
}

function requireConfig(trainer: Trainer): RelayConfig {
  const cfg = relayConfig(trainer)
  if (!cfg) throw new Error('Configure a Cloud Sync Server URL in Settings first.')
  return cfg
}

export interface UpcomingReminder {
  id: string
  content: string
  /** ISO timestamp the relay will release it to the client at. */
  sendAt: string
}

/** Seal a reminder and hand it to the relay to release at `sendAt`.
 *  Returns the id, which doubles as the handle for cancelling it. */
export async function scheduleReminder(
  trainer: Trainer, device: Device, content: string, sendAt: Date, id?: string,
): Promise<string> {
  const cfg = requireConfig(trainer)
  const identity = await getIdentity()
  const key = await deriveSharedKey(identity.privateJwk, device.publicJwk)
  const sealed = await sealSyncPacket<ReminderPayload>(
    key,
    { from: identity.deviceId, to: device.id, seq: 0, createdAt: new Date().toISOString() },
    { content },
  )
  const reminderId = id ?? newId()
  const res = await fetch(`${cfg.url}/reminders/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify({
      id: reminderId,
      coachId: identity.deviceId,
      // The relay looks reminders up by the CLIENT DEVICE id, because that's
      // what Companion knows about itself — a client app has no idea what the
      // coach's internal Client.id is (same reasoning as syncApi's remap).
      clientId: device.id,
      encryptedPayload: sealed,
      sendAt: sendAt.toISOString(),
    }),
  })
  if (!res.ok) throw new Error("Couldn't schedule the reminder — check the Cloud Sync Server URL and key in Settings.")
  return reminderId
}

/** Pending reminders for this coach, decrypted for the given client's device.
 *  Reminders for other clients are filtered out rather than surfaced as
 *  undecryptable noise — each client has its own pairing key. */
export async function listUpcomingReminders(trainer: Trainer, device: Device): Promise<UpcomingReminder[]> {
  const cfg = relayConfig(trainer)
  if (!cfg) return []
  const identity = await getIdentity()
  const key = await deriveSharedKey(identity.privateJwk, device.publicJwk)
  const params = new URLSearchParams({ coachId: identity.deviceId })
  const res = await fetch(`${cfg.url}/reminders/upcoming?${params}`, { headers: { 'x-api-key': cfg.apiKey } })
  if (!res.ok) throw new Error("Couldn't load scheduled reminders.")
  const { reminders } = (await res.json()) as {
    reminders: { id: string; clientId: string; encryptedPayload: string; sendAt: string }[]
  }

  const out: UpcomingReminder[] = []
  for (const r of reminders) {
    if (r.clientId !== device.id) continue
    try {
      const packet = await openSyncPacket<ReminderPayload>(key, r.encryptedPayload)
      out.push({ id: r.id, content: packet.payload.content, sendAt: r.sendAt })
    } catch {
      // Sealed for a different pairing, or corrupt — skip it rather than
      // failing the whole list.
    }
  }
  return out.sort((a, b) => a.sendAt.localeCompare(b.sendAt))
}

/** Cancel a reminder that hasn't been released yet. */
export async function cancelReminder(trainer: Trainer, id: string): Promise<void> {
  const cfg = requireConfig(trainer)
  const identity = await getIdentity()
  const params = new URLSearchParams({ coachId: identity.deviceId })
  const res = await fetch(`${cfg.url}/reminders/${encodeURIComponent(id)}?${params}`, {
    method: 'DELETE',
    headers: { 'x-api-key': cfg.apiKey },
  })
  if (res.status === 404) throw new Error('That reminder has already gone out to the client.')
  if (!res.ok) throw new Error("Couldn't cancel the reminder.")
}
