import { describe, it, expect, vi } from 'vitest'
import { syncWith, probeAll, bestAvailable } from './broker'
import { CAPABILITIES, type Peer, type Reachability, type Transport, type TransportId } from './transport'

const peer: Peer = { device: { id: 'd1' } as Peer['device'] }

/** Fake transport — the broker never touches the network in a test. */
function fake(
  id: TransportId,
  reach: Reachability,
  exchange?: () => Promise<{ applied: number; skipped: number; replayed: boolean }>,
): Transport {
  return {
    id,
    capabilities: CAPABILITIES[id],
    probe: vi.fn(async () => reach),
    exchange: vi.fn(exchange ?? (async () => ({ applied: 1, skipped: 0, replayed: false }))),
  }
}

const reachable: Reachability = { state: 'reachable' }
const down: Reachability = { state: 'unreachable', reason: 'no route to host' }
const unknown: Reachability = { state: 'unknown' }
const unsupported: Reachability = { state: 'unsupported', reason: 'no WebRTC in this browser' }

describe('unprobeable paths — "unknown" means try it, not skip it', () => {
  // P2P is the reason this distinction exists: we can check the rendezvous is
  // up, but whether the peer is awake and whether NAT lets us through cannot
  // be known without attempting. Treating that as "not reachable" would mean
  // the P2P path silently never ran.
  it('attempts a transport whose reachability is unknown', async () => {
    const p2p = fake('p2p', unknown)
    const out = await syncWith(peer, [p2p, fake('relay', reachable)])
    expect(out.via).toBe('p2p')
    expect(p2p.exchange).toHaveBeenCalled()
  })

  it('still falls through to a cheaper certainty first', async () => {
    // LAN is both cheaper and actually confirmed — it should win.
    const out = await syncWith(peer, [fake('p2p', unknown), fake('lan', reachable)])
    expect(out.via).toBe('lan')
  })

  it('falls through to the relay when the unknown path turns out not to work', async () => {
    const p2p = fake('p2p', unknown, async () => { throw new Error('no route through NAT') })
    const out = await syncWith(peer, [p2p, fake('relay', reachable)])
    expect(out.ok).toBe(true)
    expect(out.via).toBe('relay')
    expect(out.attempts.map(a => a.outcome)).toEqual(['failed', 'succeeded'])
  })

  it('does not attempt a structurally unsupported transport', () => {
    // "Unknown" is worth a try; "unsupported" cannot work at all, and trying
    // it just adds a timeout to every sync.
    return syncWith(peer, [fake('p2p', unsupported), fake('relay', reachable)]).then(out => {
      expect(out.attempts[0]).toMatchObject({ id: 'p2p', outcome: 'skipped' })
      expect(out.via).toBe('relay')
    })
  })

  it('does not light the status dot for a path it only might have', async () => {
    // Worth attempting and safe to promise are different claims. Only one of
    // them belongs on screen next to a client's name.
    const reach = await probeAll(peer, [fake('p2p', unknown)])
    expect(bestAvailable(reach)).toBeNull()
  })
})

describe('syncWith — transport selection', () => {
  it('prefers the cheapest reachable transport', async () => {
    // LAN (cost 10) beats relay (30) whenever both are up: faster, and the
    // data never leaves the building.
    const out = await syncWith(peer, [fake('relay', reachable), fake('lan', reachable)])
    expect(out.ok).toBe(true)
    expect(out.via).toBe('lan')
  })

  it('falls through to the next transport when the preferred one is unreachable', async () => {
    const lan = fake('lan', down)
    const relay = fake('relay', reachable)
    const out = await syncWith(peer, [lan, relay])
    expect(out.via).toBe('relay')
    // The unreachable one must not have been asked to exchange.
    expect(lan.exchange).not.toHaveBeenCalled()
    expect(relay.exchange).toHaveBeenCalled()
  })

  it('falls through when a reachable transport fails mid-exchange', async () => {
    // Reachable-then-broken is exactly the case that must not dead-end.
    const lan = fake('lan', reachable, async () => { throw new Error('connection reset') })
    const out = await syncWith(peer, [lan, fake('relay', reachable)])
    expect(out.ok).toBe(true)
    expect(out.via).toBe('relay')
    expect(out.attempts.find(a => a.id === 'lan')).toMatchObject({ outcome: 'failed', reason: 'connection reset' })
  })

  it('records every attempt in order tried', async () => {
    const out = await syncWith(peer, [fake('lan', down), fake('p2p', down), fake('relay', reachable)])
    expect(out.attempts.map(a => a.id)).toEqual(['lan', 'p2p', 'relay'])
    expect(out.attempts.map(a => a.outcome)).toEqual(['unreachable', 'unreachable', 'succeeded'])
  })

  it('treats a throwing probe as unreachable rather than dying', async () => {
    const bad: Transport = {
      id: 'lan',
      capabilities: CAPABILITIES.lan,
      probe: vi.fn(async () => { throw new Error('probe exploded') }),
      exchange: vi.fn(),
    }
    const out = await syncWith(peer, [bad, fake('relay', reachable)])
    expect(out.ok).toBe(true)
    expect(out.via).toBe('relay')
  })
})

describe('syncWith — filtering', () => {
  it('honours `only`', async () => {
    const out = await syncWith(peer, [fake('lan', reachable), fake('relay', reachable)], { only: ['relay'] })
    expect(out.via).toBe('relay')
  })

  it('honours `exclude`', async () => {
    const out = await syncWith(peer, [fake('lan', reachable), fake('relay', reachable)], { exclude: ['lan'] })
    expect(out.via).toBe('relay')
  })

  it('automaticOnly skips transports that need a human', async () => {
    // Background sync must never silently "succeed" by demanding a file save.
    const out = await syncWith(peer, [fake('file', reachable)], { automaticOnly: true })
    expect(out.ok).toBe(false)
    expect(out.via).toBeNull()
  })
})

describe('syncWith — honest messaging', () => {
  it('never returns an empty message, even with no transports at all', async () => {
    const out = await syncWith(peer, [])
    expect(out.ok).toBe(false)
    expect(out.message).toBeTruthy()
    expect(out.message).toMatch(/pair|export|file/i)
  })

  it('reports a mid-exchange failure specifically — the actionable case', async () => {
    const out = await syncWith(peer, [fake('relay', reachable, async () => { throw new Error('server returned 500') })])
    expect(out.ok).toBe(false)
    expect(out.message).toContain('server returned 500')
  })

  it('reassures rather than alarms when the peer is simply offline', async () => {
    const out = await syncWith(peer, [fake('relay', down)])
    expect(out.ok).toBe(false)
    expect(out.message).toMatch(/nothing is lost/i)
  })

  it('names the transport and change count on success', async () => {
    const out = await syncWith(peer, [fake('lan', reachable, async () => ({ applied: 3, skipped: 0, replayed: false }))])
    expect(out.message).toBe('Synced 3 changes over local network.')
  })

  it('uses the singular for one change', async () => {
    const out = await syncWith(peer, [fake('lan', reachable, async () => ({ applied: 1, skipped: 0, replayed: false }))])
    expect(out.message).toContain('1 change over')
  })

  it('says "already up to date" on a replayed packet', async () => {
    const out = await syncWith(peer, [fake('relay', reachable, async () => ({ applied: 0, skipped: 2, replayed: true }))])
    expect(out.message).toBe('Already up to date.')
  })
})

describe('probeAll / bestAvailable', () => {
  it('probes every transport concurrently and keeps a throwing one from poisoning the result', async () => {
    const bad: Transport = {
      id: 'p2p', capabilities: CAPABILITIES.p2p,
      probe: vi.fn(async () => { throw new Error('boom') }), exchange: vi.fn(),
    }
    const reach = await probeAll(peer, [fake('lan', reachable), bad, fake('relay', down)])
    expect(reach.lan.state).toBe('reachable')
    expect(reach.p2p.state).toBe('unreachable')
    expect(reach.relay.state).toBe('unreachable')
  })

  it('bestAvailable returns the cheapest reachable path', () => {
    expect(bestAvailable({ relay: reachable, lan: reachable })).toBe('lan')
    expect(bestAvailable({ relay: reachable, lan: down })).toBe('relay')
    expect(bestAvailable({ relay: down, lan: down })).toBeNull()
    expect(bestAvailable({})).toBeNull()
  })
})
