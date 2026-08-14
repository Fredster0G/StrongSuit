// ===== P2P transport (docs/plans/01-CONNECTIVITY.md §6) =====
//
// WebRTC: a direct connection between the two devices, with a server involved
// only for the introduction. The state machine and wire format live in
// `lib/sync/p2pSession.ts` and `lib/sync/p2pProtocol.ts` (both pure, both
// heavily tested); this file is the thin layer that binds them to real
// browser APIs, the data layer, and the relay used as a rendezvous.
//
// FOUR THINGS TO KNOW BEFORE CHANGING ANYTHING HERE:
//
// 1. P2P NEEDS BOTH DEVICES AWAKE. Coaching is asynchronous, so this is an
//    optimisation for live moments, never the default path. The broker already
//    encodes that: `requiresSimultaneous: true`, and a cost that puts LAN
//    first and the store-and-forward relay right behind.
//
// 2. IT NEEDS A RENDEZVOUS. Without a relay URL there is nowhere to exchange
//    connection details, so this transport reports `unsupported` rather than
//    hanging — and the fallback chain becomes LAN → file, which is stated
//    honestly at pairing time rather than discovered later.
//
// 3. THE RENDEZVOUS NEVER SEES TRAINING DATA. It carries SDP and ICE only.
//    That is enforced in three independent places: the client validator, the
//    server's own payload check, and the fact that the sealed packet is only
//    ever written to the data channel.
//
// 4. DTLS IS NOT THE GUARANTEE. Our `CWSYNC1` envelope is. WebRTC's own
//    encryption is transport security; if TURN relays the bytes, TURN sees
//    ciphertext either way. Never weaken the envelope because "WebRTC is
//    already encrypted."

import { buildPacket, applyPacket, getIdentity } from '../syncApi'
import { newId } from '@/lib/core'
import { P2pSession, type PeerConnectionLike, type SignalChannel } from '@/lib/sync/p2pSession'
import type { P2pPath, SignalMessage } from '@/lib/sync/p2pProtocol'
import type { ExchangeResult, Peer, Reachability, Transport } from '@/lib/sync/transport'
import { CAPABILITIES } from '@/lib/sync/transport'

const DEFAULT_API_KEY = 'default-coachwright-key'

/**
 * Public STUN only, by default.
 *
 * STUN just tells a device its own public address — it carries no data and
 * costs nothing to use. TURN is a different matter: it relays every byte, so
 * it costs real bandwidth, and per the plan it is opt-in and tier-gated
 * rather than something we quietly route everyone through.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

/** Last observed path per peer device, so the UI can say which route was
 *  actually used instead of assuming "direct". */
const lastPath = new Map<string, P2pPath>()

export function pathForDevice(deviceId: string): P2pPath | undefined {
  return lastPath.get(deviceId)
}

function config(peer: Peer): { url: string; apiKey: string } | null {
  if (!peer.relayUrl) return null
  return { url: peer.relayUrl.replace(/\/+$/, ''), apiKey: peer.relayApiKey || DEFAULT_API_KEY }
}

/** WebRTC is missing in Node, in older WebViews, and in some locked-down
 *  enterprise browsers. Checked rather than assumed. */
export function webRtcAvailable(): boolean {
  return typeof RTCPeerConnection !== 'undefined'
}

function signalChannel(opts: {
  url: string
  apiKey: string
  coachId: string
  ourDeviceId: string
}): SignalChannel {
  return {
    async send(m: SignalMessage) {
      await fetch(`${opts.url}/signal/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': opts.apiKey },
        body: JSON.stringify({ coachId: opts.coachId, ...m }),
      })
    },
    async poll() {
      const res = await fetch(
        `${opts.url}/signal/poll?coachId=${encodeURIComponent(opts.coachId)}&deviceId=${encodeURIComponent(opts.ourDeviceId)}`,
        { headers: { 'x-api-key': opts.apiKey } },
      )
      if (!res.ok) return []
      const body = (await res.json()) as { messages?: unknown[] }
      // Returned unvalidated on purpose — `P2pSession` validates every message
      // itself, because the rendezvous is untrusted by design and a check here
      // would just be a second place for the rules to drift.
      return body.messages ?? []
    },
  }
}

export const p2pTransport: Transport = {
  id: 'p2p',
  capabilities: CAPABILITIES.p2p,

  async probe(peer: Peer): Promise<Reachability> {
    // MUST NOT throw: this drives the connection dot on every client row.
    if (!webRtcAvailable()) {
      return { state: 'unsupported', reason: 'This browser has no WebRTC support' }
    }
    const cfg = config(peer)
    if (!cfg) {
      return { state: 'unsupported', reason: 'A direct connection needs a rendezvous — set a relay URL' }
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(`${cfg.url}/health`, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) return { state: 'unreachable', reason: `rendezvous returned ${res.status}` }
      // Deliberately NOT 'reachable': all we know is that the introduction
      // service is up. Whether the other device is awake and whether NAT will
      // let us through are unknown until we actually try, and claiming
      // reachable here would put a green dot next to a connection that fails.
      return { state: 'unknown' }
    } catch {
      return { state: 'unreachable', reason: 'rendezvous not responding' }
    }
  },

  async exchange(peer: Peer): Promise<ExchangeResult> {
    if (!webRtcAvailable()) throw new Error('This browser has no WebRTC support.')
    const cfg = config(peer)
    if (!cfg) throw new Error('A direct connection needs a rendezvous point. Set a relay URL, or use same-network or file sync.')

    const identity = await getIdentity()
    const { device } = peer

    const session = new P2pSession({
      ourDeviceId: identity.deviceId,
      peerDeviceId: device.id,
      // Fresh per attempt, so a stale offer from a previous try can never be
      // mistaken for this one. `newId()` (ULID) rather than
      // `crypto.randomUUID()`, which is undefined outside a secure context —
      // and the Electron build serves from `file://`, which isn't one.
      session: newId(),
      createConnection: () => new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS }) as unknown as PeerConnectionLike,
      signal: signalChannel({ ...cfg, coachId: identity.deviceId, ourDeviceId: identity.deviceId }),
    })

    const { text } = await buildPacket(device)
    const { packet, path } = await session.exchange(text)
    lastPath.set(device.id, path)

    const r = await applyPacket(device, packet)
    return { applied: r.applied, skipped: r.skipped, replayed: r.replayed }
  },
}
