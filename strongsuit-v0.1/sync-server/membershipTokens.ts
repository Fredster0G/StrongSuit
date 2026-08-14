// ===== Membership token signing (server side) =====
//
// Mirrors `strongsuit/src/lib/membership.ts` byte-for-byte: same claim
// shape, same canonical JSON array, same base64url encoding, same `CWM1.`
// prefix. The app verifies these tokens entirely offline against the public
// half of this same keypair (`RELEASE_PUBLIC_JWK` in that file) — this is
// the only place in the whole system that holds the private half, loaded
// from an env var, never committed anywhere. If you change the claim shape
// or canonicalization here, the app-side file has to change identically or
// every token this mints will fail to verify.

// Uses Node's `node:crypto` webcrypto implementation rather than the
// ambient `crypto` global — this project's tsconfig has no DOM lib (a
// server has no window), so `webcrypto`'s own Node types (including
// `JsonWebKey`) are what's available, and its SubtleCrypto behaves
// identically to the browser API the app-side file uses.
import { webcrypto } from 'node:crypto'

export interface MembershipClaims {
  name: string
  subscriptionId: string
  issuedAt: string
  expiresAt: string
}

function canonicalMembershipClaims(c: MembershipClaims): string {
  return JSON.stringify([c.name, c.subscriptionId, c.issuedAt, c.expiresAt])
}

function utf8(s: string): Uint8Array<ArrayBuffer> {
  const src = new TextEncoder().encode(s)
  const out = new Uint8Array(new ArrayBuffer(src.length))
  out.set(src)
  return out
}

function bytesToB64url(b: Uint8Array): string {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Parsed once at boot from `LICENCE_SIGNING_PRIVATE_JWK` — see
 *  docs/MEMBERSHIP.md for how this key is generated and deployed. `null`
 *  means this instance can't mint membership tokens (fine for a self-hoster
 *  who isn't selling memberships; the `/membership` routes refuse cleanly). */
export function loadSigningKey(): webcrypto.JsonWebKey | null {
  const raw = process.env.LICENCE_SIGNING_PRIVATE_JWK
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.kty !== 'EC' || parsed?.crv !== 'P-256') return null
    return parsed
  } catch {
    return null
  }
}

export async function signMembershipToken(claims: MembershipClaims, privateJwk: webcrypto.JsonWebKey): Promise<string> {
  const priv = await webcrypto.subtle.importKey(
    'jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  const sig = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, priv,
    utf8(canonicalMembershipClaims(claims)),
  )
  const claimsB64 = bytesToB64url(utf8(JSON.stringify(claims)))
  const sigB64 = bytesToB64url(new Uint8Array(sig))
  return `CWM1.${claimsB64}.${sigB64}`
}
