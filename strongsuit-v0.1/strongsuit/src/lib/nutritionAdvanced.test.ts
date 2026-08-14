import { describe, it, expect } from 'vitest'
import {
  katchMcArdle, cunningham, chooseBmr,
  proteinDistribution, carbTarget, loadToSessionBand,
} from './nutritionAdvanced'
import { mifflinStJeor } from './nutrition'

describe('energy equations', () => {
  it('computes Katch-McArdle and Cunningham from fat-free mass', () => {
    // 64 kg FFM: Katch = 370 + 21.6×64 = 1752; Cunningham = 500 + 22×64 = 1908
    expect(katchMcArdle(64)).toBe(1752)
    expect(cunningham(64)).toBe(1908)
  })

  it('Cunningham runs higher than Katch — that is the known difference', () => {
    expect(cunningham(60)).toBeGreaterThan(katchMcArdle(60))
  })
})

describe('chooseBmr', () => {
  const mifflin = mifflinStJeor(80, 180, 30, 'male')

  it('falls back to Mifflin when body fat is unknown, and says why', () => {
    // Guessing body composition would silently corrupt every downstream
    // number, so the correct behaviour is to use the equation that doesn't
    // need it — and to tell the coach what would improve the estimate.
    const r = chooseBmr({ mifflinBmr: mifflin, weight: 80, units: 'kg' })
    expect(r.equation).toBe('mifflin')
    expect(r.bmr).toBe(mifflin)
    expect(r.rationale).toMatch(/body-fat measurement/)
  })

  it('ignores an implausible body-fat value rather than trusting it', () => {
    expect(chooseBmr({ mifflinBmr: mifflin, weight: 80, units: 'kg', bodyFatPct: 0 }).equation).toBe('mifflin')
    expect(chooseBmr({ mifflinBmr: mifflin, weight: 80, units: 'kg', bodyFatPct: 75 }).equation).toBe('mifflin')
  })

  it('uses Katch-McArdle once body composition is measured', () => {
    const r = chooseBmr({ mifflinBmr: mifflin, weight: 80, units: 'kg', bodyFatPct: 22 })
    expect(r.equation).toBe('katch-mcardle')
    expect(r.rationale).toMatch(/62\.4 kg of fat-free mass/)
  })

  it('prefers Cunningham for lean athletes, where Mifflin under-predicts', () => {
    const r = chooseBmr({ mifflinBmr: mifflin, weight: 80, units: 'kg', bodyFatPct: 10 })
    expect(r.equation).toBe('cunningham')
    expect(r.bmr).toBeGreaterThan(mifflin)
  })

  it('honours an explicit lean override', () => {
    expect(chooseBmr({ mifflinBmr: mifflin, weight: 80, units: 'kg', bodyFatPct: 20, lean: true }).equation).toBe('cunningham')
    expect(chooseBmr({ mifflinBmr: mifflin, weight: 80, units: 'kg', bodyFatPct: 10, lean: false }).equation).toBe('katch-mcardle')
  })

  it('converts imperial weight before computing FFM', () => {
    const lb = chooseBmr({ mifflinBmr: mifflin, weight: 176, units: 'lb', bodyFatPct: 20 })
    const kg = chooseBmr({ mifflinBmr: mifflin, weight: 79.8, units: 'kg', bodyFatPct: 20 })
    expect(Math.abs(lb.bmr - kg.bmr)).toBeLessThan(5)
  })

  it('carries a citation whichever equation it picks', () => {
    expect(chooseBmr({ mifflinBmr: mifflin, weight: 80, units: 'kg' }).source).toMatch(/Frankenfield/)
    expect(chooseBmr({ mifflinBmr: mifflin, weight: 80, units: 'kg', bodyFatPct: 22 }).source).toMatch(/Katch/)
  })
})

describe('proteinDistribution', () => {
  it('splits the daily total across meals', () => {
    const p = proteinDistribution({ weightKg: 80, age: 30, meals: 4 })
    expect(p.dailyG).toBe(144) // 80 × 1.8
    expect(p.meals).toBe(4)
    expect(p.perMealG).toBe(36)
  })

  it('raises the total while cutting, and says why', () => {
    const cut = proteinDistribution({ weightKg: 80, age: 30, cutting: true })
    expect(cut.dailyG).toBe(176) // 80 × 2.2
    expect(cut.notes.join(' ')).toMatch(/keeping muscle in a deficit/)
  })

  it('raises the per-meal floor for older adults — anabolic resistance', () => {
    // The point most plans miss: it's the per-MEAL dose that changes with age,
    // not just the daily total.
    const young = proteinDistribution({ weightKg: 80, age: 30 })
    const older = proteinDistribution({ weightKg: 80, age: 55 })
    expect(older.perMealFloorG).toBeGreaterThan(young.perMealFloorG)
    expect(older.notes.join(' ')).toMatch(/Older muscle responds less/)
  })

  it('raises plant-based totals and explains the leucine reasoning', () => {
    const omni = proteinDistribution({ weightKg: 80, age: 30 })
    const plant = proteinDistribution({ weightKg: 80, age: 30, pattern: 'plant-based' })
    expect(plant.dailyG).toBeGreaterThan(omni.dailyG)
    expect(plant.notes.join(' ')).toMatch(/leucine/)
  })

  it('warns when meals are too small to trigger the response', () => {
    // Six small feedings can hit the same daily total and do noticeably less.
    const p = proteinDistribution({ weightKg: 100, age: 55, meals: 6 })
    expect(p.perMealG).toBeLessThan(p.perMealFloorG)
    expect(p.notes.join(' ')).toMatch(/below the ~\d+ g needed/)
  })

  it('clamps meal counts to something physically sensible', () => {
    expect(proteinDistribution({ weightKg: 80, age: 30, meals: 0 }).meals).toBe(2)
    expect(proteinDistribution({ weightKg: 80, age: 30, meals: 99 }).meals).toBe(6)
  })
})

describe('carbTarget — fuel for the work required', () => {
  it('scales carbohydrate with the day’s training, not a flat number', () => {
    // The gap that makes v1 unusable for endurance athletes.
    const rest = carbTarget(70, 'rest')
    const big = carbTarget(70, 'veryHigh')
    expect(rest.gramsHigh).toBeLessThan(big.gramsLow)
    expect(rest.gPerKg).toEqual({ low: 3, high: 5 })
    expect(big.gPerKg).toEqual({ low: 8, high: 12 })
  })

  it('computes grams from bodyweight', () => {
    const c = carbTarget(70, 'moderate')
    expect(c.gramsLow).toBe(350) // 70 × 5
    expect(c.gramsHigh).toBe(490) // 70 × 7
  })

  it('adds intra-session guidance only where it matters', () => {
    expect(carbTarget(70, 'rest').intraSession).toBeNull()
    expect(carbTarget(70, 'moderate').intraSession).toBeNull()
    expect(carbTarget(70, 'high').intraSession).toMatch(/30–60 g/)
  })

  it('flags the multiple-transportable-carbohydrate ceiling on very long sessions', () => {
    // 90 g/h is only achievable with glucose+fructose; a single source
    // saturates around 60 g/h. Getting this wrong causes GI distress.
    const c = carbTarget(70, 'veryHigh').intraSession!
    expect(c).toMatch(/90 g\/h/)
    expect(c).toMatch(/multiple transportable/)
    expect(c).toMatch(/gut adaptation/)
  })

  it('carries its citations', () => {
    expect(carbTarget(70, 'high').source).toMatch(/Burke|ACSM/)
  })
})

describe('loadToSessionBand', () => {
  it('maps sRPE load onto a carbohydrate band', () => {
    expect(loadToSessionBand(0)).toBe('rest')
    expect(loadToSessionBand(150)).toBe('light')
    expect(loadToSessionBand(350)).toBe('moderate')   // ~45 min @ RPE 7.5
    expect(loadToSessionBand(600)).toBe('high')       // ~80 min @ RPE 7.5
    expect(loadToSessionBand(1200)).toBe('veryHigh')  // ~2.5 h @ RPE 8
  })

  it('treats a negative or zero load as a rest day', () => {
    expect(loadToSessionBand(-50)).toBe('rest')
  })
})
