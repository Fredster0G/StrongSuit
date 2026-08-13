// ===== P2P wire protocol: signalling envelopes and data-channel chunking =====
// (docs/plans/01-CONNECTIVITY.md §6)
//
// Pure. No WebRTC types, no fetch, no crypto side effects — so every rule
// below is unit-testable without a browser, a network, or a second peer.
// `p2pTransport.ts` owns the actual RTCPeerConnection; this owns what travels
// over it and what a peer is allowed to say.
//
// TWO THINGS THIS FILE IS RESPONSIBLE FOR, both of which are places a naive
// implementation quietly breaks:
//
//   1. CHUNKING. A sealed CWSYNC1 packet for a client with a year of history
//      is far bigger than a data-channel message can carry. Splitting is
//      easy; REASSEMBLING SAFELY is not — chunks arrive out of order, arrive
//      twice, and (if the peer is hostile or buggy) claim to be part of a
//      four-billion-chunk message. All three are handled here, explicitly.
//
//   2. SIGNALLING SHAPE. Everything a peer can send is validated before it
//      reaches any WebRTC API. A signalling server is untrusted by design —
//      see §6.5: "an attacker who compromises the signalling server cannot
//      inject a fake peer."
//
// SECURITY BOUNDARY, stated once so it can't drift: DTLS (WebRTC's own
// encryption) is transport security only. The actual end-to-end guarantee is
// our `CWSYNC1` envelope from `lib/sync.ts`, which is sealed BEFORE it gets
// here and opened AFTER it leaves. Nothing in this file ever sees plaintext,
// and nothing downstream may rely on DTLS alone.

// ------------------------------------------------------------- signalling

export type SignalKind = 'offer' | 'answer' | 'ice'

/**
 * One signalling message, as it sits in the relay's mailbox.
 *
 * Carries connection details only — SDP and ICE candidates — never training
 * data. That claim is load-bearing for what the UI promises the user ("a few
 * kilobytes of connection details, never your data"), so `isSignalMessage`
 * below rejects anything with extra fields rather than passing it through.
 */
export interface SignalMessage {
  kind: SignalKind
  /** Device id of the sender. */
  from: string
  /** Device id of the intended recipient. */
  to: string
  /** Groups the messages of one connection attempt, so a stale offer from a
   *  previous attempt can't be mistaken for the current one. */
  session: string
  /** SDP text for offer/answer, or the candidate string for ice. */
  payload: string
  /** ICE only: which m-line this candidate belongs to. */
  sdpMid?: string
  sdpMLineIndex?: number
  createdAt: string
}

/** Fields a signalling message may contain. Anything else is rejected — an
 *  unknown field is either a protocol version we don't understand or an
 *  attempt to smuggle something past us, and neither should be forwarded to
 *  a WebRTC API. */
const SIGNAL_FIELDS = new Set([
  'kind', 'from', 'to', 'session', 'payload', 'sdpMid', 'sdpMLineIndex', 'createdAt',
])

/** Generous, but not unbounded. A real SDP is a few KB; anything approaching
 *  this is not a connection description. */
export const MAX_SIGNAL_PAYLOAD = 64 * 1024

/**
 * Validate a signalling message from an untrusted source.
 *
 * The signalling server is untrusted BY DESIGN (§6.5) — it's the one part of
 * the P2P path that isn't end-to-end encrypted, because it can't be. So
 * everything it hands us gets checked before it reaches `setRemoteDescription`
 * or `addIceCandidate`.
 */
export function isSignalMessage(v: unknown): v is SignalMessage {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>

  for (const key of Object.keys(m)) {
    if (!SIGNAL_FIELDS.has(key)) return false
  }

  if (m.kind !== 'offer' && m.kind !== 'answer' && m.kind !== 'ice') return false
  for (const key of ['from', 'to', 'session', 'payload', 'createdAt'] as const) {
    if (typeof m[key] !== 'string' || !(m[key] as string).length) return false
  }
  if ((m.payload as string).length > MAX_SIGNAL_PAYLOAD) return false
  if (m.sdpMid !== undefined && typeof m.sdpMid !== 'string') return false
  if (m.sdpMLineIndex !== undefined && typeof m.sdpMLineIndex !== 'number') return false

  // An offer or answer that isn't SDP has no business reaching the WebRTC
  // stack, whatever the server claims it is.
  if (m.kind !== 'ice' && !(m.payload as string).startsWith('v=')) return false

  return true
}

/**
 * Is this message for us, from the peer we think we're talking to, and part
 * of the attempt we're currently making?
 *
 * Separate from `isSignalMessage` deliberately: one asks "is this well
 * formed", the other asks "is this mine". Conflating them is how a stale
 * offer from a previous attempt ends up tearing down a working connection.
 */
export function isForUs(m: SignalMessage, opts: {
  ourDeviceId: string
  peerDeviceId: string
  session: string
}): boolean {
  return m.to === opts.ourDeviceId
    && m.from === opts.peerDeviceId
    && m.session === opts.session
}

// --------------------------------------------------------------- chunking

/**
 * Bytes per data-channel message.
 *
 * 16 KB, not the 256 KB modern browsers allow: the spec-guaranteed floor for
 * interoperable implementations is 64 KB, and SCTP fragmentation behaviour
 * has historically been the least reliable corner of WebRTC across browser
 * versions. Sync payloads are not latency-critical, so buying reliability
 * with a few more round trips is the right trade.
 */
export const CHUNK_SIZE = 16 * 1024

/** Hard cap on a reassembled message. A year of one client's history seals to
 *  a few MB; 32 MB is well clear of that and still bounds what a peer can
 *  make us buffer. */
export const MAX_MESSAGE_BYTES = 32 * 1024 * 1024
export const MAX_CHUNKS = Math.ceil(MAX_MESSAGE_BYTES / CHUNK_SIZE)

export interface Chunk {
  /** Groups chunks of one message. */
  id: string
  seq: number
  total: number
  data: string
}

/** Split a sealed packet for the data channel. */
export function chunkPacket(id: string, packet: string): Chunk[] {
  if (!packet.length) return [{ id, seq: 0, total: 1, data: '' }]
  const chunks: Chunk[] = []
  const total = Math.ceil(packet.length / CHUNK_SIZE)
  for (let i = 0; i < total; i++) {
    chunks.push({ id, seq: i, total, data: packet.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) })
  }
  return chunks
}

export function isChunk(v: unknown): v is Chunk {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return typeof c.id === 'string' && c.id.length > 0
    && typeof c.seq === 'number' && Number.isInteger(c.seq) && c.seq >= 0
    && typeof c.total === 'number' && Number.isInteger(c.total) && c.total > 0
    && typeof c.data === 'string'
    && c.seq < c.total
}

export type ReassembleResult =
  | { state: 'incomplete'; received: number; total: number }
  | { state: 'complete'; packet: string }
  | { state: 'rejected'; reason: string }

/**
 * Rebuilds messages from chunks arriving in any order, possibly more than
 * once, possibly from a peer that is lying.
 *
 * Every guard here corresponds to something that actually happens: SCTP does
 * not guarantee ordering on an unordered channel, retries duplicate chunks,
 * and a compromised peer can claim `total: 4000000000` to make us allocate
 * until the tab dies. "It worked when I tested it locally" is not evidence
 * about any of these.
 */
export class Reassembler {
  private pending = new Map<string, { total: number; parts: Map<number, string>; bytes: number }>()

  push(chunk: Chunk): ReassembleResult {
    if (chunk.total > MAX_CHUNKS) {
      return { state: 'rejected', reason: `message claims ${chunk.total} chunks, over the ${MAX_CHUNKS} limit` }
    }

    let entry = this.pending.get(chunk.id)
    if (!entry) {
      entry = { total: chunk.total, parts: new Map(), bytes: 0 }
      this.pending.set(chunk.id, entry)
    }

    // A chunk that disagrees with its siblings about the message length means
    // two different messages are using one id. Neither can be trusted.
    if (entry.total !== chunk.total) {
      this.pending.delete(chunk.id)
      return { state: 'rejected', reason: 'chunk disagrees with the rest of the message about its length' }
    }

    // Duplicates are expected, not exceptional — ignore rather than re-add,
    // so `bytes` stays an honest running total.
    if (!entry.parts.has(chunk.seq)) {
      entry.bytes += chunk.data.length
      if (entry.bytes > MAX_MESSAGE_BYTES) {
        this.pending.delete(chunk.id)
        return { state: 'rejected', reason: 'message exceeds the size limit' }
      }
      entry.parts.set(chunk.seq, chunk.data)
    }

    if (entry.parts.size < entry.total) {
      return { state: 'incomplete', received: entry.parts.size, total: entry.total }
    }

    const ordered: string[] = []
    for (let i = 0; i < entry.total; i++) ordered.push(entry.parts.get(i)!)
    this.pending.delete(chunk.id)
    return { state: 'complete', packet: ordered.join('') }
  }

  /** Messages part-received right now. Drives "still transferring" in the UI
   *  and lets a caller notice a stalled transfer. */
  get inFlight(): number {
    return this.pending.size
  }

  reset(): void {
    this.pending.clear()
  }
}

// ------------------------------------------------------------ path naming

/** How the connection is actually carrying data, once ICE settles. */
export type P2pPath = 'direct' | 'relayed' | 'unknown'

/**
 * Read the negotiated path from an ICE candidate pair.
 *
 * The UI must never say "direct, no server involved" when TURN is relaying
 * the bytes (§6.2/§6.3). Both are end-to-end encrypted, so this is not a
 * security difference — it is a **truthfulness** one, and the claim we make
 * on screen has to match what the connection is doing.
 */
export function pathFromCandidateTypes(local?: string, remote?: string): P2pPath {
  if (!local || !remote) return 'unknown'
  return local === 'relay' || remote === 'relay' ? 'relayed' : 'direct'
}

export const PATH_LABELS: Record<P2pPath, string> = {
  direct: 'Direct — peer to peer',
  relayed: 'Direct via relay assist',
  unknown: 'Connecting…',
}

/** What the user is told about each path, in full. No path gets a label that
 *  overstates it. */
export const PATH_DETAIL: Record<P2pPath, string> = {
  direct: 'Connected straight to their device. No server is carrying your data.',
  relayed: 'Your network blocked a direct connection, so the data is being routed through a relay server. ' +
    'It stays end-to-end encrypted the whole way — the relay only sees ciphertext.',
  unknown: 'Working out the best route to their device.',
}
