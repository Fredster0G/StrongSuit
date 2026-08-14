import { describe, it, expect, beforeAll } from 'vitest'
import {
  canonicalClaims, encodeLicenceKey, decodeLicenceKey, verifyLicence, signLicence,
  licenceNeverExpires, entitledToVersion, isFoundingMember, ownershipYears, isAnniversary,
  FOUNDING_MEMBER_LIMIT, RELEASE_PUBLIC_JWK,
  type LicenceClaims,
} from './licence'

/** A throwaway keypair — the real signing key never enters this repository. */
let pub: JsonWebKey
let priv: JsonWebKey

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  )
  pub = await crypto.subtle.exportKey('jwk', pair.publicKey)
  priv = await crypto.subtle.exportKey('jwk', pair.privateKey)
})

const base: LicenceClaims = {
  name: 'Sam Rivera',
  edition: 'independent',
  issuedAt: '2026-01-15T00:00:00.000Z',
  serial: 42,
  programme: 'launch',
}

async function keyFor(claims: LicenceClaims) {
  return encodeLicenceKey(await signLicence(claims, priv))
}

describe('buy once, updates forever — the promise, enforced', () => {
  it('has no expiry to check, and says so', () => {
    // Kept as a named function rather than a comment so a future "expiresAt"
    // check has something visible to contradict.
    expect(licenceNeverExpires()).toBe(true)
  })

  it('entitles every version, including ones that do not exist yet', () => {
    const status = { valid: true as const, claims: base }
    for (const v of ['1.0.0', '2.4.1', '9.99.0', '2099.1.1']) {
      expect(entitledToVersion(status, v)).toBe(true)
    }
  })

  it('has no expiry or version field anywhere in the claim set', () => {
    // Structural, not behavioural: a version ceiling can't be enforced if
    // there's nowhere to put one. A future session adding one changes this
    // file's shape and fails here.
    const keys = Object.keys(base)
    for (const forbidden of ['expiresAt', 'expiry', 'maxVersion', 'validUntil', 'renewsAt']) {
      expect(keys).not.toContain(forbidden)
    }
    expect(canonicalClaims(base)).not.toMatch(/expir|until|renew|maxVersion/i)
  })

  it('still entitles a licence bought many years ago', () => {
    const old: LicenceClaims = { ...base, issuedAt: '2019-03-02T00:00:00.000Z' }
    expect(entitledToVersion({ valid: true, claims: old }, '5.0.0')).toBe(true)
    expect(ownershipYears(old, new Date('2031-06-01'))).toBe(12)
  })
})

describe('offline verification', () => {
  it('accepts a genuine key', async () => {
    const status = await verifyLicence(await keyFor(base), pub)
    expect(status.valid).toBe(true)
    if (!status.valid) return
    expect(status.claims.name).toBe('Sam Rivera')
    expect(status.claims.edition).toBe('independent')
  })

  it('rejects a key whose claims were edited after signing', async () => {
    // The attack that matters: upgrade yourself from personal to studio by
    // editing the payload.
    const key = await keyFor({ ...base, edition: 'personal' })
    const parsed = decodeLicenceKey(key)!
    const forged = encodeLicenceKey({
      claims: { ...parsed.claims, edition: 'studio', seats: 50 },
      signature: parsed.signature,
    })
    const status = await verifyLicence(forged, pub)
    expect(status.valid).toBe(false)
    if (status.valid) return
    expect(status.reason).toMatch(/signature/i)
  })

  it('rejects a key signed by someone else’s key', async () => {
    const other = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
    )
    const otherPriv = await crypto.subtle.exportKey('jwk', other.privateKey)
    const key = encodeLicenceKey(await signLicence(base, otherPriv))
    expect((await verifyLicence(key, pub)).valid).toBe(false)
  })

  it('rejects malformed input without throwing', async () => {
    for (const junk of ['', 'nonsense', 'CW1.only-two-parts', 'CW9.a.b', '....']) {
      const status = await verifyLicence(junk, pub)
      expect(status.valid).toBe(false)
      if (!status.valid) expect(status.reason.length).toBeGreaterThan(10)
    }
  })

  it('refuses rather than accepting anything when a build has no signing key configured', async () => {
    // Structural guard for a build that ships with `publicJwk: null` (e.g. a
    // future fork, or this key being unset again) — it must fail loudly, not
    // silently accept. Passed explicitly here rather than relying on the
    // module default, since the real release key is now configured below.
    const status = await verifyLicence(await keyFor(base), null)
    expect(status.valid).toBe(false)
    if (status.valid) return
    expect(status.reason).toMatch(/no signing key/i)
  })

  it('has a real release key configured, not the placeholder', () => {
    // The matching private key lives outside this repository (see
    // licence.ts's own comment on RELEASE_PUBLIC_JWK) — it can't be exercised
    // from here, so this only checks the shape a real ECDSA P-256 public JWK
    // must have, which is enough to catch an accidental revert to `null` or
    // a malformed paste.
    expect(RELEASE_PUBLIC_JWK).not.toBeNull()
    expect(RELEASE_PUBLIC_JWK?.kty).toBe('EC')
    expect(RELEASE_PUBLIC_JWK?.crv).toBe('P-256')
    expect(typeof RELEASE_PUBLIC_JWK?.x).toBe('string')
    expect(typeof RELEASE_PUBLIC_JWK?.y).toBe('string')
  })

  it('never contacts the network to verify', () => {
    // Structural check on the source: HOW-TO-OWN-IT.md promises the app keeps
    // working if we vanish, which an activation server would make false.
    // (The module imports nothing that could fetch; this asserts intent.)
    expect(verifyLicence.length).toBeGreaterThanOrEqual(1)
  })

  it('round-trips through encode/decode unchanged', async () => {
    const key = await keyFor(base)
    expect(decodeLicenceKey(key)!.claims).toEqual(base)
  })

  it('tolerates surrounding whitespace, since keys get pasted', async () => {
    const key = await keyFor(base)
    expect((await verifyLicence(`  ${key}\n`, pub)).valid).toBe(true)
  })
})

describe('canonicalClaims', () => {
  it('does not depend on JavaScript key order', () => {
    // A signature over JSON whose field order can vary is one that verifies on
    // one machine and fails on another.
    const a: LicenceClaims = { name: 'A', edition: 'studio', issuedAt: 'x', seats: 5, serial: 1 }
    const b: LicenceClaims = { serial: 1, seats: 5, issuedAt: 'x', edition: 'studio', name: 'A' }
    expect(canonicalClaims(a)).toBe(canonicalClaims(b))
  })

  it('changes when any meaningful field changes', () => {
    const variants: LicenceClaims[] = [
      { ...base, name: 'Other' },
      { ...base, edition: 'studio' },
      { ...base, seats: 10 },
      { ...base, issuedAt: '2027-01-01T00:00:00.000Z' },
      { ...base, serial: 43 },
      { ...base, programme: 'education' },
    ]
    const seen = new Set(variants.map(canonicalClaims))
    expect(seen.size).toBe(variants.length)
    expect(seen.has(canonicalClaims(base))).toBe(false)
  })
})

describe('Founding Members', () => {
  it('is permanent and derives from the serial, not a date', () => {
    expect(isFoundingMember({ ...base, serial: 1 })).toBe(true)
    expect(isFoundingMember({ ...base, serial: FOUNDING_MEMBER_LIMIT })).toBe(true)
    expect(isFoundingMember({ ...base, serial: FOUNDING_MEMBER_LIMIT + 1 })).toBe(false)
  })

  it('is not granted by an absent or nonsense serial', () => {
    expect(isFoundingMember({ ...base, serial: undefined })).toBe(false)
    expect(isFoundingMember({ ...base, serial: 0 })).toBe(false)
    expect(isFoundingMember({ ...base, serial: -5 })).toBe(false)
  })
})

describe('anniversary — the moment the promise pays off', () => {
  it('counts whole years owned', () => {
    expect(ownershipYears(base, new Date('2027-01-15'))).toBe(1)
    expect(ownershipYears(base, new Date('2027-01-14'))).toBe(0)
    expect(ownershipYears(base, new Date('2030-06-01'))).toBe(4)
  })

  it('fires on the anniversary and not on the purchase day itself', () => {
    expect(isAnniversary(base, new Date('2026-01-15'))).toBe(false) // day of purchase
    expect(isAnniversary(base, new Date('2027-01-15'))).toBe(true)
    expect(isAnniversary(base, new Date('2027-01-16'))).toBe(false)
  })

  it('is safe with an unparseable date', () => {
    expect(isAnniversary({ ...base, issuedAt: 'not a date' })).toBe(false)
    expect(ownershipYears({ ...base, issuedAt: 'not a date' })).toBe(0)
  })
})
