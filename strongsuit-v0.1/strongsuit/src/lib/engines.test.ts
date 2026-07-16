import { describe, it, expect } from 'vitest'
import { jointAngle, frameAngles, symmetryPct, depthPct, RepCounter, FocusJointPicker, type Lm } from './pose'
import { mifflinStJeor, nutritionPlan, ageFromBirthDate, warmupRamp, toKg } from './nutrition'
import { readinessFromCheckIn } from './readiness'
import { gymCutForClient, gymCutForMonth, profitPlan } from './business'
import type { CheckIn, Client, Payment } from '@/db/types'

// ---------- pose math ----------
describe('pose math', () => {
  it('computes a right angle and respects the visibility gate', () => {
    const lms: Lm[] = []
    lms[0] = { x: 0, y: 0 }; lms[1] = { x: 0, y: 1 }; lms[2] = { x: 1, y: 1 }
    expect(jointAngle(lms, [0, 1, 2])).toBe(90)
    lms[2] = { x: 1, y: 1, visibility: 0.2 }
    expect(jointAngle(lms, [0, 1, 2])).toBeNull()
  })

  it('symmetry: identical = 100, 9° apart ≈ 90', () => {
    expect(symmetryPct(120, 120)).toBe(100)
    expect(symmetryPct(120, 129)).toBe(90)
    expect(symmetryPct(undefined, 120)).toBeNull()
  })

  it('depth percentage against a target ROM', () => {
    expect(depthPct(90, 175, 90)).toBe(100)  // hit target depth exactly
    expect(depthPct(132.5, 175, 90)).toBe(50)
    expect(depthPct(60, 175, 90)).toBe(120)  // beyond target, capped
  })

  it('counts reps with tempo from a synthetic squat angle series', () => {
    const rc = new RepCounter()
    // three reps: 175° → 90° (1s down) → 175° (1s up), 100ms samples
    const series: [number, number][] = []
    let t = 0
    const ramp = (from: number, to: number, ms: number) => {
      const steps = ms / 100
      for (let i = 1; i <= steps; i++) series.push([t += 100, from + ((to - from) * i) / steps])
    }
    for (let r = 0; r < 3; r++) { ramp(175, 90, 1000); ramp(90, 175, 1000) }
    const detected = series.map(([ts, a]) => rc.push(ts, a)).filter(Boolean)
    expect(rc.reps.length).toBe(3)
    expect(detected.length).toBe(3)
    const rep = rc.reps[1]
    expect(rep.bottomAngle).toBeLessThanOrEqual(95)
    expect(rep.eccentricMs).toBeGreaterThan(400)
    expect(rep.concentricMs).toBeGreaterThan(400)
    expect(rep.depth).toBeGreaterThanOrEqual(90)
  })

  it('focus picker chooses the joint with the widest range', () => {
    const p = new FocusJointPicker()
    p.push({ 'Knee (L)': 170, 'Elbow (L)': 90 })
    p.push({ 'Knee (L)': 95, 'Elbow (L)': 88 })
    expect(p.best()).toBe('Knee (L)')
    expect(frameAngles([]).constructor).toBe(Object)
  })
})

// ---------- nutrition engine ----------
describe('nutrition engine', () => {
  it('Mifflin-St Jeor matches hand-computed values', () => {
    expect(mifflinStJeor(80, 180, 30, 'male')).toBe(1780)
    expect(mifflinStJeor(65, 165, 28, 'female')).toBe(1380) // 650+1031.25-140-161 rounded
  })

  it('builds a coherent plan: macros re-sum to calories, cut never dips below BMR', () => {
    const p = nutritionPlan({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 'moderate', goal: 'cut' })
    expect(p.tdee).toBe(Math.round(1780 * 1.55))
    expect(p.proteinG).toBe(176) // 2.2 g/kg on a cut
    const kcalFromMacros = p.proteinG * 4 + p.fatG * 9 + p.carbsG * 4
    expect(Math.abs(kcalFromMacros - p.calories)).toBeLessThan(20)
    expect(p.calories).toBeGreaterThanOrEqual(p.bmr)
    // every recommendation must carry a source
    for (const line of Object.values(p.rationale)) {
      expect(line.text.length).toBeGreaterThan(20)
      expect(line.source.length).toBeGreaterThan(10)
    }
  })

  it('gain adds ~10% over TDEE; helpers convert correctly', () => {
    const p = nutritionPlan({ weightKg: 60, heightCm: 165, age: 25, sex: 'female', activity: 'light', goal: 'gain' })
    expect(p.calories).toBeGreaterThan(p.tdee)
    expect(toKg(220, 'lb')).toBeCloseTo(99.79, 1)
    expect(ageFromBirthDate('1996-07-16', new Date(2026, 6, 16))).toBe(30)
    expect(ageFromBirthDate('1996-07-17', new Date(2026, 6, 16))).toBe(29)
  })

  it('warm-up ramp ascends to ~95% in plate-rounded steps', () => {
    const ramp = warmupRamp(200)
    expect(ramp.map(s => s.pct)).toEqual([50, 70, 85, 95])
    expect(ramp[0].load).toBe(100)
    expect(ramp.at(-1)!.load).toBe(190)
    expect(warmupRamp(0)).toEqual([])
  })
})

// ---------- readiness ----------
const checkIn = (over: Partial<CheckIn>): CheckIn => ({
  id: 'c', createdAt: '', updatedAt: '', clientId: 'x', date: '2026-07-16',
  answers: [], source: 'trainer', ...over,
})

describe('readiness score', () => {
  it('rested + energetic scores go; short sleep drags it down with named drivers', () => {
    const good = readinessFromCheckIn(checkIn({ sleepHours: 8, energy: 9, mood: 8, adherence: 90 }))
    expect(good!.score).toBeGreaterThanOrEqual(80)
    expect(good!.band).toBe('go')
    const rough = readinessFromCheckIn(checkIn({ sleepHours: 4.5, energy: 2, mood: 2, adherence: 40 }))
    expect(rough!.score).toBeLessThan(45)
    expect(rough!.band).toBe('easy')
    // drivers name the two weakest inputs — energy and mood here (both 2/10)
    expect(rough!.drivers.join(' ')).toContain('low')
  })

  it('returns null with nothing to score; partial data still works', () => {
    expect(readinessFromCheckIn(checkIn({}))).toBeNull()
    const partial = readinessFromCheckIn(checkIn({ sleepHours: 8 }))
    expect(partial!.score).toBeGreaterThan(90)
  })
})

// ---------- gym cut ----------
const client = (over: Partial<Client>): Client => ({
  id: 'cl1', createdAt: '', updatedAt: '', firstName: 'A', lastName: 'B',
  status: 'active', goals: '', injuries: '', parqNotes: '', tags: [], startDate: '2026-01-01', ...over,
})
const pay = (over: Partial<Payment>): Payment => ({
  id: 'p', createdAt: '', updatedAt: '', clientId: 'cl1', date: '2026-07-05',
  amount: 100, type: 'payment', ...over,
})

describe('gym cut', () => {
  it('percent cut applies to the month income net of refunds', () => {
    const c = client({ gymCut: { kind: 'percent', value: 30 } })
    const cut = gymCutForClient(c, [pay({ amount: 500 }), pay({ amount: 100, type: 'refund' })], '2026-07')
    expect(cut).toBe(120) // 30% of 400
  })

  it('flat monthly applies only while active; totals sum per client', () => {
    const a = client({ id: 'a', gymCut: { kind: 'flat-monthly', value: 250 } })
    const b = client({ id: 'b', status: 'archived', gymCut: { kind: 'flat-monthly', value: 250 } })
    const c = client({ id: 'c', gymCut: { kind: 'percent', value: 10 } })
    const total = gymCutForMonth([a, b, c], [pay({ clientId: 'c', amount: 1000 })], '2026-07')
    expect(total).toBe(350)
  })

  it('profitPlan subtracts the cut from net and scales it into the projection', () => {
    const plan = profitPlan({
      payments: [pay({ amount: 1000, date: '2026-07-10' })], expenses: [],
      target: 2000, month: '2026-07', today: '2026-07-10', gymCut: 300,
    })
    expect(plan.net).toBe(700)
    // income projects 1000→3100; cut projects at same ratio (30%) → 930
    expect(plan.projectedNet).toBe(3100 - 930)
  })
})
