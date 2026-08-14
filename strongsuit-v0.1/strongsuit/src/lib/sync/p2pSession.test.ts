import { describe, it, expect } from 'vitest'
import {
  P2pSession, roleFor, P2pTimeoutError, CHANNEL_LABEL,
  type PeerConnectionLike, type DataChannelLike, type SignalChannel,
} from './p2pSession'
import { CHUNK_SIZE, type SignalMessage } from './p2pProtocol'

/**
 * A fake WebRTC pair and a fake rendezvous, good enough to drive two real
 * `P2pSession`s against each other.
 *
 * The point of this harness: every failure mode that matters in WebRTC —
 * nobody answers, the channel dies mid-transfer, a peer sends garbage — is
 * one you cannot reproduce on demand against a real network. Here they're all
 * one line each.
 */

/** Shared in-memory rendezvous. Each device polls its own mailbox. */
class FakeSignalling {
  private boxes = new Map<string, SignalMessage[]>()
  /** Everything ever sent, for asserting what the server could see. */
  readonly sent: SignalMessage[] = []
  /** Set to drop outgoing messages, simulating a rendezvous that isn't there. */
  blackhole = false

  channelFor(deviceId: string): SignalChannel {
    return {
      send: async (m: SignalMessage) => {
        this.sent.push(m)
        if (this.blackhole) return
        const box = this.boxes.get(m.to) ?? []
        box.push(m)
        this.boxes.set(m.to, box)
      },
      poll: async () => {
        const box = this.boxes.get(deviceId) ?? []
        this.boxes.set(deviceId, [])
        return box
      },
    }
  }

  /** Inject anything at all into a device's mailbox — the untrusted server. */
  inject(deviceId: string, raw: unknown) {
    const box = (this.boxes.get(deviceId) ?? []) as unknown[]
    box.push(raw)
    this.boxes.set(deviceId, box as SignalMessage[])
  }
}

class FakeChannel implements DataChannelLike {
  readyState = 'connecting'
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  peer: FakeChannel | null = null
  readonly outbox: string[] = []
  /** Drop everything sent, to model a channel that silently stops carrying. */
  mute = false

  send(data: string): void {
    this.outbox.push(data)
    if (this.mute) return
    const target = this.peer
    if (!target) return
    queueMicrotask(() => target.onmessage?.({ data }))
  }

  open(): void {
    this.readyState = 'open'
    this.onopen?.()
  }

  close(): void {
    if (this.readyState === 'closed') return
    this.readyState = 'closed'
    this.onclose?.()
  }
}

class FakeConnection implements PeerConnectionLike {
  connectionState = 'new'
  onicecandidate: PeerConnectionLike['onicecandidate'] = null
  ondatachannel: PeerConnectionLike['ondatachannel'] = null
  onconnectionstatechange: (() => void) | null = null
  channel: FakeChannel | null = null
  peer: FakeConnection | null = null
  closed = false
  candidateTypes: { localType?: string; remoteType?: string } | null = { localType: 'host', remoteType: 'srflx' }
  /** Set to make getSelectedCandidatePair throw, as a real one can. */
  statsThrow = false

  createDataChannel(label: string): DataChannelLike {
    expect(label).toBe(CHANNEL_LABEL)
    const ch = new FakeChannel()
    this.channel = ch
    // Hand the other side its half as soon as it exists, mirroring how
    // `ondatachannel` fires on the answerer once negotiation completes.
    queueMicrotask(() => {
      const other = this.peer
      if (!other) return
      const remote = new FakeChannel()
      other.channel = remote
      ch.peer = remote
      remote.peer = ch
      other.ondatachannel?.({ channel: remote })
      ch.open()
      remote.open()
    })
    return ch
  }

  async createOffer() { return { type: 'offer', sdp: 'v=0\r\noffer\r\n' } }
  async createAnswer() { return { type: 'answer', sdp: 'v=0\r\nanswer\r\n' } }
  async setLocalDescription() { /* no-op */ }
  async setRemoteDescription() { /* no-op */ }
  async addIceCandidate() { /* no-op */ }
  async getSelectedCandidatePair() {
    if (this.statsThrow) throw new Error('stats unavailable')
    return this.candidateTypes
  }
  close() { this.closed = true; this.channel?.close() }
}

/** Wires two sessions together over a shared fake network. */
function makePair(opts: { session?: string } = {}) {
  const signalling = new FakeSignalling()
  const a = new FakeConnection()
  const b = new FakeConnection()
  a.peer = b
  b.peer = a
  const session = opts.session ?? 's1'
  // 'dev-a' < 'dev-b', so A offers.
  const mk = (ours: string, theirs: string, pc: FakeConnection) => new P2pSession({
    ourDeviceId: ours,
    peerDeviceId: theirs,
    session,
    createConnection: () => pc,
    signal: signalling.channelFor(ours),
    timeoutMs: 2000,
    sleep: () => Promise.resolve(), // poll as fast as the event loop allows
  })
  return {
    signalling, a, b,
    sessionA: mk('dev-a', 'dev-b', a),
    sessionB: mk('dev-b', 'dev-a', b),
  }
}

describe('roleFor — glare is designed out, not handled', () => {
  it('gives both sides the same answer', () => {
    expect(roleFor('dev-a', 'dev-b')).toBe('offerer')
    expect(roleFor('dev-b', 'dev-a')).toBe('answerer')
  })

  it('is decided by id order, so both peers never offer at once', () => {
    // The reason there is no rollback / polite-peer code in p2pSession: the
    // situation it would handle cannot occur.
    const ids = ['aaa', 'zzz', 'device-1', 'device-2', 'x']
    for (const p of ids) {
      for (const q of ids) {
        if (p === q) continue
        expect(roleFor(p, q) === 'offerer').toBe(roleFor(q, p) === 'answerer')
      }
    }
  })
})

describe('P2pSession — two peers exchanging sealed packets', () => {
  it('completes a handshake and swaps packets both ways', async () => {
    const { sessionA, sessionB } = makePair()
    const [ra, rb] = await Promise.all([
      sessionA.exchange('CWSYNC1.from-a'),
      sessionB.exchange('CWSYNC1.from-b'),
    ])
    expect(ra.packet).toBe('CWSYNC1.from-b')
    expect(rb.packet).toBe('CWSYNC1.from-a')
  })

  it('carries a packet far larger than one data-channel message', async () => {
    // The real case: a client with a year of history. Chunking is only useful
    // if reassembly survives it end to end.
    const big = 'CWSYNC1.' + 'x'.repeat(CHUNK_SIZE * 5 + 77)
    const { sessionA, sessionB } = makePair()
    const [ra] = await Promise.all([
      sessionA.exchange('small'),
      sessionB.exchange(big),
    ])
    expect(ra.packet).toBe(big)
    expect(ra.packet.length).toBe(big.length)
  })

  it('reports the path honestly, including when TURN is relaying', async () => {
    const { sessionA, sessionB, a, b } = makePair()
    a.candidateTypes = { localType: 'relay', remoteType: 'host' }
    b.candidateTypes = { localType: 'host', remoteType: 'relay' }
    const [ra, rb] = await Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    expect(ra.path).toBe('relayed')
    expect(rb.path).toBe('relayed')
  })

  it('says "unknown" rather than claiming direct when stats are unavailable', async () => {
    const { sessionA, sessionB, a } = makePair()
    a.statsThrow = true
    const [ra] = await Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    expect(ra.path).toBe('unknown')
  })

  it('sends only connection details to the rendezvous, never the packet', async () => {
    // The claim the UI makes to the user — "a few kilobytes of connection
    // details, never your data" — asserted against what actually got sent.
    const { signalling, sessionA, sessionB } = makePair()
    const secret = 'CWSYNC1.THE-SECRET-PAYLOAD'
    await Promise.all([sessionA.exchange(secret), sessionB.exchange('b')])
    expect(signalling.sent.length).toBeGreaterThan(0)
    for (const m of signalling.sent) {
      expect(m.payload).not.toContain('THE-SECRET-PAYLOAD')
      expect(['offer', 'answer', 'ice']).toContain(m.kind)
    }
  })

  it('closes the peer connection on success', async () => {
    // A leaked RTCPeerConnection keeps ICE agents and sockets alive — on a
    // phone that's a battery bug the user notices long after the sync.
    const { sessionA, sessionB, a, b } = makePair()
    await Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    expect(a.closed).toBe(true)
    expect(b.closed).toBe(true)
  })
})

describe('P2pSession — the failures that actually happen', () => {
  it('times out when the other device never answers', async () => {
    const { signalling, sessionA } = makePair()
    signalling.blackhole = true // rendezvous swallows everything
    await expect(sessionA.exchange('a')).rejects.toThrow(P2pTimeoutError)
  })

  it('closes the connection even when the attempt fails', async () => {
    const { signalling, sessionA, a } = makePair()
    signalling.blackhole = true
    await expect(sessionA.exchange('a')).rejects.toThrow()
    expect(a.closed).toBe(true)
  })

  it('fails clearly when the channel drops mid-transfer', async () => {
    const { sessionA, sessionB, a } = makePair()
    const pending = Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    // Mute B's side so nothing comes back, then drop A's channel under it.
    queueMicrotask(() => {
      if (a.channel) a.channel.mute = true
      setTimeout(() => a.channel?.close(), 5)
    })
    await expect(pending).rejects.toThrow(/dropped before the transfer finished|timed out/)
  })

  it('ignores a signalling message from a device that is not our peer', async () => {
    // §6.5: a compromised rendezvous must not be able to inject a peer.
    const { signalling, sessionA, sessionB } = makePair()
    signalling.inject('dev-a', {
      kind: 'answer', from: 'attacker', to: 'dev-a', session: 's1',
      payload: 'v=0\r\nattacker\r\n', createdAt: new Date().toISOString(),
    })
    const [ra] = await Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    expect(ra.packet).toBe('b') // the real peer still completed
  })

  it('ignores malformed rubbish from the rendezvous', async () => {
    const { signalling, sessionA, sessionB } = makePair()
    for (const junk of [null, 42, 'hello', { kind: 'offer' }, { ...{}, evil: true }]) {
      signalling.inject('dev-a', junk)
    }
    const [ra] = await Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    expect(ra.packet).toBe('b')
  })

  it('ignores a stale message from a previous attempt', async () => {
    const { signalling, sessionA, sessionB } = makePair({ session: 's2' })
    signalling.inject('dev-a', {
      kind: 'answer', from: 'dev-b', to: 'dev-a', session: 's1', // old session
      payload: 'v=0\r\nstale\r\n', createdAt: new Date().toISOString(),
    })
    const [ra] = await Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    expect(ra.packet).toBe('b')
  })

  it('ignores non-JSON and non-chunk traffic on the data channel', async () => {
    const { sessionA, sessionB, b } = makePair()
    const pending = Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    queueMicrotask(() => {
      // Garbage must not tear down a working transfer.
      b.channel?.peer?.onmessage?.({ data: 'not json at all' })
      b.channel?.peer?.onmessage?.({ data: '{"not":"a chunk"}' })
    })
    const [ra] = await pending
    expect(ra.packet).toBe('b')
  })

  it('rejects a peer claiming an absurd message size', async () => {
    const { sessionA, sessionB, a } = makePair()
    const pending = Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    queueMicrotask(() => {
      a.channel?.onmessage?.({ data: JSON.stringify({ id: 'evil', seq: 0, total: 9_999_999, data: 'x' }) })
    })
    await expect(pending).rejects.toThrow(/couldn't accept/)
  })

  it('is single-use — close is idempotent and safe to call twice', async () => {
    const { sessionA, sessionB } = makePair()
    await Promise.all([sessionA.exchange('a'), sessionB.exchange('b')])
    expect(() => { sessionA.close(); sessionA.close() }).not.toThrow()
  })
})
