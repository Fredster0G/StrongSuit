// ===== Offline licence verification (docs/plans/06-EDITIONS-PRICING.md §4.5–4.6) =====
//
// TWO PROMISES ARE ENCODED HERE, and both are load-bearing enough that tests
// enforce them rather than comments:
//
//   1. **BUY ONCE, UPDATES FOREVER — for every key this file has ever signed
//      or ever will.** No paid version upgrades, ever — v3, v4, all of it. So
//      a licence carries NO expiry and NO maximum version, and
//      `verifyLicence()` has nowhere to put one. `licenceNeverExpires()`
//      fails first if that ever changes.
//
//      S15 update: the business ALSO now sells a $29/mo membership
//      alongside this (docs/MEMBERSHIP.md has the full reasoning). That is
//      deliberately NOT represented here — a membership is a genuinely
//      different kind of entitlement (renewable, revocable, requires the
//      sync server to be reachable periodically) and living in
//      `lib/membership.ts` as its own signed-token type, with its own
//      key prefix (`CWM1.` vs this file's `CW1.`), so that nothing about
//      this file, this claims shape, or any one-time key it has already
//      signed changes even one bit. A `Licence` from this file still means
//      exactly what it always meant.
//
//   2. **NO ACTIVATION SERVER.** Keys are signed by us and verified locally
//      with an embedded public key. `HOW-TO-OWN-IT.md` promises the app keeps
//      working if we vanish; a licence server would make that false. Nothing
//      in here touches the network — it cannot, structurally.
//
// The signature is ECDSA P-256 over the canonical JSON of the claims, which
// reuses exactly the primitives `lib/sync.ts` already relies on. A forged key
// requires our private key; a tampered claim set fails the signature. What
// this deliberately does NOT try to prevent is a determined user patching
// their own copy of the binary — that is unpreventable in a local-first app,
// and pretending otherwise would mean an activation server we've promised not
// to build. Honest licensing keeps honest people honest.

import type { Edition } from './edition'

/** Claims inside a licence key. Note what is absent: no expiry, no version
 *  ceiling, no seat metering beyond Studio's own seat count. */
export interface LicenceClaims {
  /** Who it was issued to — shown in Settings so a coach can confirm it. */
  name: string
  edition: Edition
  /** Studio only; ignored elsewhere. */
  seats?: number
  /** ISO date of purchase. Drives the anniversary note and Founding Member
   *  status — never an expiry check. */
  issuedAt: string
  /** Sequence number of this licence. ≤ FOUNDING_MEMBER_LIMIT = founding. */
  serial?: number
  /** Discount programme this was issued under, for the record. */
  programme?: 'standard' | 'launch' | 'education' | 'nonprofit' | 'founding'
}

export interface Licence {
  claims: LicenceClaims
  /** base64url ECDSA P-256 signature over `canonicalClaims(claims)`. */
  signature: string
}

export type LicenceStatus =
  | { valid: true; claims: LicenceClaims }
  | { valid: false; reason: string }

/** First 500 licences carry Founding Member status permanently (§4.6). */
export const FOUNDING_MEMBER_LIMIT = 500

/**
 * Canonical serialisation of the claims — what actually gets signed.
 *
 * Key order is fixed explicitly rather than taken from `Object.keys`, because
 * a signature over JSON whose field order can vary is a signature that
 * verifies on one machine and fails on another.
 */
export function canonicalClaims(c: LicenceClaims): string {
  return JSON.stringify([
    c.name,
    c.edition,
    c.seats ?? 0,
    c.issuedAt,
    c.serial ?? 0,
    c.programme ?? 'standard',
  ])
}

/** Returns a view backed by a real `ArrayBuffer`, not `ArrayBufferLike` —
 *  WebCrypto's `BufferSource` won't accept a possibly-shared buffer, and the
 *  difference only shows up under `tsc`, never at runtime or in tests.
 *  Exported so `lib/membership.ts` reuses the exact same encoding rather than
 *  a second copy — both files sign/verify against the same embedded key. */
export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Same reason as above, for the signed payload. */
export function utf8(s: string): Uint8Array<ArrayBuffer> {
  const src = new TextEncoder().encode(s)
  const out = new Uint8Array(new ArrayBuffer(src.length))
  out.set(src)
  return out
}

export function bytesToB64url(b: Uint8Array): string {
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A licence key as the customer sees it: `CW1.<claims>.<signature>`, both
 * base64url. Prefixed and versioned so a future format can be told apart
 * rather than failing with a confusing signature error.
 */
export function encodeLicenceKey(l: Licence): string {
  const claims = bytesToB64url(utf8(JSON.stringify(l.claims)))
  return `CW1.${claims}.${l.signature}`
}

export function decodeLicenceKey(key: string): Licence | null {
  const parts = key.trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'CW1') return null
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as LicenceClaims
    if (!claims || typeof claims !== 'object') return null
    if (typeof claims.name !== 'string' || typeof claims.issuedAt !== 'string') return null
    if (!['personal', 'independent', 'studio'].includes(claims.edition)) return null
    return { claims, signature: parts[2] }
  } catch {
    return null
  }
}

/**
 * Our signing public key, as a JWK.
 *
 * Generated S15 as a real ECDSA P-256 keypair — this half is safe to ship
 * (it can only verify, never sign). The matching private key lives outside
 * this repository entirely, at `StrongSuit-release-keys/` (a sibling of
 * this repo, not a subdirectory of it — see that folder's README), together
 * with `mint-licence.mjs`, the standalone tool that actually issues licence
 * keys. Nothing under this repo root can sign a licence, by construction.
 */
export const RELEASE_PUBLIC_JWK: JsonWebKey | null = {
  key_ops: ['verify'],
  ext: true,
  kty: 'EC',
  x: 'f0teaQeJV8_PsV_JQvH-laSddAWT7SVi7ygbG27LOws',
  y: 'qGF80fkhviu5SZA79vtLxaVJf2keydfFCY7WiznaarY',
  crv: 'P-256',
}

/**
 * Verify a key offline.
 *
 * `publicJwk` is a parameter so tests can supply their own keypair and so a
 * self-hosted/enterprise deployment could, in principle, be issued under a
 * different key — never so that a caller can skip verification.
 */
export async function verifyLicence(
  key: string,
  publicJwk: JsonWebKey | null = RELEASE_PUBLIC_JWK,
): Promise<LicenceStatus> {
  const parsed = decodeLicenceKey(key)
  if (!parsed) return { valid: false, reason: 'That doesn’t look like a Coachwright licence key.' }
  if (!publicJwk) {
    return { valid: false, reason: 'This build has no signing key configured, so licences can’t be checked.' }
  }

  try {
    const pub = await crypto.subtle.importKey(
      'jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    )
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      b64urlToBytes(parsed.signature),
      utf8(canonicalClaims(parsed.claims)),
    )
    return ok
      ? { valid: true, claims: parsed.claims }
      : { valid: false, reason: 'This key’s signature doesn’t match. Check it was copied in full.' }
  } catch {
    return { valid: false, reason: 'This key couldn’t be read. Check it was copied in full.' }
  }
}

/** Sign a claim set. Used by tests and by the release tooling — never by the
 *  app, which has no private key and must not. */
export async function signLicence(claims: LicenceClaims, privateJwk: JsonWebKey): Promise<Licence> {
  const priv = await crypto.subtle.importKey(
    'jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, priv,
    utf8(canonicalClaims(claims)),
  )
  return { claims, signature: bytesToB64url(new Uint8Array(sig)) }
}

// ------------------------------------------------------- the promise itself

/**
 * Does a valid licence ever stop entitling the owner to this build?
 *
 * Always false, and that is the point. Kept as a function rather than a
 * comment so the promise has a name a test can assert on and a future
 * "expiresAt" check has something to visibly contradict.
 */
export function licenceNeverExpires(): true {
  return true
}

/**
 * Is this build covered by this licence?
 *
 * Takes the app version and ignores it, deliberately. Every version, forever,
 * is included — §4.5, decided. The parameter exists so the call site reads
 * honestly at the point where a version check would otherwise be added.
 */
export function entitledToVersion(status: LicenceStatus, _appVersion: string): boolean {
  return status.valid
}

/** Founding Member status is permanent and derives from the serial, never
 *  from a date or a subscription (§4.6). */
export function isFoundingMember(claims: LicenceClaims): boolean {
  return claims.serial != null && claims.serial > 0 && claims.serial <= FOUNDING_MEMBER_LIMIT
}

/** Whole years owned, for the anniversary note. Never used to restrict. */
export function ownershipYears(claims: LicenceClaims, now = new Date()): number {
  const from = new Date(claims.issuedAt)
  if (Number.isNaN(from.getTime())) return 0
  let years = now.getFullYear() - from.getFullYear()
  const beforeAnniversary =
    now.getMonth() < from.getMonth() ||
    (now.getMonth() === from.getMonth() && now.getDate() < from.getDate())
  if (beforeAnniversary) years--
  return Math.max(0, years)
}

/** True on the purchase anniversary — the moment §4.6 wants a genuine "here
 *  is what shipped this year, free, because you own it" note. No upsell. */
export function isAnniversary(claims: LicenceClaims, now = new Date()): boolean {
  const from = new Date(claims.issuedAt)
  if (Number.isNaN(from.getTime())) return false
  return from.getMonth() === now.getMonth()
    && from.getDate() === now.getDate()
    && now.getFullYear() > from.getFullYear()
}
