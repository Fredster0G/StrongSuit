// ===== P2P connection lifecycle (docs/plans/01-CONNECTIVITY.md §6) =====
//
// Owns one connection attempt from "we'd like to reach this peer" to "a
// sealed packet came back", and nothing else. WebRTC and the signalling
// channel are both INJECTED — not for purity's sake, but because the failure
// modes that matter here (nobody answers, both sides offer at once, the
// channel opens and then dies mid-transfer) are the ones you cannot reproduce
// on demand against a real network, and every one of them is a test below.
//
// GLARE, and why there is no rollback logic here: if both peers offer at the
// same moment, WebRTC's own answer is the "polite peer" pattern — one side
// rolls back its local description and accepts the other's offer. That is
// genuinely fiddly and easy to get subtly wrong. We avoid needing it: the two
// device ids are already known to both sides, so the LEXICOGRAPHICALLY
// SMALLER ID ALWAYS OFFERS. The situation cannot arise, so the code that
// would handle it doesn't exist. See `roleFor`.

import { chunkPacket, isChunk, isSignalMessage, isForUs, Reassembler, pathFromCandidateTypes, type P2pPath, type SignalMessage } from './p2pProtocol'

// Structural subsets of the WebRTC API — just enough to drive a connection,
// so a fake in a test doesn't have to implement the whole standard.
export interface DataChannelLike {
  readyState: string
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onclose: (() => void) | null
  onerror: ((e: unknown) => void) | null
  onmessage: ((e: { data: unknown }) => void) | null
}

export interface PeerConnectionLike {
  createDataChannel(label: string): DataChannelLike
  createOffer(): Promise<{ type: string; sdp?: string }>
  createAnswer(): Promise<{ type: string; sdp?: string }>
  setLocalDescription(d: { type: string; sdp?: string }): Promise<void>
  setRemoteDescription(d: { type: string; sdp?: string }): Promise<void>
  addIceCandidate(c: { candidate: string; sdpMid?: string; sdpMLineIndex?: number }): Promise<void>
  close(): void
  onicecandidate: ((e: { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null }) => void) | null
  ondatachannel: ((e: { channel: DataChannelLike }) => void) | null
  onconnectionstatechange: (() => void) | null
  connectionState: string
  /** Used only to report direct-vs-relayed honestly. Optional: a connection
   *  that can't tell us reports 'unknown' rather than claiming 'direct'. */
  getSelectedCandidatePair?(): Promise<{ localType?: string; remoteType?: string } | null>
}

/** Moves signalling messages via whatever rendezvous is configured — in
 *  practice the existing relay, which already has per-coach keys and knows
 *  about pairings (§6.4: no new service, no new auth model). */
export interface SignalChannel {
  send(m: SignalMessage): Promise<void>
  /** Messages waiting for us, oldest first. Polled. */
  poll(): Promise<unknown[]>
}

export type SessionRole = 'offerer' | 'answerer'

/**
 * Who offers. Deterministic and symmetric: both sides compute the same answer
 * from the same two ids, so glare cannot happen and neither side needs to
 * negotiate roles.
 */
export function roleFor(ourDeviceId: string, peerDeviceId: string): SessionRole {
  return ourDeviceId < peerDeviceId ? 'offerer' : 'answerer'
}

export interface P2pSessionOptions {
  ourDeviceId: string
  peerDeviceId: string
  /** Groups this attempt's messages. */
  session: string
  createConnection: () => PeerConnectionLike
  signal: SignalChannel
  /** Give up after this long. P2P is an optimisation — if it hasn't connected
   *  quickly the broker should be falling through to the relay, not making
   *  the user wait. */
  timeoutMs?: number
  /** Injected for tests. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export const DEFAULT_TIMEOUT_MS = 15_000
export const POLL_INTERVAL_MS = 700
export const CHANNEL_LABEL = 'coachwright-sync'

export class P2pTimeoutError extends Error {
  constructor(stage: string) {
    super(`P2P connection timed out while ${stage}.`)
    this.name = 'P2pTimeoutError'
  }
}

export interface ExchangeOutcome {
  /** The peer's sealed packet. Still encrypted — this layer never opens it. */
  packet: string
  path: P2pPath
}

/**
 * One connection attempt. Single-use: construct, `exchange`, discard.
 *
 * Deliberately not reusable. A half-torn-down peer connection that gets
 * reused is the source of the "works the first time, wedges after that" class
 * of WebRTC bug, and the tracker in Film Room already taught this codebase
 * that lesson once (debt #30).
 */
export class P2pSession {
  private pc: PeerConnectionLike | null = null
  private channel: DataChannelLike | null = null
  private reassembler = new Reassembler()
  private closed = false
  private readonly opts: Required<Pick<P2pSessionOptions, 'timeoutMs' | 'now' | 'sleep'>> & P2pSessionOptions

  // The peer's packet, resolved by whichever chunk completes it.
  //
  // Created UP FRONT, and the channel's `onmessage` is attached the moment the
  // channel exists rather than when we get around to reading — because the
  // other side can legitimately send the instant its channel opens, and a
  // handler attached one tick later drops that data on the floor. Both peers
  // open at the same moment by design, so this race is the normal case, not a
  // rare one.
  private resolveInbound!: (packet: string) => void
  private rejectInbound!: (err: Error) => void
  private readonly inbound = new Promise<string>((resolve, reject) => {
    this.resolveInbound = resolve
    this.rejectInbound = reject
  })

  constructor(options: P2pSessionOptions) {
    this.opts = {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      now: () => Date.now(),
      sleep: (ms: number) => new Promise(r => setTimeout(r, ms)),
      ...options,
    }
    // Nothing awaits `inbound` until `transfer`, and an unhandled rejection
    // before then would surface as a spurious crash.
    this.inbound.catch(() => {})
  }

  get role(): SessionRole {
    return roleFor(this.opts.ourDeviceId, this.opts.peerDeviceId)
  }

  /**
   * Connect, send ours, wait for theirs, tear down.
   *
   * Always closes the connection, including on failure — a leaked
   * RTCPeerConnection keeps ICE agents and sockets alive, and on a phone that
   * is a battery bug the user experiences as "the app drains my battery" long
   * after the sync they remember.
   */
  async exchange(ourPacket: string): Promise<ExchangeOutcome> {
    try {
      await this.connect()
      const theirs = await this.transfer(ourPacket)
      return { packet: theirs, path: await this.detectPath() }
    } finally {
      this.close()
    }
  }

  private async connect(): Promise<void> {
    const pc = this.opts.createConnection()
    this.pc = pc

    const pendingRemoteIce: { candidate: string; sdpMid?: string; sdpMLineIndex?: number }[] = []
    let remoteDescriptionSet = false

    pc.onicecandidate = e => {
      if (!e.candidate) return // null = gathering finished
      void this.opts.signal.send({
        kind: 'ice',
        from: this.opts.ourDeviceId,
        to: this.opts.peerDeviceId,
        session: this.opts.session,
        payload: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid ?? undefined,
        sdpMLineIndex: e.candidate.sdpMLineIndex ?? undefined,
        createdAt: new Date(this.opts.now()).toISOString(),
      }).catch(() => {
        // A dropped candidate is survivable — ICE tries others, and failing
        // the whole attempt because one POST failed would be worse.
      })
    }

    const channelOpen = this.makeChannelPromise(pc)

    if (this.role === 'offerer') {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await this.opts.signal.send(this.describe('offer', offer.sdp ?? ''))
    }

    // Poll signalling until the handshake completes or we give up.
    const deadline = this.opts.now() + this.opts.timeoutMs
    let answered = this.role === 'answerer' ? false : false
    while (!answered && !this.closed) {
      if (this.opts.now() > deadline) {
        throw new P2pTimeoutError(this.role === 'offerer' ? 'waiting for the other device to answer' : 'waiting for an offer')
      }

      for (const raw of await this.opts.signal.poll()) {
        if (!isSignalMessage(raw)) continue // untrusted source — see p2pProtocol
        if (!isForUs(raw, this.opts)) continue

        if (raw.kind === 'ice') {
          const candidate = { candidate: raw.payload, sdpMid: raw.sdpMid, sdpMLineIndex: raw.sdpMLineIndex }
          // ICE can legitimately arrive before the description it belongs to;
          // adding it then throws, so hold it until there's somewhere to put it.
          if (remoteDescriptionSet) await pc.addIceCandidate(candidate).catch(() => {})
          else pendingRemoteIce.push(candidate)
          continue
        }

        if (raw.kind === 'offer' && this.role === 'answerer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: raw.payload })
          remoteDescriptionSet = true
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await this.opts.signal.send(this.describe('answer', answer.sdp ?? ''))
          answered = true
        } else if (raw.kind === 'answer' && this.role === 'offerer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: raw.payload })
          remoteDescriptionSet = true
          answered = true
        }

        if (remoteDescriptionSet && pendingRemoteIce.length) {
          for (const c of pendingRemoteIce.splice(0)) await pc.addIceCandidate(c).catch(() => {})
        }
      }

      if (!answered) await this.opts.sleep(POLL_INTERVAL_MS)
    }

    this.channel = await channelOpen
  }

  /** The offerer creates the channel; the answerer waits to be handed one. */
  private makeChannelPromise(pc: PeerConnectionLike): Promise<DataChannelLike> {
    return new Promise<DataChannelLike>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new P2pTimeoutError('waiting for the data channel to open')),
        this.opts.timeoutMs,
      )
      const ready = (ch: DataChannelLike) => {
        clearTimeout(deadline)
        resolve(ch)
      }
      // Attach as soon as the channel object exists — see `inbound` above.
      const listen = (ch: DataChannelLike) => {
        this.attachInbound(ch)
        if (ch.readyState === 'open') ready(ch)
        else ch.onopen = () => ready(ch)
      }

      if (this.role === 'offerer') {
        const ch = pc.createDataChannel(CHANNEL_LABEL)
        ch.onerror = () => { clearTimeout(deadline); reject(new Error('The direct connection failed to open.')) }
        listen(ch)
      } else {
        pc.ondatachannel = e => listen(e.channel)
      }
    })
  }

  /** Routes incoming chunks into the reassembler. Installed once, at channel
   *  creation, so no data can arrive before someone is listening. */
  private attachInbound(ch: DataChannelLike): void {
    ch.onmessage = e => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(e.data))
      } catch {
        return // not ours; ignore rather than tearing down a working connection
      }
      if (!isChunk(parsed)) return
      const result = this.reassembler.push(parsed)
      if (result.state === 'complete') this.resolveInbound(result.packet)
      else if (result.state === 'rejected') {
        this.rejectInbound(new Error(`The other device sent something we couldn't accept: ${result.reason}`))
      }
    }
    ch.onclose = () => {
      // Harmless once the packet is already in hand — a settled promise
      // ignores this — and the right error when it isn't.
      this.rejectInbound(new Error('The direct connection dropped before the transfer finished.'))
    }
  }

  private async transfer(ourPacket: string): Promise<string> {
    const ch = this.channel
    if (!ch) throw new Error('The direct connection closed before anything could be sent.')

    const messageId = `${this.opts.session}-${this.opts.ourDeviceId}`
    for (const chunk of chunkPacket(messageId, ourPacket)) {
      ch.send(JSON.stringify(chunk))
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new P2pTimeoutError('waiting for the other device to send its data')),
        this.opts.timeoutMs,
      )
    })
    try {
      return await Promise.race([this.inbound, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  private async detectPath(): Promise<P2pPath> {
    try {
      const pair = await this.pc?.getSelectedCandidatePair?.()
      return pathFromCandidateTypes(pair?.localType, pair?.remoteType)
    } catch {
      // Reporting 'unknown' is correct here. Guessing 'direct' would put a
      // claim on screen we haven't verified.
      return 'unknown'
    }
  }

  private describe(kind: 'offer' | 'answer', sdp: string): SignalMessage {
    return {
      kind,
      from: this.opts.ourDeviceId,
      to: this.opts.peerDeviceId,
      session: this.opts.session,
      payload: sdp,
      createdAt: new Date(this.opts.now()).toISOString(),
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.reassembler.reset()
    try { this.channel?.close() } catch { /* already gone */ }
    try { this.pc?.close() } catch { /* already gone */ }
    this.channel = null
    this.pc = null
  }
}
