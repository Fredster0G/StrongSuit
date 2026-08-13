// ===== P2P, client side (docs/plans/01-CONNECTIVITY.md §6) =====
//
// The other half of the coach app's `p2pTransport`. Both halves have to exist
// or neither works: a direct connection needs someone on the far end running
// the same handshake, and coach-side-only P2P is dead code that times out and
// silently falls back to the relay forever.
//
// `lib/p2pProtocol.ts` and `lib/p2pSession.ts` are byte-identical copies of
// the coach app's, the same doctrine as `lib/sync.ts`, `lib/pose.ts`,
// `lib/skeleton.ts` and `lib/cycle.ts`: two npm projects, no shared package,
// so the protocol is copied rather than reimplemented. Reimplementing a wire
// format on the other side of a connection is how the two ends drift.
//
// WHAT THIS IS FOR, and what it is not: P2P needs both devices awake at the
// same moment, which coaching mostly isn't. This exists for live moments —
// mid-session, a video call, a big batch of logs — not for routine sync. The
// relay path stays the backbone and needs no changes.

import { P2pSession, type PeerConnectionLike, type SignalChannel } from '@/lib/p2pSession'
import type { P2pPath, SignalMessage } from '@/lib/p2pProtocol'
import { profileRepo, coachLinkRepo } from '@/db/repo'
import { nowIso } from '@/lib/core'
import { applyCoachPacket, buildOutboundPacketForP2p, type CoachApplyResult } from './companionSyncApi'
import type { CoachLink } from '@/db/types'

/** STUN only. It tells a device its own public address and carries no data.
 *  TURN relays every byte, costs real bandwidth, and is deliberately opt-in
 *  and tier-gated rather than something everyone is quietly routed through. */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

export function webRtcAvailable(): boolean {
  return typeof RTCPeerConnection !== 'undefined'
}

function relayConfig(link: CoachLink) {
  if (!link.relayUrl) return null
  return { url: link.relayUrl.replace(/\/+$/, ''), apiKey: link.relayApiKey || 'default-coachwright-key' }
}

function signalChannel(opts: { url: string; apiKey: string; coachId: string; ourDeviceId: string }): SignalChannel {
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
      // Unvalidated by design — `P2pSession` validates every message itself,
      // because the rendezvous is untrusted and a second check here would
      // just be a second place for the rules to drift apart.
      return body.messages ?? []
    },
  }
}

export interface P2pOutcome extends CoachApplyResult {
  path: P2pPath
}

/**
 * Answer a coach's direct-connection attempt, exchange packets, merge.
 *
 * The session id must be the one the COACH chose — this side is answering an
 * attempt already in flight, not starting its own. Which is why this takes a
 * session id rather than inventing one: two peers generating separate ids
 * would each ignore the other's messages as belonging to a different attempt,
 * and the connection would time out with both sides convinced they were
 * talking to nobody.
 */
export async function syncOverP2p(coachLink: CoachLink, session: string): Promise<P2pOutcome> {
  if (!webRtcAvailable()) throw new Error("This browser can't make direct connections. Sync will use your coach's server instead.")
  const cfg = relayConfig(coachLink)
  if (!cfg) throw new Error("A direct connection needs a rendezvous point, and your coach hasn't given you a server address. Export a file instead.")

  const identity = await profileRepo.getOrCreateIdentity()
  const p2p = new P2pSession({
    ourDeviceId: identity.deviceId,
    peerDeviceId: coachLink.coachDeviceId,
    session,
    createConnection: () => new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS }) as unknown as PeerConnectionLike,
    signal: signalChannel({ ...cfg, coachId: coachLink.coachDeviceId, ourDeviceId: identity.deviceId }),
  })

  const ours = await buildOutboundPacketForP2p(coachLink)
  const { packet, path } = await p2p.exchange(ours)
  const applied = await applyCoachPacket(coachLink, packet)
  await coachLinkRepo.patch(coachLink.id, { lastSyncAt: nowIso() })
  return { ...applied, path }
}

/**
 * Is a coach trying to reach this device right now?
 *
 * Peeking at the mailbox WITHOUT consuming it, so the offer is still there
 * for `syncOverP2p` to act on. The relay's `/signal/poll` consumes on read
 * (correctly — a signalling message belongs to exactly one attempt), so this
 * uses the dedicated peek endpoint instead.
 *
 * Returns the coach's session id, which the caller must pass straight back
 * into `syncOverP2p` — see the note there about why this side never invents
 * one.
 */
export async function pendingP2pOffer(coachLink: CoachLink): Promise<string | null> {
  const cfg = relayConfig(coachLink)
  if (!cfg || !webRtcAvailable()) return null
  try {
    const identity = await profileRepo.getOrCreateIdentity()
    const res = await fetch(
      `${cfg.url}/signal/peek?coachId=${encodeURIComponent(coachLink.coachDeviceId)}&deviceId=${encodeURIComponent(identity.deviceId)}`,
      { headers: { 'x-api-key': cfg.apiKey } },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { session?: string | null }
    return body.session ?? null
  } catch {
    // Never throws: this runs opportunistically on app open, and a failure
    // here must not stop the ordinary relay sync from happening.
    return null
  }
}
