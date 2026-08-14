// ===== Transport abstraction (docs/plans/01-CONNECTIVITY.md §3) =====
//
// v1 got the important thing right: ONE sealed payload shape and ONE merge
// function per side, with the hosting tier only deciding which pipe carries
// the packet. What it never had was that idea expressed *in code* — the relay
// path, the LAN path, and the file path each hand-rolled their own fetch/read
// and then called the same merge. Adding a fourth (WebRTC P2P) meant a fourth
// copy of the same orchestration.
//
// This module is that missing seam. Every path becomes a `Transport`, and
// feature code asks the broker to sync with a *peer* rather than choosing a
// pipe. That's what makes "it shouldn't matter whether it's localhost, their
// server, or ours" true in the code and not just in a diagram.
//
// Deliberately free of any import from `features/` or `db/` beyond types:
// the broker must stay unit-testable with fake transports and no network.

import type { Device } from '@/db/types'

export type TransportId = 'lan' | 'p2p' | 'relay' | 'file'

/** Who we're syncing with, plus how we might be able to reach them. */
export interface Peer {
  device: Device
  /** Relay base URL, if the coach has configured one. */
  relayUrl?: string
  relayApiKey?: string
  /** Last known LAN address for this peer, e.g. http://192.168.1.5:4000 */
  lanUrl?: string
}

/** A sealed CWSYNC1 packet. Opaque here on purpose — transports move bytes,
 *  they never inspect or decrypt them. */
export type SealedPacket = string

export interface TransportCapabilities {
  /** Can carry a packet with no user interaction. `file` cannot. */
  automatic: boolean
  /** Both parties must be online at the same moment (lan, p2p). */
  requiresSimultaneous: boolean
  /** Preference weight, lower wins. Drives the broker's ordering. */
  cost: number
}

export type Reachability =
  | { state: 'reachable'; latencyMs?: number }
  | { state: 'unreachable'; reason: string }
  /** Not probed yet. */
  | { state: 'unknown' }
  /** Structurally impossible here — e.g. LAN outside the Electron build. */
  | { state: 'unsupported'; reason: string }

/** What a completed exchange did. Mirrors syncApi's ApplyResult without
 *  importing it, so this module stays dependency-light. */
export interface ExchangeResult {
  applied: number
  skipped: number
  replayed: boolean
}

export interface Transport {
  id: TransportId
  capabilities: TransportCapabilities
  /** Cheap, cached, and MUST NOT throw — it drives the connection dot in the
   *  UI, which has to render on every client row without risking a crash. */
  probe(peer: Peer): Promise<Reachability>
  /** Push ours, pull theirs, merge. Throws on genuine failure so the broker
   *  can fall through to the next transport. */
  exchange(peer: Peer): Promise<ExchangeResult>
}

export const CAPABILITIES: Record<TransportId, TransportCapabilities> = {
  // Same building: fastest, and nothing leaves the local network.
  lan: { automatic: true, requiresSimultaneous: true, cost: 10 },
  // Direct across the internet; signalling only, no payload via a server.
  p2p: { automatic: true, requiresSimultaneous: true, cost: 20 },
  // Store-and-forward, so it works when the other side is asleep.
  relay: { automatic: true, requiresSimultaneous: false, cost: 30 },
  // Always possible, always needs a human.
  file: { automatic: false, requiresSimultaneous: false, cost: 100 },
}

/** Best-first order the broker tries. Derived from cost so there's one place
 *  to change preference. */
export const TRANSPORT_ORDER: TransportId[] = (Object.keys(CAPABILITIES) as TransportId[])
  .sort((a, b) => CAPABILITIES[a].cost - CAPABILITIES[b].cost)

export const TRANSPORT_LABELS: Record<TransportId, string> = {
  lan: 'Local network',
  p2p: 'Direct',
  relay: 'Relay',
  file: 'File',
}
