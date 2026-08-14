// ===== Relay transport (docs/plans/01-CONNECTIVITY.md §3.1) =====
//
// The store-and-forward path: push our sealed packet to a relay, pull whatever
// is waiting for us, merge it. Works when the other side is asleep, which is
// why it's the backbone of asynchronous coaching.
//
// This is an EXTRACTION of the logic that lived inline in SyncCenterPage's
// `doCloudSync`, moved behind the Transport interface with no behaviour change.
// The keying below is subtle and was a real bug once (S13) — read the comments
// before touching it.
//
// Concrete transports live under `features/` rather than `lib/sync/` because
// they depend on the data layer (buildPacket/applyPacket). `lib/sync/` stays
// pure so the broker remains unit-testable with fakes.

import { buildPacket, applyPacket, getIdentity } from '../syncApi'
import type { ExchangeResult, Peer, Reachability, Transport } from '@/lib/sync/transport'
import { CAPABILITIES } from '@/lib/sync/transport'

const DEFAULT_API_KEY = 'default-coachwright-key'

function config(peer: Peer): { url: string; apiKey: string } | null {
  if (!peer.relayUrl) return null
  return {
    url: peer.relayUrl.replace(/\/+$/, ''),
    apiKey: peer.relayApiKey || DEFAULT_API_KEY,
  }
}

export const relayTransport: Transport = {
  id: 'relay',
  capabilities: CAPABILITIES.relay,

  async probe(peer: Peer): Promise<Reachability> {
    const cfg = config(peer)
    if (!cfg) return { state: 'unsupported', reason: 'No relay configured' }

    // /health is unauthenticated and cheap by design — this runs per client
    // row in the roster, so it must never be expensive.
    const started = performance.now()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(`${cfg.url}/health`, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) return { state: 'unreachable', reason: `relay returned ${res.status}` }
      return { state: 'reachable', latencyMs: Math.round(performance.now() - started) }
    } catch {
      // Offline, DNS failure, timeout — all the same to the caller.
      return { state: 'unreachable', reason: 'relay not responding' }
    }
  },

  async exchange(peer: Peer): Promise<ExchangeResult> {
    const cfg = config(peer)
    if (!cfg) throw new Error('No relay configured.')
    const { device } = peer
    const identity = await getIdentity()

    // --- push ---
    // Keyed by the RECIPIENT's device id, not ours. Every paired device gets
    // its own sealed packet on the relay; before S13 these all shared one id
    // and syncing device B destroyed the packet waiting for device A.
    const { text } = await buildPacket(device)
    const pushRes = await fetch(`${cfg.url}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
      body: JSON.stringify({
        id: device.id,
        type: 'coach',
        coachId: identity.deviceId,
        encryptedPayload: text,
      }),
    })
    if (!pushRes.ok) throw new Error(`Relay rejected the upload (${pushRes.status}).`)

    // --- pull ---
    // Asymmetric on purpose: a client device pushes under ITS OWN id, while a
    // peer coach device pushes a packet addressed to US under OUR id.
    const pullPath = device.role === 'client'
      ? `client/${device.id}`
      : `coach/${identity.deviceId}`
    const pullRes = await fetch(`${cfg.url}/sync/pull/${pullPath}`, {
      headers: { 'x-api-key': cfg.apiKey },
    })
    if (!pullRes.ok) throw new Error(`Relay rejected the download (${pullRes.status}).`)

    const { encryptedPayload } = (await pullRes.json()) as { encryptedPayload?: string }
    if (!encryptedPayload) {
      // Our push landed; there was simply nothing waiting for us. Not an error.
      return { applied: 0, skipped: 0, replayed: false }
    }

    const r = await applyPacket(device, encryptedPayload)
    return { applied: r.applied, skipped: r.skipped, replayed: r.replayed }
  },
}
