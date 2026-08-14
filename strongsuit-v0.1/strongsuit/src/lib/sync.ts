// ===== Secure coach↔client sync (spec §4.23) =====
// Serverless, end-to-end encrypted sync between paired devices. Uses the Web
// Crypto API only — no keys ever hardcoded, nothing sent to any server.
//
// Model (matches how professional E2EE pairing works — Signal-style):
//   1. Each device holds a long-lived ECDH P-256 keypair (its identity).
//   2. Pairing exchanges PUBLIC keys (via a scannable/paste code). A short
//      6-digit "safety number" (SAS) is derived from both public keys; the two
//      people read it to each other out loud. Matching digits prove there was
//      no machine-in-the-middle swapping keys.
//   3. A shared secret is derived by ECDH and stretched with HKDF-SHA256 into
//      an AES-GCM key. Every sync packet is AES-GCM sealed (confidential +
//      tamper-evident) and carries a monotonic sequence number (replay guard).
//
// The transport is deliberately abstract: a sealed packet is just text, so it
// rides whatever channel is at hand today — AirDrop, a shared-WiFi file, a
// QR image, email — and a live LAN/WebRTC transport can drop in later without
// touching this crypto.

const te = new TextEncoder()
const td = new TextDecoder()

function b64(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach(b => (s += String.fromCharCode(b)))
  return btoa(s)
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const

// ---- identity ----
export interface Identity {
  publicJwk: JsonWebKey
  privateJwk: JsonWebKey
}

/** Generate a device identity (ECDH P-256 keypair as JWK for local storage). */
export async function generateIdentity(): Promise<Identity> {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveKey', 'deriveBits'])
  const [publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.publicKey),
    crypto.subtle.exportKey('jwk', pair.privateKey),
  ])
  return { publicJwk, privateJwk }
}

async function importPrivate(jwk: JsonWebKey) {
  return crypto.subtle.importKey('jwk', jwk, ECDH, false, ['deriveKey', 'deriveBits'])
}
async function importPublic(jwk: JsonWebKey) {
  return crypto.subtle.importKey('jwk', jwk, ECDH, false, [])
}

/** Derive the shared AES-GCM key from my private + their public key (HKDF). */
export async function deriveSharedKey(myPrivateJwk: JsonWebKey, theirPublicJwk: JsonWebKey): Promise<CryptoKey> {
  const priv = await importPrivate(myPrivateJwk)
  const pub = await importPublic(theirPublicJwk)
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256)
  const hkdfKey = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: te.encode('coachwright-sync-v1'), info: te.encode('aes-gcm') },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Short authentication string: a 6-digit safety number both people verify out
 * loud. Order-independent (both devices compute the same value) by sorting the
 * two public-key thumbprints before hashing.
 */
export async function safetyNumber(pubA: JsonWebKey, pubB: JsonWebKey): Promise<string> {
  const a = `${pubA.x}.${pubA.y}`
  const b = `${pubB.x}.${pubB.y}`
  const joined = [a, b].sort().join('|')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(joined)))
  // fold first 4 bytes into a 6-digit code
  const n = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0
  return String(n % 1_000_000).padStart(6, '0')
}

// ---- pairing code (public key, transport-agnostic) ----
export interface PairingCode {
  v: 1
  deviceId: string
  name: string
  role: 'coach' | 'client'
  pub: JsonWebKey
  /** Optional transport hints (added S13, backward compatible — old apps
   *  simply ignore unknown fields). A coach's code can carry their relay
   *  address/key so a scanned QR pairs AND configures sync in one step.
   *  These hints are conveniences, not identity — the crypto above is the
   *  only part that authenticates anyone. */
  relay?: string
  relayKey?: string
}

export function encodePairingCode(c: PairingCode): string {
  return b64(te.encode(JSON.stringify(c)))
}
export function decodePairingCode(text: string): PairingCode {
  let obj: unknown
  try {
    obj = JSON.parse(td.decode(unb64(text.trim())))
  } catch {
    throw new Error("That pairing code isn't valid. Copy the whole code and try again.")
  }
  const c = obj as PairingCode
  if (c?.v !== 1 || !c.pub || !c.deviceId) throw new Error("That pairing code isn't a Coachwright code.")
  return c
}

// ---- sealed sync packets ----
const PACKET_MAGIC = 'CWSYNC1'

export interface SyncPacketMeta {
  from: string
  to: string
  seq: number
  createdAt: string
}
export interface SyncPacket<T = unknown> extends SyncPacketMeta {
  payload: T
}

/** AES-GCM seal a payload into a transportable string. */
export async function sealSyncPacket<T>(sharedKey: CryptoKey, meta: SyncPacketMeta, payload: T): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = te.encode(JSON.stringify({ ...meta, payload }))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, sharedKey, body))
  return [PACKET_MAGIC, b64(iv), b64(ct)].join('\n')
}

export function isSyncPacket(text: string): boolean {
  return text.startsWith(PACKET_MAGIC + '\n')
}

/** Open + authenticate a sealed packet. Throws friendly errors on any failure. */
export async function openSyncPacket<T = unknown>(sharedKey: CryptoKey, text: string): Promise<SyncPacket<T>> {
  const [magic, ivB64, ctB64] = text.split('\n')
  if (magic !== PACKET_MAGIC) throw new Error("That file isn't a Coachwright sync packet.")
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(ivB64) as BufferSource }, sharedKey, unb64(ctB64) as BufferSource,
    )
    return JSON.parse(td.decode(pt)) as SyncPacket<T>
  } catch {
    throw new Error("Couldn't open this sync packet — it's for a different pairing, or it was altered.")
  }
}

/** sha-256 hex, used for tamper-evident waiver hashes and general integrity. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(text)))
  return Array.from(digest).map(b => b.toString(16).padStart(2, '0')).join('')
}
