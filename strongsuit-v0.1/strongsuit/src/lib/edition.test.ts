import { describe, it, expect } from 'vitest'
import { editionCapabilities, tierAtLeast, seatsFor, type Edition } from './edition'

describe('editionCapabilities', () => {
  it('falls back to the most restrictive edition when the licence is missing or unknown', () => {
    // A corrupt or absent licence must never unlock paid features. This is the
    // single most important assertion in this file.
    //
    // `clients` is deliberately NOT checked here since S15: the free tier
    // does grant capped client access now (see `canAddClient` in
    // lib/membership.ts, checked separately with actual coach data) — this
    // flag no longer means "no clients ever", so it isn't part of the "never
    // unlock paid features" guarantee. `business`/`multiSeat` still are.
    for (const bad of [undefined, null, '' as unknown as Edition, 'enterprise' as Edition]) {
      const cap = editionCapabilities(bad)
      expect(cap.edition).toBe('personal')
      expect(cap.business).toBe(false)
      expect(cap.multiSeat).toBe(false)
    }
  })

  it('gates business/coaching-scale features behind Independent, but not basic client access', () => {
    const personal = editionCapabilities('personal')
    const independent = editionCapabilities('independent')

    // S15: free tier includes capped client access (see lib/membership.ts's
    // FREE_TIER_CLIENT_LIMIT) rather than none — this flag now means "can
    // reach the feature", and the actual count cap is enforced separately by
    // canAddClient() against real coach data, not by this pure capability
    // table.
    expect(personal.clients).toBe(true)
    expect(personal.programBuilder).toBe(false)
    expect(personal.business).toBe(false)
    expect(personal.filmRoomPro).toBe(false)

    expect(independent.clients).toBe(true)
    expect(independent.programBuilder).toBe(true)
    expect(independent.business).toBe(true)
    expect(independent.filmRoomPro).toBe(true)
  })

  it('gates team features behind Studio', () => {
    const independent = editionCapabilities('independent')
    const studio = editionCapabilities('studio')

    expect(independent.multiSeat).toBe(false)
    expect(independent.batchAi).toBe(false)
    expect(independent.sharedModelCache).toBe(false)

    expect(studio.multiSeat).toBe(true)
    expect(studio.batchAi).toBe(true)
    expect(studio.sharedModelCache).toBe(true)
  })

  it('gives every gated edition a plain-language upgrade reason', () => {
    // A hidden feature the user can't explain reads as a bug. Studio is the
    // top edition, so it has nothing left to explain.
    expect(editionCapabilities('personal').upgradeReason).toBeTruthy()
    expect(editionCapabilities('independent').upgradeReason).toBeTruthy()
    expect(editionCapabilities('studio').upgradeReason).toBeUndefined()
  })

  it('caps the AI tier per edition', () => {
    expect(editionCapabilities('personal').maxAiTier).toBe('light')
    expect(editionCapabilities('independent').maxAiTier).toBe('pro')
    expect(editionCapabilities('studio').maxAiTier).toBe('pro')
  })

  it('capabilities are monotonic — a higher edition never has fewer', () => {
    const p = editionCapabilities('personal')
    const i = editionCapabilities('independent')
    const s = editionCapabilities('studio')
    const flags = ['clients', 'programBuilder', 'filmRoomPro', 'business', 'multiSeat', 'batchAi', 'sharedModelCache'] as const
    for (const f of flags) {
      expect(!p[f] || i[f]).toBe(true)   // personal ⊆ independent
      expect(!i[f] || s[f]).toBe(true)   // independent ⊆ studio
    }
  })
})

describe('tierAtLeast', () => {
  it('orders tiers smallest to largest', () => {
    expect(tierAtLeast('pro', 'light')).toBe(true)
    expect(tierAtLeast('light', 'light')).toBe(true)
    expect(tierAtLeast('embeddings', 'light')).toBe(false)
    expect(tierAtLeast('standard', 'pro')).toBe(false)
  })
})

describe('seatsFor', () => {
  it('is always one seat outside Studio, whatever the licence claims', () => {
    expect(seatsFor('personal', 50)).toBe(1)
    expect(seatsFor('independent', 50)).toBe(1)
  })

  it('honours the Studio seat count, with a floor of one', () => {
    expect(seatsFor('studio', 10)).toBe(10)
    expect(seatsFor('studio', 0)).toBe(1)
    expect(seatsFor('studio', undefined)).toBe(1)
  })
})
