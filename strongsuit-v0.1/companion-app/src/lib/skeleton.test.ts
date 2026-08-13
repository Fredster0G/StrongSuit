import { describe, it, expect } from 'vitest'
import {
  SkeletonCalibrator, torsoLength, validateBones, circleIntersection, reconstructJoint,
  angleImplausible, presentation, measurementNote, combineBasis, OcclusionRepairer,
  BONE_TOLERANCE, MIN_CALIBRATION_FRAMES, MAX_PREDICT_FRAMES, ANATOMY_CONFIDENCE,
  type Measured,
} from './skeleton'
import { gradeRep, repQualityNote, type Lm } from './pose'

/**
 * Builds a 33-landmark frame for a person seen side-on, with the option to
 * occlude or displace individual points — i.e. the leg-press case this module
 * exists for.
 *
 * Coordinates are normalised 0–1 like MediaPipe's, y down.
 */
function frame(opts: {
  /** Knee flexion driver: 0 = legs straight, 1 = fully bent. */
  bend?: number
  /** Landmarks to mark occluded (visibility 0.2). */
  hide?: number[]
  /** Landmarks to move somewhere impossible. */
  displace?: Record<number, { x: number; y: number }>
  /** Uniform scale about the frame centre — simulates moving toward camera. */
  scale?: number
} = {}): Lm[] {
  const bend = opts.bend ?? 0
  const lms: Lm[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }))

  const put = (i: number, x: number, y: number) => { lms[i] = { x, y, visibility: 0.95 } }

  // Torso: shoulders at y=0.30, hips at y=0.60 → torso length 0.30
  put(11, 0.50, 0.30); put(12, 0.52, 0.30)
  put(23, 0.50, 0.60); put(24, 0.52, 0.60)

  // Legs. Femur 0.18, tibia 0.18 (0.6 torsos each) — the knee swings forward
  // and up as bend increases, keeping both bone lengths exactly constant.
  const femur = 0.18, tibia = 0.18
  const theta = (Math.PI / 2) * bend // 0 = straight down, 90° = knee forward
  const kx = 0.50 + femur * Math.sin(theta)
  const ky = 0.60 + femur * Math.cos(theta)
  put(25, kx, ky); put(26, kx + 0.02, ky)
  // Ankle placed so the tibia length is exact, folding back under the knee.
  const ax = kx - tibia * Math.sin(theta)
  const ay = ky + tibia * Math.cos(theta)
  put(27, ax, ay); put(28, ax + 0.02, ay)

  // Arms: upper 0.15, forearm 0.15
  put(13, 0.50, 0.45); put(14, 0.52, 0.45)
  put(15, 0.50, 0.60); put(16, 0.52, 0.60)

  if (opts.scale && opts.scale !== 1) {
    for (let i = 0; i < lms.length; i++) {
      lms[i] = { ...lms[i], x: 0.5 + (lms[i].x - 0.5) * opts.scale, y: 0.5 + (lms[i].y - 0.5) * opts.scale }
    }
  }
  for (const i of opts.hide ?? []) lms[i] = { ...lms[i], visibility: 0.2 }
  for (const [i, p] of Object.entries(opts.displace ?? {})) {
    lms[+i] = { ...lms[+i], x: p.x, y: p.y }
  }
  return lms
}

function calibrated(frames = MIN_CALIBRATION_FRAMES + 4) {
  const cal = new SkeletonCalibrator()
  for (let i = 0; i < frames; i++) cal.observe(frame({ bend: (i % 5) / 5 }))
  return cal.skeleton()
}

describe('torsoLength — the scale reference', () => {
  it('measures mid-shoulder to mid-hip', () => {
    expect(torsoLength(frame())).toBeCloseTo(0.30, 5)
  })

  it('refuses to measure when the torso points are not trustworthy', () => {
    // Guessing scale from a low-confidence torso would rescale every bone in
    // the frame — worse than returning nothing.
    expect(torsoLength(frame({ hide: [11] }))).toBeNull()
  })
})

describe('SkeletonCalibrator', () => {
  it('learns bone lengths as multiples of torso length', () => {
    const s = calibrated()
    expect(s.ready).toBe(true)
    expect(s.lengths.femurL).toBeCloseTo(0.6, 2) // 0.18 / 0.30
    expect(s.lengths.tibiaL).toBeCloseTo(0.6, 2)
    expect(s.lengths.upperArmL).toBeCloseTo(0.5, 2) // 0.15 / 0.30
  })

  it('will not report a length until it has enough clean frames', () => {
    const cal = new SkeletonCalibrator()
    for (let i = 0; i < MIN_CALIBRATION_FRAMES - 1; i++) cal.observe(frame())
    const s = cal.skeleton()
    expect(s.ready).toBe(false)
    expect(s.lengths.femurL).toBeUndefined()
    expect(s.samples.femurL).toBe(MIN_CALIBRATION_FRAMES - 1)
  })

  it('is unchanged by the person moving toward the camera', () => {
    // The whole reason lengths are normalised. Without this, walking two steps
    // forward reads as every bone growing and every frame becomes a violation.
    const near = new SkeletonCalibrator()
    const far = new SkeletonCalibrator()
    for (let i = 0; i < MIN_CALIBRATION_FRAMES + 2; i++) {
      near.observe(frame({ scale: 1.4 }))
      far.observe(frame({ scale: 0.7 }))
    }
    expect(near.skeleton().lengths.femurL).toBeCloseTo(far.skeleton().lengths.femurL!, 4)
  })

  it('calibrates per bone, so an occluded lower body does not cost us the arms', () => {
    // The lat-pulldown case: legs never visible, arms perfectly visible.
    const cal = new SkeletonCalibrator()
    for (let i = 0; i < MIN_CALIBRATION_FRAMES + 2; i++) cal.observe(frame({ hide: [25, 26, 27, 28] }))
    const s = cal.skeleton()
    expect(s.lengths.upperArmL).toBeDefined()
    expect(s.lengths.femurL).toBeUndefined()
    expect(s.ready).toBe(true)
  })

  it('ignores low-confidence frames rather than averaging them in', () => {
    const cal = new SkeletonCalibrator()
    for (let i = 0; i < MIN_CALIBRATION_FRAMES + 2; i++) cal.observe(frame())
    const clean = cal.skeleton().lengths.femurL!
    // 20 garbage frames where the knee is badly mis-detected, but marked
    // low-confidence — they must not move the median at all.
    for (let i = 0; i < 20; i++) {
      cal.observe(frame({ hide: [25], displace: { 25: { x: 0.9, y: 0.1 } } }))
    }
    expect(cal.skeleton().lengths.femurL).toBeCloseTo(clean, 6)
  })

  it('uses a median, so a few confidently-wrong frames do not shift it much', () => {
    const cal = new SkeletonCalibrator()
    for (let i = 0; i < 30; i++) cal.observe(frame())
    for (let i = 0; i < 4; i++) cal.observe(frame({ displace: { 25: { x: 0.95, y: 0.05 } } }))
    expect(cal.skeleton().lengths.femurL).toBeCloseTo(0.6, 2)
  })
})

describe('validateBones — rejecting the impossible', () => {
  it('passes a clean frame', () => {
    expect(validateBones(frame({ bend: 0.5 }), calibrated())).toEqual([])
  })

  it('catches a femur that has "shortened" behind a pad', () => {
    // The actual failure mode: the model puts the knee somewhere near the hip
    // because the real knee is hidden. Nothing in the old pipeline rejected it.
    const bad = frame({ displace: { 25: { x: 0.50, y: 0.66 } } }) // femur 0.06 not 0.18
    const v = validateBones(bad, calibrated())
    expect(v.map(x => x.bone)).toContain('femurL')
    expect(v.find(x => x.bone === 'femurL')!.deviation).toBeLessThan(-BONE_TOLERANCE)
  })

  it('catches a bone that has impossibly lengthened', () => {
    const bad = frame({ displace: { 25: { x: 0.50, y: 0.95 } } })
    const v = validateBones(bad, calibrated())
    expect(v.find(x => x.bone === 'femurL')!.deviation).toBeGreaterThan(BONE_TOLERANCE)
  })

  it('tolerates real foreshortening from a limb rotating out of plane', () => {
    // A limb turning toward the camera genuinely shortens on screen. Flagging
    // that would make the feature cry wolf on every rep of every exercise.
    const s = calibrated()
    const slight = frame({ displace: { 25: { x: 0.50, y: 0.76 } } }) // ~11% short
    expect(validateBones(slight, s).map(v => v.bone)).not.toContain('femurL')
  })

  it('says nothing when it has no calibration to judge against', () => {
    expect(validateBones(frame(), { lengths: {}, samples: {}, bendSide: {}, ready: false })).toEqual([])
  })
})

describe('circleIntersection', () => {
  it('finds both solutions for a reachable configuration', () => {
    const sols = circleIntersection({ x: 0, y: 0 }, { x: 2, y: 0 }, Math.SQRT2, Math.SQRT2)!
    expect(sols).not.toBeNull()
    // Symmetric about the line joining the endpoints: (1, ±1)
    const ys = sols.map(s => s.y).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(-1, 6)
    expect(ys[1]).toBeCloseTo(1, 6)
    for (const s of sols) expect(s.x).toBeCloseTo(1, 6)
  })

  it('returns null when the limb cannot span the gap', () => {
    // Not a maths failure — it means one of the "visible" endpoints is itself
    // mis-detected, which is worth knowing rather than papering over.
    expect(circleIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, 1)).toBeNull()
  })

  it('returns null when the limb cannot fold that tightly', () => {
    expect(circleIntersection({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 5, 1)).toBeNull()
  })

  it('returns null for coincident endpoints', () => {
    expect(circleIntersection({ x: 1, y: 1 }, { x: 1, y: 1 }, 1, 1)).toBeNull()
  })
})

describe('reconstructJoint — the leg-press case', () => {
  const skel = calibrated()
  const femur = skel.lengths.femurL!
  const tibia = skel.lengths.tibiaL!

  /** Reconstruct the knee of a frame, pretending it wasn't visible. */
  function recover(bend: number, hint?: Parameters<typeof reconstructJoint>[0]['hint']) {
    const f = frame({ bend })
    return {
      truth: { x: f[25].x, y: f[25].y },
      got: reconstructJoint({
        proximal: f[23], distal: f[27],
        proximalLength: femur, distalLength: tibia,
        torso: torsoLength(f)!,
        hint,
      }),
    }
  }

  it('has a genuinely two-way ambiguity to resolve (guards the tests below)', () => {
    // Without this, every reconstruction test could be passing because the two
    // solutions coincide — i.e. because the disambiguation never mattered.
    const f = frame({ bend: 0.5 })
    const t = torsoLength(f)!
    const sols = circleIntersection(f[23], f[27], femur * t, tibia * t)!
    expect(Math.hypot(sols[0].x - sols[1].x, sols[0].y - sols[1].y)).toBeGreaterThan(0.05)
  })

  it('recovers a hidden knee from the visible hip and ankle', () => {
    // This is the whole point of the module. On a leg press the hip and ankle
    // are usually visible while the knee is behind the pad.
    const prev = recover(0.45).truth
    const { truth, got } = recover(0.5, { last: prev, ageFrames: 1 })
    expect(got).not.toBeNull()
    expect(Math.hypot(got!.point.x - truth.x, got!.point.y - truth.y)).toBeLessThan(0.02)
  })

  it('uses prior velocity to pick between the two mirrored solutions', () => {
    // Without a hint the geometry is genuinely two-way ambiguous; a knee
    // mid-descent does not teleport to the mirrored solution between frames.
    const a = recover(0.40).truth
    const b = recover(0.45).truth
    const { truth, got } = recover(0.5, {
      last: b,
      velocity: { x: b.x - a.x, y: b.y - a.y },
      ageFrames: 1,
    })
    expect(got!.basis).toBe('velocity')
    expect(Math.hypot(got!.point.x - truth.x, got!.point.y - truth.y)).toBeLessThan(0.02)
  })

  it('admits ambiguity when it has no prior at all', () => {
    const { got } = recover(0.5)
    expect(got!.basis).toBe('ambiguous')
    expect(got!.confidence).toBeLessThan(0.5) // must fall below the show gate
  })

  it('loses confidence the longer it has been guessing', () => {
    const prev = recover(0.45).truth
    const fresh = recover(0.5, { last: prev, ageFrames: 1 })!.got!
    const stale = recover(0.5, { last: prev, ageFrames: 8 })!.got!
    expect(stale.confidence).toBeLessThan(fresh.confidence)
  })

  it('stops trusting a stale hint entirely rather than extrapolating into fiction', () => {
    const prev = recover(0.45).truth
    const ancient = recover(0.5, { last: prev, ageFrames: MAX_PREDICT_FRAMES + 1 })!.got!
    expect(ancient.basis).toBe('ambiguous')
  })

  it('returns null when the endpoints are impossibly placed', () => {
    const f = frame()
    expect(reconstructJoint({
      proximal: f[23], distal: { x: 0.99, y: 0.99, visibility: 0.9 },
      proximalLength: femur, distalLength: tibia,
      torso: torsoLength(f)!,
    })).toBeNull()
  })

  it('refuses to work without a scale reference', () => {
    const f = frame()
    expect(reconstructJoint({
      proximal: f[23], distal: f[27], proximalLength: femur, distalLength: tibia, torso: 0,
    })).toBeNull()
  })
})

describe('OcclusionRepairer — the pipeline, end to end', () => {
  /** A leg-press set: calibration reps in full view, then the knee disappears
   *  behind the pad while the rep continues. This is the exact scenario the
   *  user reported, expressed as a test. */
  /** Bend 0 (locked out) → 0.75 (deep). Deliberately NOT the full 0–1: at
   *  bend 1 this fixture folds the ankle onto the hip, which is geometrically
   *  degenerate and anatomically impossible on a leg press. Testing against a
   *  pose a human can't hold would be testing the fixture, not the module. */
  const bendAt = (i: number, frames: number) => 0.75 * Math.abs(Math.sin((i / frames) * Math.PI * 2))

  function legPressSet(hideKneeFrom: number, frames = 40): Lm[][] {
    const seq: Lm[][] = []
    for (let i = 0; i < frames; i++) {
      seq.push(frame({ bend: bendAt(i, frames), hide: i >= hideKneeFrom ? [25] : [] }))
    }
    return seq
  }

  it('keeps the knee moving when it goes behind the pad, instead of freezing', () => {
    // The defect in one assertion. `LandmarkSmoother` holds an occluded point
    // near its last trusted position; the real knee is still descending.
    const rep = new OcclusionRepairer()
    const seq = legPressSet(20)
    const results = seq.map(f => rep.repair(f))

    const occluded = results.slice(20)
    expect(occluded.some(r => r.repaired.includes(25))).toBe(true)

    // The repaired knee must track the truth, not sit where it was last seen.
    // Asserted only where the module still CLAIMS confidence — past the
    // prediction horizon it deliberately gives up, and holding it to an
    // accuracy it explicitly disclaims would be testing the wrong thing.
    const lastVisibleY = seq[19][25].y
    let checked = 0
    let movedFromLastSeen = 0
    for (let i = 20; i < seq.length; i++) {
      if (!results[i].repaired.includes(25)) continue
      const got = results[i].landmarks[25]
      if ((got.visibility ?? 0) < 0.5) continue // module says don't trust this
      const truth = frame({ bend: bendAt(i, seq.length) })[25]
      expect(Math.hypot(got.x - truth.x, got.y - truth.y)).toBeLessThan(0.03)
      checked++
      if (Math.abs(got.y - lastVisibleY) > 0.02) movedFromLastSeen++
    }
    expect(checked).toBeGreaterThan(3)      // guards against a vacuous pass
    expect(movedFromLastSeen).toBeGreaterThan(0)
  })

  it('writes confidence into visibility, so the existing angle gate withholds for free', () => {
    // The integration decision that keeps every downstream consumer honest
    // without any of them knowing this layer exists.
    const rep = new OcclusionRepairer()
    const seq = legPressSet(20)
    const results = seq.map(f => rep.repair(f))
    for (const r of results.slice(20)) {
      if (!r.repaired.includes(25)) continue
      const v = r.landmarks[25].visibility!
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThanOrEqual(0.9) // never claims certainty about a guess
    }
  })

  it('does nothing until it has actually calibrated', () => {
    // No proportions learned yet means no basis for an inference. Filling the
    // joint in anyway would be invention.
    const rep = new OcclusionRepairer()
    const r = rep.repair(frame({ hide: [25] }))
    expect(r.calibrated).toBe(false)
    expect(r.repaired).toEqual([])
  })

  it('leaves a visible joint alone rather than replacing a measurement with a guess', () => {
    const rep = new OcclusionRepairer()
    const seq = legPressSet(999) // never occluded
    const results = seq.map(f => rep.repair(f))
    expect(results.every(r => r.repaired.length === 0)).toBe(true)
  })

  it('will not reconstruct from endpoints that are themselves occluded', () => {
    const rep = new OcclusionRepairer()
    for (let i = 0; i < 20; i++) rep.repair(frame({ bend: (i % 5) / 5 }))
    // Knee AND ankle hidden — the chain has no anchor, so nothing is claimed.
    const r = rep.repair(frame({ bend: 0.5, hide: [25, 27] }))
    expect(r.repaired).not.toContain(25)
  })

  it('resolves the knee anatomically, and so does not decay while occluded', () => {
    // THE BUG THIS CAUGHT, and the reason the module has an anatomy layer at
    // all. At lockout the two solutions converge, so the very next frame's
    // motion hint points straight down the middle — and the MIRRORED solution
    // (a knee bending backwards) was nearer to it. Velocity cannot resolve
    // that; it isn't a velocity question. Anatomy resolves it exactly.
    //
    // And once it's resolved by geometry, confidence correctly does NOT decay
    // with time: the answer never depended on a stale hint, so there is
    // nothing to go stale. That's a real distinction, not a convenient one.
    const rep = new OcclusionRepairer()
    const seq = legPressSet(20, 40)
    const results = seq.map(f => rep.repair(f))

    const late = results.slice(30).filter(r => r.repaired.includes(25))
    expect(late.length).toBeGreaterThan(3)
    for (const r of late) {
      const knee = r.landmarks[25]
      expect(knee.visibility).toBeCloseTo(ANATOMY_CONFIDENCE, 5)
      expect(knee.visibility!).toBeLessThan(1) // still an inference, not a sighting
    }
  })

  it('falls back to decaying confidence when the bend direction is unknown', () => {
    // Without the anatomical constraint the module is relying on a hint that
    // genuinely goes stale, and it has to say so.
    const seq = legPressSet(0, 30) // occluded from frame 0 → never learns a side
    const rep = new OcclusionRepairer()
    for (const f of seq) rep.repair(f)
    // Nothing is claimed at all, since calibration never had a clean knee.
    expect(rep.repair(frame({ bend: 0.4, hide: [25] })).repaired).not.toContain(25)
  })

  it('reports bone violations for the frame it actually returns', () => {
    const rep = new OcclusionRepairer()
    for (let i = 0; i < 20; i++) rep.repair(frame({ bend: (i % 5) / 5 }))
    const r = rep.repair(frame({ displace: { 25: { x: 0.5, y: 0.65 } } }))
    expect(r.violations.map(v => v.bone)).toContain('femurL')
  })

  it('resets cleanly for a new clip', () => {
    const rep = new OcclusionRepairer()
    for (let i = 0; i < 20; i++) rep.repair(frame())
    rep.reset()
    expect(rep.repair(frame({ hide: [25] })).calibrated).toBe(false)
  })
})

describe('bend direction — the anatomical constraint', () => {
  it('learns which way the knee bends', () => {
    const s = calibrated()
    expect(s.bendSide[25]).toBeDefined()
    expect([1, -1]).toContain(s.bendSide[25])
  })

  it('learns nothing from a limb that is always straight', () => {
    // Zero information, and inventing a direction from noise would be worse
    // than having none — a wrong side flips the reconstruction to the
    // impossible solution, which is the exact failure this prevents.
    const cal = new SkeletonCalibrator()
    for (let i = 0; i < 30; i++) cal.observe(frame({ bend: 0 }))
    expect(cal.skeleton().bendSide[25]).toBeUndefined()
  })

  it('says nothing when the observed direction is genuinely mixed', () => {
    const cal = new SkeletonCalibrator()
    for (let i = 0; i < 20; i++) {
      // Alternating: knee forward, then behind — i.e. the detection is
      // unreliable, so no direction may be claimed.
      cal.observe(frame({ bend: 0.5 }))
      cal.observe(frame({ bend: 0.5, displace: { 25: { x: 0.50 - 0.127, y: 0.60 + 0.127 } } }))
    }
    expect(cal.skeleton().bendSide[25]).toBeUndefined()
  })

  it('rejects the mirrored solution outright when the side is known', () => {
    const s = calibrated()
    const f = frame({ bend: 0.5 })
    const r = reconstructJoint({
      proximal: f[23], distal: f[27],
      proximalLength: s.lengths.femurL!, distalLength: s.lengths.tibiaL!,
      torso: torsoLength(f)!,
      side: s.bendSide[25],
      // Deliberately a hint pointing at the WRONG (mirrored) solution: anatomy
      // must win over motion, because a knee bending backwards is not a
      // close call to be voted on.
      hint: { last: { x: 0.5 - (f[25].x - 0.5), y: f[25].y }, ageFrames: 1 },
    })!
    expect(r.basis).toBe('anatomy')
    expect(Math.hypot(r.point.x - f[25].x, r.point.y - f[25].y)).toBeLessThan(0.01)
  })

  it('is the side that decides — flipping it returns the mirrored joint', () => {
    // Proves the constraint is actually driving the choice rather than
    // coincidentally agreeing with the geometry. The two solutions sit on
    // opposite sides of the hip→ankle line, so a known side always selects
    // exactly one of them.
    const s = calibrated()
    const f = frame({ bend: 0.5 })
    const common = {
      proximal: f[23], distal: f[27],
      proximalLength: s.lengths.femurL!, distalLength: s.lengths.tibiaL!,
      torso: torsoLength(f)!,
    }
    const right = reconstructJoint({ ...common, side: s.bendSide[25] })!
    const flipped = reconstructJoint({ ...common, side: (s.bendSide[25]! * -1) as 1 | -1 })!
    expect(Math.hypot(right.point.x - f[25].x, right.point.y - f[25].y)).toBeLessThan(0.01)
    expect(Math.hypot(flipped.point.x - right.point.x, flipped.point.y - right.point.y)).toBeGreaterThan(0.05)
  })
})

describe('angleImplausible', () => {
  it('rejects a knee bending backwards', () => {
    expect(angleImplausible('Knee (L)', 220)).toBe(true)
  })

  it('accepts a genuinely deep squat', () => {
    // These limits exist to reject the impossible, not to police mobility.
    // Telling someone with a deep squat that their pose is invalid would be
    // the feature failing, not working.
    expect(angleImplausible('Knee (L)', 30)).toBe(false)
  })

  it('says nothing about joints it has no limits for', () => {
    expect(angleImplausible('Wrist (L)', 999)).toBe(false)
  })
})

describe('confidence gating — the honesty layer', () => {
  const m = (confidence: number): Measured<number> =>
    ({ value: 68, confidence, basis: 'reconstructed', occludedFrames: 3 })

  it('shows a well-observed number plainly', () => {
    expect(presentation(m(0.95))).toBe('show')
    expect(measurementNote(m(0.95))).toBeNull()
  })

  it('qualifies a partly-occluded number instead of stating it flatly', () => {
    expect(presentation(m(0.65))).toBe('qualify')
    expect(measurementNote(m(0.65), 'the knee')).toMatch(/approximate/)
  })

  it('withholds a number it does not trust, and says why in plain language', () => {
    // A confidently wrong "68% depth" is worse than no number: the first time
    // a coach catches it lying, every number in the app loses credibility.
    expect(presentation(m(0.2))).toBe('withhold')
    const note = measurementNote(m(0.2), 'the knee')!
    expect(note).toMatch(/Couldn't measure/)
    expect(note).toMatch(/the knee was hidden/)
    expect(note).toMatch(/camera angle/) // tells the coach what to actually do
  })

  it('never reports a number the gate withholds', () => {
    // Doctrine test: the boundary constants must stay ordered, or a "withheld"
    // measurement could silently start rendering.
    for (const c of [0, 0.1, 0.49]) expect(presentation(m(c))).toBe('withhold')
    for (const c of [0.8, 0.99, 1]) expect(presentation(m(c))).toBe('show')
  })
})

describe('gradeRep — is this rep’s depth number worth showing?', () => {
  it('calls a fully-seen rep measured', () => {
    expect(gradeRep({ total: 40, reconstructed: 0, bottomReconstructed: false })).toBe('measured')
  })

  it('calls a briefly-blocked rep partial', () => {
    expect(gradeRep({ total: 40, reconstructed: 4, bottomReconstructed: false })).toBe('partial')
  })

  it('refuses to measure a rep that was mostly blocked', () => {
    expect(gradeRep({ total: 40, reconstructed: 30, bottomReconstructed: false })).toBe('unmeasurable')
  })

  it('refuses when the BOTTOM was blocked, however good the rest looked', () => {
    // The point of grading by position rather than percentage. Depth is
    // decided at the turnaround; a rep that was crystal clear on the way down
    // and hidden at the bottom is exactly the one whose depth is worthless,
    // and a flat percentage would happily call it "85% measured".
    expect(gradeRep({ total: 40, reconstructed: 8, bottomReconstructed: true })).toBe('unmeasurable')
  })

  it('still flags a rep whose only blocked frame was the bottom', () => {
    expect(gradeRep({ total: 40, reconstructed: 1, bottomReconstructed: true })).toBe('partial')
  })

  it('treats an empty rep as unmeasurable rather than dividing by zero', () => {
    expect(gradeRep({ total: 0, reconstructed: 0, bottomReconstructed: false })).toBe('unmeasurable')
  })

  it('only stays silent for a rep it actually measured', () => {
    expect(repQualityNote('measured')).toBeNull()
    expect(repQualityNote('partial')).toMatch(/approximate/)
    expect(repQualityNote('unmeasurable')).toMatch(/couldn't be measured/)
  })
})

describe('combineBasis', () => {
  it('takes the weakest basis across a rep', () => {
    // A rep is only as trustworthy as its worst frames. Averaging would let a
    // mostly-good rep hide a completely unmeasured bottom position — which is
    // the exact moment that matters most.
    expect(combineBasis(['observed', 'observed', 'predicted'])).toBe('predicted')
    expect(combineBasis(['observed', 'reconstructed'])).toBe('reconstructed')
    expect(combineBasis(['observed', 'observed'])).toBe('observed')
  })
})
