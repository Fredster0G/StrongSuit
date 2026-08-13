import { describe, it, expect } from 'vitest'
import {
  isSignalMessage, isForUs, chunkPacket, isChunk, Reassembler,
  pathFromCandidateTypes, PATH_LABELS, PATH_DETAIL,
  CHUNK_SIZE, MAX_CHUNKS, MAX_SIGNAL_PAYLOAD,
  type SignalMessage, type Chunk,
} from './p2pProtocol'

const offer = (over: Partial<SignalMessage> = {}): SignalMessage => ({
  kind: 'offer',
  from: 'peer-1',
  to: 'us',
  session: 's1',
  payload: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n',
  createdAt: '2026-08-05T10:00:00.000Z',
  ...over,
})

describe('isSignalMessage — the signalling server is untrusted', () => {
  it('accepts a well-formed offer, answer and candidate', () => {
    expect(isSignalMessage(offer())).toBe(true)
    expect(isSignalMessage(offer({ kind: 'answer' }))).toBe(true)
    expect(isSignalMessage(offer({ kind: 'ice', payload: 'candidate:1 1 udp 2113937151 192.168.1.5 55555 typ host', sdpMid: '0', sdpMLineIndex: 0 }))).toBe(true)
  })

  it('rejects anything that is not an object', () => {
    for (const v of [null, undefined, 'offer', 42, []]) expect(isSignalMessage(v)).toBe(false)
  })

  it('rejects unknown fields rather than passing them through', () => {
    // An unknown field is either a protocol version we don't understand or
    // something being smuggled past us. Neither belongs anywhere near
    // setRemoteDescription.
    expect(isSignalMessage({ ...offer(), evil: 'payload' })).toBe(false)
  })

  it('rejects an unknown kind', () => {
    expect(isSignalMessage({ ...offer(), kind: 'hangup' })).toBe(false)
  })

  it('rejects missing or empty required fields', () => {
    for (const key of ['from', 'to', 'session', 'payload', 'createdAt'] as const) {
      expect(isSignalMessage({ ...offer(), [key]: '' })).toBe(false)
      const without = { ...offer() } as Record<string, unknown>
      delete without[key]
      expect(isSignalMessage(without)).toBe(false)
    }
  })

  it('rejects an offer whose payload is not SDP', () => {
    // The one field that reaches the WebRTC stack verbatim. If it isn't SDP,
    // nothing good can come of handing it over.
    expect(isSignalMessage(offer({ payload: '{"__proto__":{}}' }))).toBe(false)
    expect(isSignalMessage(offer({ kind: 'answer', payload: 'not sdp' }))).toBe(false)
  })

  it('does not require SDP shape for ICE candidates', () => {
    expect(isSignalMessage(offer({ kind: 'ice', payload: 'candidate:1 1 udp 1 10.0.0.1 1 typ host' }))).toBe(true)
  })

  it('rejects an implausibly large payload', () => {
    // A real SDP is a few KB. Anything near the cap is not a connection
    // description, and buffering it is the attack.
    expect(isSignalMessage(offer({ payload: 'v=' + 'x'.repeat(MAX_SIGNAL_PAYLOAD) }))).toBe(false)
  })

  it('rejects wrongly-typed optional fields', () => {
    expect(isSignalMessage({ ...offer(), kind: 'ice', sdpMLineIndex: '0' })).toBe(false)
    expect(isSignalMessage({ ...offer(), kind: 'ice', sdpMid: 0 })).toBe(false)
  })
})

describe('isForUs — well-formed is not the same as mine', () => {
  const opts = { ourDeviceId: 'us', peerDeviceId: 'peer-1', session: 's1' }

  it('accepts a message addressed to us from our peer in this session', () => {
    expect(isForUs(offer(), opts)).toBe(true)
  })

  it('rejects a message addressed to someone else', () => {
    expect(isForUs(offer({ to: 'other-device' }), opts)).toBe(false)
  })

  it('rejects a message from a device that is not our peer', () => {
    // §6.5: a compromised signalling server must not be able to inject a peer.
    expect(isForUs(offer({ from: 'attacker' }), opts)).toBe(false)
  })

  it('rejects a stale offer from a previous attempt', () => {
    // Without the session check, a leftover offer tears down a working
    // connection — the classic glare bug.
    expect(isForUs(offer({ session: 's0' }), opts)).toBe(false)
  })
})

describe('chunkPacket', () => {
  it('splits a large packet and numbers the pieces', () => {
    const packet = 'x'.repeat(CHUNK_SIZE * 3 + 100)
    const chunks = chunkPacket('m1', packet)
    expect(chunks).toHaveLength(4)
    expect(chunks.every(c => c.total === 4)).toBe(true)
    expect(chunks.map(c => c.seq)).toEqual([0, 1, 2, 3])
    expect(chunks.map(c => c.data).join('')).toBe(packet)
  })

  it('leaves a small packet as one chunk', () => {
    expect(chunkPacket('m1', 'CWSYNC1.abc')).toHaveLength(1)
  })

  it('handles an empty packet without producing zero chunks', () => {
    // total: 0 would make the reassembler's "have I got them all" test
    // trivially true forever.
    const chunks = chunkPacket('m1', '')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].total).toBe(1)
  })

  it('round-trips exactly, including at an exact chunk boundary', () => {
    for (const size of [1, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, CHUNK_SIZE * 2]) {
      const packet = 'a'.repeat(size)
      expect(chunkPacket('m', packet).map(c => c.data).join('')).toBe(packet)
    }
  })
})

describe('isChunk', () => {
  const good: Chunk = { id: 'm1', seq: 0, total: 2, data: 'abc' }

  it('accepts a valid chunk', () => {
    expect(isChunk(good)).toBe(true)
  })

  it('rejects malformed shapes', () => {
    expect(isChunk(null)).toBe(false)
    expect(isChunk({ ...good, id: '' })).toBe(false)
    expect(isChunk({ ...good, seq: -1 })).toBe(false)
    expect(isChunk({ ...good, seq: 1.5 })).toBe(false)
    expect(isChunk({ ...good, total: 0 })).toBe(false)
    expect(isChunk({ ...good, data: 123 })).toBe(false)
  })

  it('rejects a sequence number past the end of its own message', () => {
    expect(isChunk({ ...good, seq: 5, total: 2 })).toBe(false)
  })
})

describe('Reassembler', () => {
  const packet = 'x'.repeat(CHUNK_SIZE * 2 + 50)

  it('rebuilds a message from in-order chunks', () => {
    const r = new Reassembler()
    const chunks = chunkPacket('m1', packet)
    const results = chunks.map(c => r.push(c))
    expect(results.slice(0, -1).every(x => x.state === 'incomplete')).toBe(true)
    const last = results.at(-1)!
    expect(last.state).toBe('complete')
    expect(last.state === 'complete' && last.packet).toBe(packet)
  })

  it('rebuilds a message from chunks arriving out of order', () => {
    // SCTP does not guarantee ordering on an unordered channel, so this is
    // the normal case, not an edge case.
    const r = new Reassembler()
    const chunks = chunkPacket('m1', packet)
    const shuffled = [chunks[2], chunks[0], chunks[1]]
    const last = shuffled.map(c => r.push(c)).at(-1)!
    expect(last.state === 'complete' && last.packet).toBe(packet)
  })

  it('ignores duplicate chunks instead of double-counting them', () => {
    const r = new Reassembler()
    const chunks = chunkPacket('m1', packet)
    r.push(chunks[0])
    r.push(chunks[0])
    r.push(chunks[0])
    expect(r.push(chunks[1]).state).toBe('incomplete')
    const done = r.push(chunks[2])
    expect(done.state === 'complete' && done.packet).toBe(packet)
  })

  it('interleaves two messages without mixing them up', () => {
    const r = new Reassembler()
    const a = chunkPacket('a', 'A'.repeat(CHUNK_SIZE + 1))
    const b = chunkPacket('b', 'B'.repeat(CHUNK_SIZE + 1))
    r.push(a[0]); r.push(b[0])
    expect(r.inFlight).toBe(2)
    const doneA = r.push(a[1])
    const doneB = r.push(b[1])
    expect(doneA.state === 'complete' && doneA.packet.startsWith('A')).toBe(true)
    expect(doneB.state === 'complete' && doneB.packet.startsWith('B')).toBe(true)
    expect(r.inFlight).toBe(0)
  })

  it('refuses a message claiming an absurd number of chunks', () => {
    // The allocation attack: `total: 4e9` and we buffer until the tab dies.
    const r = new Reassembler()
    const res = r.push({ id: 'evil', seq: 0, total: MAX_CHUNKS + 1, data: 'x' })
    expect(res.state).toBe('rejected')
    expect(res.state === 'rejected' && res.reason).toMatch(/over the .* limit/)
    expect(r.inFlight).toBe(0)
  })

  it('refuses chunks that disagree about the message length', () => {
    // Two different messages sharing one id — neither can be trusted, so the
    // whole entry is dropped rather than half-assembled.
    const r = new Reassembler()
    r.push({ id: 'm1', seq: 0, total: 3, data: 'a' })
    const res = r.push({ id: 'm1', seq: 1, total: 9, data: 'b' })
    expect(res.state).toBe('rejected')
    expect(r.inFlight).toBe(0)
  })

  it('refuses a message whose actual bytes exceed the cap', () => {
    // `total` can be honest while the chunks are individually enormous.
    const r = new Reassembler()
    const huge = 'x'.repeat(CHUNK_SIZE * 64)
    let res = r.push({ id: 'm1', seq: 0, total: 2000, data: huge })
    let pushes = 1
    while (res.state === 'incomplete' && pushes < 2000) {
      res = r.push({ id: 'm1', seq: pushes, total: 2000, data: huge })
      pushes++
    }
    expect(res.state).toBe('rejected')
    expect(res.state === 'rejected' && res.reason).toMatch(/size limit/)
  })

  it('frees memory once a message completes', () => {
    const r = new Reassembler()
    for (const c of chunkPacket('m1', packet)) r.push(c)
    expect(r.inFlight).toBe(0)
  })

  it('reset drops everything half-received', () => {
    const r = new Reassembler()
    r.push(chunkPacket('m1', packet)[0])
    expect(r.inFlight).toBe(1)
    r.reset()
    expect(r.inFlight).toBe(0)
  })
})

describe('path reporting — the UI may not overstate the connection', () => {
  it('calls it direct only when neither end is relaying', () => {
    expect(pathFromCandidateTypes('host', 'srflx')).toBe('direct')
    expect(pathFromCandidateTypes('srflx', 'prflx')).toBe('direct')
  })

  it('calls it relayed when either end is a TURN relay', () => {
    // Saying "no server involved" while TURN carries every byte would be a
    // lie, even though it stays encrypted end to end.
    expect(pathFromCandidateTypes('relay', 'host')).toBe('relayed')
    expect(pathFromCandidateTypes('host', 'relay')).toBe('relayed')
  })

  it('admits it does not know yet rather than guessing direct', () => {
    expect(pathFromCandidateTypes(undefined, 'host')).toBe('unknown')
    expect(pathFromCandidateTypes()).toBe('unknown')
  })

  it('never claims "no server" on the relayed path', () => {
    // Doctrine test. The relayed copy must keep saying a server is involved
    // AND that the data stays encrypted — both halves are the honest answer.
    expect(PATH_LABELS.relayed).not.toMatch(/no server/i)
    expect(PATH_DETAIL.relayed).toMatch(/relay server/i)
    expect(PATH_DETAIL.relayed).toMatch(/end-to-end encrypted/i)
    expect(PATH_DETAIL.direct).toMatch(/No server/i)
  })
})
