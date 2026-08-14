// ===== Over-the-server messaging (spec: managed/self-hosted relay tier) =====
// Rides the same E2EE pairing as device sync (`lib/sync.ts`) — a message is
// just another sealed packet, sent through `sync-server`'s /messages/*
// endpoints instead of /sync/*. The server only ever stores/forwards
// ciphertext; it can't read message content any more than it can read a
// synced program. Requires the client to already be a paired Device
// (Studio Link / WiFi Sync) and a Cloud Sync Server URL configured.

import { getIdentity } from './syncApi'
import { deriveSharedKey, sealSyncPacket, openSyncPacket } from '@/lib/sync'
import { newId } from '@/lib/core'
import type { Device, Trainer } from '@/db/types'

interface RelayMessagePayload { content: string }

interface RelayConfig { url: string; apiKey: string }

function relayConfig(trainer: Trainer): RelayConfig | null {
  if (!trainer.syncServerUrl) return null
  return { url: trainer.syncServerUrl.replace(/\/+$/, ''), apiKey: trainer.syncServerApiKey || 'default-coachwright-key' }
}

/** Seal and push a message to a paired client's device over the relay.
 *  `id` should be the local CoachMessage row's id — the relay row reuses it
 *  so the same message arriving later inside a sync packet (file/LAN/cloud)
 *  merges onto the same row instead of duplicating the thread. */
export async function pushRelayMessage(trainer: Trainer, device: Device, clientId: string, content: string, id?: string): Promise<void> {
  const cfg = relayConfig(trainer)
  if (!cfg) throw new Error('Configure a Cloud Sync Server URL in Settings first.')
  const identity = await getIdentity()
  const key = await deriveSharedKey(identity.privateJwk, device.publicJwk)
  const sealed = await sealSyncPacket<RelayMessagePayload>(
    key,
    { from: identity.deviceId, to: device.id, seq: 0, createdAt: new Date().toISOString() },
    { content },
  )
  const res = await fetch(`${cfg.url}/messages/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify({ id: id ?? newId(), coachId: identity.deviceId, clientId, direction: 'coach', encryptedPayload: sealed }),
  })
  if (!res.ok) throw new Error("Couldn't send — check the Cloud Sync Server URL and key in Settings.")
}

export interface PulledRelayMessage { id: string; content: string; createdAt: string }

/** Pull + decrypt any client→coach messages since a given ISO timestamp.
 *  Skips (rather than throws on) any packet that fails to decrypt — wrong
 *  pairing or corruption shouldn't block the rest of the inbox. */
export async function pullRelayMessages(trainer: Trainer, device: Device, clientId: string, since?: string): Promise<PulledRelayMessage[]> {
  const cfg = relayConfig(trainer)
  if (!cfg) return []
  const identity = await getIdentity()
  const key = await deriveSharedKey(identity.privateJwk, device.publicJwk)
  const params = new URLSearchParams({ coachId: identity.deviceId, clientId, for: 'coach', ...(since ? { since } : {}) })
  const res = await fetch(`${cfg.url}/messages/pull?${params}`, { headers: { 'x-api-key': cfg.apiKey } })
  if (!res.ok) throw new Error("Couldn't check for new messages.")
  const { messages } = (await res.json()) as { messages: { id: string; encryptedPayload: string; createdAt: string }[] }

  const out: PulledRelayMessage[] = []
  for (const m of messages) {
    try {
      const packet = await openSyncPacket<RelayMessagePayload>(key, m.encryptedPayload)
      out.push({ id: m.id, content: packet.payload.content, createdAt: m.createdAt })
    } catch {
      // wrong pairing or corrupted — skip, don't fail the whole pull
    }
  }
  return out
}
