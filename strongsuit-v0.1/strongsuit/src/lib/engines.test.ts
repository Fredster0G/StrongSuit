import { describe, it, expect } from 'vitest'
import { jointAngle, frameAngles, symmetryPct, depthPct, RepCounter, FocusJointPicker, replayHistory, LandmarkSmoother, type Lm, type AngleSample, type JointName } from './pose'
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

  it('focus picker ignores a joint only glimpsed through occlusion, even with a big apparent range', () => {
    const p = new FocusJointPicker()
    // "Elbow (L)" is genuinely, reliably tracked with a real ~90° range.
    // "Knee (L)" is only visible 2 of 10 frames (partially blocked by
    // equipment) but those two readings swing wildly — noise, not motion.
    for (let i = 0; i < 8; i++) p.push({ 'Elbow (L)': i % 2 === 0 ? 160 : 70 })
    p.push({ 'Elbow (L)': 160, 'Knee (L)': 20 })
    p.push({ 'Elbow (L)': 70, 'Knee (L)': 175 })
    expect(p.best()).toBe('Elbow (L)')
  })

  it('replayHistory rescues a rep that completed before the focus joint was known', () => {
    // A full first rep (175°→90°→175°) happens before FocusJointPicker.best()
    // clears its own warm-up — without replay, that rep is fed to nothing and
    // is lost forever, since the live RepCounter only starts once focus exists.
    const joint: JointName = 'Knee (L)'
    const history: AngleSample[] = []
    let t = 0
    const ramp = (from: number, to: number, ms: number) => {
      const steps = ms / 100
      for (let i = 1; i <= steps; i++) { t += 100; history.push({ tMs: t, angles: { [joint]: from + ((to - from) * i) / steps } }) }
    }
    ramp(175, 90, 1000); ramp(90, 175, 1000) // rep 1 — happened during "calibration"
    ramp(175, 90, 1000); ramp(90, 175, 1000) // rep 2 — still within the buffered window

    // simulate the OLD behavior: only push live from here on (focus "just" got picked)
    const liveOnly = new RepCounter()
    ramp(175, 90, 1000); ramp(90, 175, 1000) // rep 3, arrives live
    for (const s of history.slice(-20)) liveOnly.push(s.tMs, s.angles[joint]!)
    expect(liveOnly.reps.length).toBeLessThan(3) // the old way misses reps 1 & 2 entirely

    // new behavior: replay the WHOLE buffer (reps 1–3) the moment focus is known
    const rc = new RepCounter()
    replayHistory(rc, history, joint)
    expect(rc.reps.length).toBe(3)
  })
})

describe('LandmarkSmoother', () => {
  const lm = (x: number, y: number, visibility = 1): Lm => ({ x, y, visibility })

  it('smooths jitter around a held, stationary position', () => {
    const s = new LandmarkSmoother()
    let t = 0
    const rawXs: number[] = []
    const smoothedXs: number[] = []
    // a point held at x=0.5 (e.g. paused at the bottom of a rep), with the
    // pose model's own frame-to-frame estimation noise layered on top
    for (let i = 0; i < 20; i++) {
      t += 33
      const noisy = 0.5 + (i % 2 === 0 ? 0.05 : -0.05)
      rawXs.push(noisy)
      smoothedXs.push(s.smooth([lm(noisy, 0.5)], t)[0].x)
    }
    const range = (vals: number[]) => Math.max(...vals) - Math.min(...vals)
    // ignore the first couple of samples (filter still warming up) and
    // compare steady-state jitter amplitude
    expect(range(smoothedXs.slice(6))).toBeLessThan(range(rawXs.slice(6)))
  })

  it('passes an unseen point through raw on first sighting (nothing to blend toward yet)', () => {
    const s = new LandmarkSmoother()
    const out = s.smooth([lm(0.42, 0.73, 0.9)], 0)[0]
    expect(out.x).toBe(0.42)
    expect(out.y).toBe(0.73)
  })

  it('passes a below-gate (not visible) point through completely unmodified', () => {
    const s = new LandmarkSmoother()
    s.smooth([lm(0.1, 0.1, 0.9)], 0) // establish history
    const out = s.smooth([lm(0.99, 0.99, 0.3)], 33)[0] // now occluded, wildly different position
    expect(out.x).toBe(0.99)
    expect(out.y).toBe(0.99)
  })

  it('holds close to the last trusted position when a point re-appears at low confidence', () => {
    const s = new LandmarkSmoother()
    // establish a stable, trusted position
    s.smooth([lm(0.2, 0.2, 0.95)], 0)
    const held = s.smooth([lm(0.2, 0.2, 0.95)], 33)[0]
    // next frame: same landmark index reports a wildly different position,
    // but only just above the visibility gate (equipment-occlusion noise)
    const noisy = s.smooth([lm(0.9, 0.9, 0.52)], 66)[0]
    // should land much closer to the held position than to the noisy reading
    const distToHeld = Math.hypot(noisy.x - held.x, noisy.y - held.y)
    const distToNoisy = Math.hypot(noisy.x - 0.9, noisy.y - 0.9)
    expect(distToHeld).toBeLessThan(distToNoisy)
  })

  it('catches back up to a genuinely new position once confidence returns, not stuck on the old one', () => {
    const s = new LandmarkSmoother()
    s.smooth([lm(0.2, 0.2, 0.95)], 0)
    s.smooth([lm(0.2, 0.2, 0.95)], 33)
    s.smooth([lm(0.9, 0.9, 0.52)], 66) // brief occlusion blip
    // several clearly-visible frames at the new position — a real recovery,
    // not judged after a single sample (the 1€ filter has some inherent lag
    // on a big jump by design, that's not a bug)
    let last = { x: 0, y: 0 }
    let t = 66
    for (let i = 0; i < 10; i++) { t += 33; last = s.smooth([lm(0.9, 0.9, 0.95)], t)[0] }
    expect(Math.abs(last.x - 0.9)).toBeLessThan(0.05)
  })

  it('reset() clears filter/history state for every landmark', () => {
    const s = new LandmarkSmoother()
    s.smooth([lm(0.2, 0.2, 0.95)], 0)
    s.reset()
    const out = s.smooth([lm(0.7, 0.7, 0.95)], 1000)[0]
    // right after reset, this is effectively a fresh sighting — passes through raw
    expect(out.x).toBe(0.7)
    expect(out.y).toBe(0.7)
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
