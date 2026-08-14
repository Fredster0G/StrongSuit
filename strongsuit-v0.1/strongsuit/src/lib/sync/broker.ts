// ===== Sync broker (docs/plans/01-CONNECTIVITY.md §3.2) =====
//
// THE governing rule of v2 connectivity:
//
//   The user chooses a RELATIONSHIP, never a TRANSPORT.
//
// A coach pairs with a client once. After that the app picks the best
// available path every time, silently, and tells the user only what they'd
// actually want to know. Feature code calls `syncWith(peer)` and is done —
// the broker is the only thing in the app that knows transports exist.
//
// Pure orchestration: transports are injected, so this is fully unit-testable
// with fakes and never touches the network in a test.

import {
  TRANSPORT_ORDER, TRANSPORT_LABELS,
  type ExchangeResult, type Peer, type Reachability, type Transport, type TransportId,
} from './transport'

export interface AttemptRecord {
  id: TransportId
  outcome: 'skipped' | 'unreachable' | 'failed' | 'succeeded'
  /** Why it was skipped or how it failed — surfaced in diagnostics, not toasts. */
  reason?: string
}

export interface SyncOutcome {
  ok: boolean
  /** Which transport actually carried it. Null when nothing could. */
  via: TransportId | null
  result?: ExchangeResult
  attempts: AttemptRecord[]
  /** ONE honest sentence for the user. Never empty, never a stack trace. */
  message: string
}

export interface SyncOptions {
  /** Restrict to these transports, best-first order still applies. */
  only?: TransportId[]
  /** Exclude transports — e.g. omit `file`, which needs a human. */
  exclude?: TransportId[]
  /** Skip transports needing both parties online. Used by background sync. */
  automaticOnly?: boolean
}

/**
 * Should we actually try this transport?
 *
 * `unknown` counts as YES, and that distinction matters: some paths cannot be
 * probed without attempting them. P2P is the clear case — we can confirm the
 * rendezvous is up, but whether the other device is awake and whether NAT
 * lets us through is unknowable until we try. The honest probe result is
 * `unknown`, and treating that as "don't bother" would mean the P2P path
 * never ran at all.
 *
 * `unknown` deliberately does NOT count as available for the status dot (see
 * `bestAvailable`) — worth attempting and safe to promise are different
 * claims, and only one of them belongs on screen.
 */
function worthAttempting(r: Reachability): boolean {
  return r.state === 'reachable' || r.state === 'unknown'
}

function reasonOf(r: Reachability): string {
  return r.state === 'unreachable' || r.state === 'unsupported' ? r.reason : 'not reachable'
}

/**
 * Try each viable transport best-first until one carries the packet.
 *
 * Never silently does nothing: if every path fails, the outcome carries a
 * plain-language explanation naming what to do about it. A coach seeing
 * "nothing happened" with no reason is the failure mode this replaces.
 */
export async function syncWith(
  peer: Peer,
  transports: Transport[],
  opts: SyncOptions = {},
): Promise<SyncOutcome> {
  const byId = new Map(transports.map(t => [t.id, t]))
  const attempts: AttemptRecord[] = []

  const candidates = TRANSPORT_ORDER.filter(id => {
    if (!byId.has(id)) return false
    if (opts.only && !opts.only.includes(id)) return false
    if (opts.exclude?.includes(id)) return false
    if (opts.automaticOnly && !byId.get(id)!.capabilities.automatic) return false
    return true
  })

  if (candidates.length === 0) {
    return {
      ok: false, via: null, attempts,
      message: 'No way to reach this device is set up yet. Pair it, or export a file to send manually.',
    }
  }

  for (const id of candidates) {
    const transport = byId.get(id)!

    // probe() is contractually non-throwing, but a transport is ordinary code
    // and this loop must not die on a bad one — treat a throw as unreachable.
    let reach: Reachability
    try {
      reach = await transport.probe(peer)
    } catch (e) {
      reach = { state: 'unreachable', reason: e instanceof Error ? e.message : 'probe failed' }
    }

    if (!worthAttempting(reach)) {
      attempts.push({
        id,
        outcome: reach.state === 'unsupported' ? 'skipped' : 'unreachable',
        reason: reasonOf(reach),
      })
      continue
    }

    try {
      const result = await transport.exchange(peer)
      attempts.push({ id, outcome: 'succeeded' })
      return { ok: true, via: id, result, attempts, message: describeSuccess(id, result) }
    } catch (e) {
      // Reachable but the exchange failed — fall through and try the next
      // path rather than surfacing a dead end the user can't act on.
      attempts.push({ id, outcome: 'failed', reason: e instanceof Error ? e.message : 'sync failed' })
    }
  }

  return { ok: false, via: null, attempts, message: describeFailure(attempts) }
}

function describeSuccess(id: TransportId, r: ExchangeResult): string {
  if (r.replayed) return 'Already up to date.'
  if (r.applied === 0) return `Nothing new — synced over ${TRANSPORT_LABELS[id].toLowerCase()}.`
  const s = r.applied === 1 ? '' : 's'
  return `Synced ${r.applied} change${s} over ${TRANSPORT_LABELS[id].toLowerCase()}.`
}

/** One sentence naming the most useful next step, not a list of failures. */
function describeFailure(attempts: AttemptRecord[]): string {
  const tried = attempts.filter(a => a.outcome !== 'skipped')

  if (tried.length === 0) {
    return 'No connection is set up for this device yet. Export a file to send it manually, or set up a relay in Settings.'
  }
  // A transport that connected and then broke is the most actionable thing to
  // report — it means the setup is right and something specific went wrong.
  const broke = tried.find(a => a.outcome === 'failed')
  if (broke) {
    return `Couldn't finish syncing over ${TRANSPORT_LABELS[broke.id].toLowerCase()}: ${broke.reason}`
  }
  return "Couldn't reach this device. It'll sync automatically next time you're both online — nothing is lost."
}

/**
 * Which paths are currently open to this peer. Drives the connection
 * indicator in the UI; never throws, so a row always renders.
 */
export async function probeAll(
  peer: Peer,
  transports: Transport[],
): Promise<Record<string, Reachability>> {
  const entries = await Promise.all(
    transports.map(async t => {
      try {
        return [t.id, await t.probe(peer)] as const
      } catch (e) {
        return [t.id, { state: 'unreachable', reason: e instanceof Error ? e.message : 'probe failed' }] as const
      }
    }),
  )
  return Object.fromEntries(entries)
}

/** The best path currently available, or null. Used for the status dot. */
export function bestAvailable(reach: Record<string, Reachability>): TransportId | null {
  for (const id of TRANSPORT_ORDER) {
    if (reach[id]?.state === 'reachable') return id
  }
  return null
}
