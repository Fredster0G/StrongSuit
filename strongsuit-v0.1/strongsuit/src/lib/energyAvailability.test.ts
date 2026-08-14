import { describe, it, expect } from 'vitest'
import {
  fatFreeMass, assessEnergyAvailability, screenPrescription, screenReds,
  EA_LOW_THRESHOLD, EA_OPTIMAL,
} from './energyAvailability'

describe('fatFreeMass', () => {
  it('computes FFM from weight and body fat', () => {
    // 80 kg at 20% bf → 64 kg FFM
    expect(fatFreeMass(80, 'kg', 20)).toBe(64)
  })

  it('converts imperial weight first', () => {
    // 176 lb ≈ 79.8 kg; at 25% → ~59.9
    const ffm = fatFreeMass(176, 'lb', 25)!
    expect(ffm).toBeGreaterThan(59)
    expect(ffm).toBeLessThan(61)
  })

  it('returns null rather than guessing when body fat is unknown', () => {
    // A wrong FFM silently corrupts every EA number downstream, so refusing
    // is the correct behaviour — not estimating from height/weight.
    expect(fatFreeMass(80, 'kg', undefined)).toBeNull()
    expect(fatFreeMass(80, 'kg', 0)).toBeNull()
    expect(fatFreeMass(80, 'kg', 70)).toBeNull()
  })
})

describe('assessEnergyAvailability', () => {
  const base = { weight: 60, units: 'kg' as const, bodyFatPct: 20, sex: 'female' as const }

  it('computes EA as (intake − exercise) / FFM', () => {
    // FFM 48 kg; (2600 − 400) / 48 = 45.8
    const a = assessEnergyAvailability({ ...base, intakeKcal: 2600, exerciseKcal: 400 })
    expect(a.ffmKg).toBe(48)
    expect(a.ea).toBe(46)
    expect(a.band).toBe('optimal')
  })

  it('bands reduced availability', () => {
    // (2000 − 400) / 48 = 33.3
    const a = assessEnergyAvailability({ ...base, intakeKcal: 2000, exerciseKcal: 400 })
    expect(a.band).toBe('reduced')
    expect(a.referral).toBe(false)
  })

  it('flags low EA as a referral, not a programming tweak', () => {
    // (1600 − 500) / 48 = 22.9
    const a = assessEnergyAvailability({ ...base, intakeKcal: 1600, exerciseKcal: 500 })
    expect(a.band).toBe('low')
    expect(a.referral).toBe(true)
    expect(a.summary).toMatch(/conversation, not a programming tweak/)
  })

  it('reports a range, never a single confident number', () => {
    // Self-reported intake is systematically unreliable; hiding that behind a
    // point estimate would overstate what we know.
    const a = assessEnergyAvailability({ ...base, intakeKcal: 2200, exerciseKcal: 400 })
    expect(a.range).not.toBeNull()
    expect(a.range!.low).toBeLessThan(a.ea!)
    expect(a.range!.high).toBeGreaterThan(a.ea!)
    expect(a.summary).toMatch(/plausibly/)
  })

  it('refuses to compute without body fat, and says why', () => {
    const a = assessEnergyAvailability({ ...base, bodyFatPct: undefined, intakeKcal: 2200, exerciseKcal: 400 })
    expect(a.ea).toBeNull()
    expect(a.band).toBe('unknown')
    expect(a.summary).toMatch(/body-fat percentage/)
  })

  it('lowers confidence for men, because the threshold’s evidence base is weaker there', () => {
    const female = assessEnergyAvailability({ ...base, sex: 'female', intakeKcal: 2200, exerciseKcal: 400 })
    const male = assessEnergyAvailability({ ...base, sex: 'male', intakeKcal: 2200, exerciseKcal: 400 })
    expect(female.confidence).toBe('good')
    expect(male.confidence).toBe('moderate')
    expect(male.confidenceReason).toMatch(/less well established/)
  })

  it('carries its citations', () => {
    const a = assessEnergyAvailability({ ...base, intakeKcal: 2200, exerciseKcal: 400 })
    expect(a.source).toMatch(/Mountjoy/)
    expect(a.source).toMatch(/Loucks/)
  })
})

describe('screenPrescription — the safety instrument', () => {
  const base = { weight: 60, units: 'kg' as const, bodyFatPct: 20, sex: 'female' as const, exerciseKcal: 500 }

  it('stops a target that drives EA below threshold', () => {
    // THE case this module exists for: a well-intentioned aggressive deficit.
    const s = screenPrescription({ ...base, targetKcal: 1500 })
    expect(s).not.toBeNull()
    expect(s!.severity).toBe('stop')
    expect(s!.message).toMatch(/below the 30 threshold|below the 30/)
    expect(s!.message).toMatch(/dietitian/)
  })

  it('warns on a near-miss, because measurement error can hide a breach', () => {
    // Comfortably above 30 on the point estimate, but the low end of the
    // plausible range dips under it.
    const s = screenPrescription({ ...base, targetKcal: 2050 })
    expect(s).not.toBeNull()
    expect(s!.severity).toBe('warn')
    expect(s!.message).toMatch(/close to the low-energy-availability threshold/)
  })

  it('stays quiet when the target is genuinely fine', () => {
    expect(screenPrescription({ ...base, targetKcal: 3000 })).toBeNull()
  })

  it('stays quiet rather than guessing when body fat is unknown', () => {
    expect(screenPrescription({ ...base, bodyFatPct: undefined, targetKcal: 1200 })).toBeNull()
  })
})

describe('screenReds', () => {
  const lowEA = assessEnergyAvailability({
    weight: 60, units: 'kg', bodyFatPct: 20, sex: 'female', intakeKcal: 1500, exerciseKcal: 500,
  })
  const okEA = assessEnergyAvailability({
    weight: 60, units: 'kg', bodyFatPct: 20, sex: 'female', intakeKcal: 2800, exerciseKcal: 400,
  })

  it('refers immediately on a disordered-eating concern, whatever the arithmetic', () => {
    // Not a coaching problem. The cost of under-reacting is far higher than
    // the cost of an unnecessary referral.
    const r = screenReds(okEA, { disorderedEatingConcern: true })
    expect(r.level).toBe('refer')
    expect(r.message).toMatch(/outside coaching scope/)
    expect(r.message).toMatch(/avoid prescribing a deficit/)
  })

  it('refers when low EA coincides with another indicator', () => {
    const r = screenReds(lowEA, { menstrualDisruption: true })
    expect(r.level).toBe('refer')
    expect(r.message).toMatch(/referral to a sports physician or dietitian/)
  })

  it('monitors on low EA alone', () => {
    const r = screenReds(lowEA, {})
    expect(r.level).toBe('monitor')
  })

  it('monitors on two indicators without confirmed low EA', () => {
    const r = screenReds(okEA, { boneStressInjury: true, frequentIllness: true })
    expect(r.level).toBe('monitor')
    expect(r.indicators).toBe(2)
  })

  it('stays silent when nothing is flagged', () => {
    const r = screenReds(okEA, {})
    expect(r.level).toBe('none')
    expect(r.indicators).toBe(0)
  })
})

describe('threshold constants match the consensus statements', () => {
  it('uses 30 and 45 kcal/kg FFM', () => {
    expect(EA_LOW_THRESHOLD).toBe(30)
    expect(EA_OPTIMAL).toBe(45)
  })
})
