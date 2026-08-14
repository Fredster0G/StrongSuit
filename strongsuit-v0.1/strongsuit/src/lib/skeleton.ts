// ===== Skeletal constraints — occlusion handling for Film Room =====
// (docs/plans/04-FILM-ROOM-V2.md §2, Layer 2)
//
// THE PROBLEM THIS EXISTS FOR, in the user's own words: "if someone is on a
// machine, their body is easily blocked. this can mess with the tracking."
//
// It does, and the existing pipeline can't fix it on its own. `LandmarkSmoother`
// HOLDS an occluded point near its last trusted position; it doesn't know the
// knee behind the leg-press pad is still descending. Every landmark is filtered
// independently, so nothing rejects an anatomically impossible limb.
//
// The prior nobody was using: A PERSON'S BONE LENGTHS DO NOT CHANGE DURING A
// SET. That is free, exact, and extremely strong. Everything here follows from
// it:
//
//   1. CALIBRATE limb lengths from high-confidence frames, normalised to torso
//      length so it survives the person moving toward or away from the camera.
//   2. REJECT frames where a bone deviates beyond tolerance — a femur cannot
//      shorten 30%, so that is a detection error, not motion.
//   3. RECONSTRUCT an occluded middle joint by inverse kinematics. On a leg
//      press the hip and ankle are usually visible while the knee is behind the
//      pad — which is exactly the solvable case.
//
// HONESTY RULE (the reason for `Measured<T>`): a reconstructed joint is an
// INFERENCE, and every number derived from one has to carry that fact all the
// way to the UI. A confidently wrong "68% depth" is worse than no number at
// all — the first time a coach catches it lying, every number in the app loses
// its credibility. Nothing in this module ever upgrades its own confidence.
//
// Pure math, no MediaPipe import, same as `lib/pose.ts` — so all of it is
// unit-testable without a browser.

import type { Lm } from './pose'

// ------------------------------------------------------------------ bones

/** Bones we can constrain, in MediaPipe Pose 33-point index space. */
export const BONE_SEGMENTS = {
  femurL: [23, 25],
  femurR: [24, 26],
  tibiaL: [25, 27],
  tibiaR: [26, 28],
  upperArmL: [11, 13],
  upperArmR: [12, 14],
  forearmL: [13, 15],
  forearmR: [14, 16],
} as const
export type BoneName = keyof typeof BONE_SEGMENTS

/**
 * Middle joints we can reconstruct, each as [proximal, joint, distal].
 *
 * Only two-bone chains with a fixed pair of endpoints are solvable this way,
 * which is why this list is knees and elbows and not, say, hips — a hip's
 * position isn't pinned by two bones of known length.
 */
export const RECONSTRUCTABLE = {
  25: { from: 23, to: 27, proximal: 'femurL', distal: 'tibiaL' },
  26: { from: 24, to: 28, proximal: 'femurR', distal: 'tibiaR' },
  13: { from: 11, to: 15, proximal: 'upperArmL', distal: 'forearmL' },
  14: { from: 12, to: 16, proximal: 'upperArmR', distal: 'forearmR' },
} as const satisfies Record<number, { from: number; to: number; proximal: BoneName; distal: BoneName }>

export type ReconstructableIndex = keyof typeof RECONSTRUCTABLE

/** Visibility a landmark needs before its position is trusted for calibration.
 *  Deliberately stricter than `pose.ts`'s MIN_VISIBILITY (0.5): a wrong bone
 *  length poisons every later frame, so calibration only learns from points
 *  the model is genuinely sure about. */
export const CALIBRATION_VISIBILITY = 0.8

/** Frames of clean data before a bone's length is usable. Below this the
 *  median is just noise wearing a median's clothes. */
export const MIN_CALIBRATION_FRAMES = 12

/** How far a bone may deviate from its calibrated length before the frame is
 *  called a detection error. 15% is loose enough to absorb real perspective
 *  change (a limb rotating out of the camera plane genuinely foreshortens) and
 *  tight enough to catch the model putting a knee somewhere impossible. */
export const BONE_TOLERANCE = 0.15

function dist(a: Lm, b: Lm): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Torso length — the scale reference everything is normalised against.
 *
 * Mid-shoulder to mid-hip, because it's the most reliably visible span on a
 * human being and it's rigid. Without this, walking two steps toward the
 * camera would read as every bone growing.
 */
export function torsoLength(lms: Lm[]): number | null {
  const [ls, rs, lh, rh] = [lms[11], lms[12], lms[23], lms[24]]
  if (!ls || !rs || !lh || !rh) return null
  const vis = [ls, rs, lh, rh].map(p => p.visibility ?? 1)
  if (Math.min(...vis) < CALIBRATION_VISIBILITY) return null
  const shoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }
  const hip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 }
  const d = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y)
  return d > 0 ? d : null
}

// ------------------------------------------------------------ calibration

export interface Skeleton {
  /** Bone length as a multiple of torso length. */
  lengths: Partial<Record<BoneName, number>>
  /** Frames each bone's median rests on. */
  samples: Partial<Record<BoneName, number>>
  /** Which way each reconstructable joint bends, as the sign of the cross
   *  product of (distal − proximal) × (joint − proximal). Keyed by landmark
   *  index. A knee bends one way and one way only, which makes this the
   *  strongest disambiguator available — see `bendSide`. */
  bendSide: Partial<Record<number, 1 | -1>>
  /** True once at least one bone is usable. */
  ready: boolean
}

/**
 * Which side of the proximal→distal line the joint sits on.
 *
 * Returns 0 when the limb is close to straight, where the question has no
 * meaningful answer — and where, not coincidentally, the two reconstruction
 * solutions converge.
 */
export function bendSide(proximal: Pt, joint: Pt, distal: Pt, scale = 1): -1 | 0 | 1 {
  const cross = (distal.x - proximal.x) * (joint.y - proximal.y)
              - (distal.y - proximal.y) * (joint.x - proximal.x)
  // Normalised by scale² so the threshold means the same thing at any distance
  // from the camera.
  const norm = cross / (scale * scale)
  if (Math.abs(norm) < 0.02) return 0
  return norm > 0 ? 1 : -1
}

/** Fraction of decisive frames that must agree before a bend direction is
 *  trusted. High, because getting this wrong flips the reconstruction to the
 *  anatomically impossible solution — the exact failure it exists to prevent. */
const BEND_SIDE_AGREEMENT = 0.85

/**
 * Learns this person's proportions from the frames where the model is
 * confident, and refuses to guess from the frames where it isn't.
 *
 * Per-bone rather than all-or-nothing on purpose: on a lat pulldown the arms
 * calibrate fine while the legs never do, and there is no reason to throw away
 * the arms because of it.
 */
export class SkeletonCalibrator {
  private observed = new Map<BoneName, number[]>()
  private sides = new Map<number, { pos: number; neg: number }>()

  /** Feed a frame. Cheap — safe to call on every tracked frame. */
  observe(lms: Lm[]): void {
    const torso = torsoLength(lms)
    if (!torso) return // no trustworthy scale reference this frame

    // Learn which way each joint bends, from frames where it's unambiguous.
    for (const [key, chain] of Object.entries(RECONSTRUCTABLE)) {
      const idx = Number(key)
      const j = lms[idx], p = lms[chain.from], d = lms[chain.to]
      if (!j || !p || !d) continue
      if (Math.min(j.visibility ?? 1, p.visibility ?? 1, d.visibility ?? 1) < CALIBRATION_VISIBILITY) continue
      const side = bendSide(p, j, d, torso)
      if (side === 0) continue // limb near-straight: no information here
      const tally = this.sides.get(idx) ?? { pos: 0, neg: 0 }
      if (side > 0) tally.pos++
      else tally.neg++
      this.sides.set(idx, tally)
    }

    for (const [name, [i, j]] of Object.entries(BONE_SEGMENTS) as [BoneName, readonly [number, number]][]) {
      const a = lms[i], b = lms[j]
      if (!a || !b) continue
      if ((a.visibility ?? 1) < CALIBRATION_VISIBILITY) continue
      if ((b.visibility ?? 1) < CALIBRATION_VISIBILITY) continue
      const len = dist(a, b) / torso
      if (!Number.isFinite(len) || len <= 0) continue
      const arr = this.observed.get(name) ?? []
      arr.push(len)
      this.observed.set(name, arr)
    }
  }

  /** Median rather than mean, because a handful of badly-wrong frames is the
   *  expected input here and a mean would happily absorb them. */
  skeleton(): Skeleton {
    const lengths: Partial<Record<BoneName, number>> = {}
    const samples: Partial<Record<BoneName, number>> = {}
    for (const [name, vals] of this.observed) {
      samples[name] = vals.length
      if (vals.length >= MIN_CALIBRATION_FRAMES) lengths[name] = median(vals)
    }

    const sides: Partial<Record<number, 1 | -1>> = {}
    for (const [idx, tally] of this.sides) {
      const total = tally.pos + tally.neg
      if (total < MIN_CALIBRATION_FRAMES) continue
      if (tally.pos / total >= BEND_SIDE_AGREEMENT) sides[idx] = 1
      else if (tally.neg / total >= BEND_SIDE_AGREEMENT) sides[idx] = -1
      // Genuinely mixed: say nothing rather than pick the majority. A joint
      // that appears to bend both ways means the camera angle or the
      // detection is unreliable, and a wrong answer here is worse than none.
    }

    return { lengths, samples, bendSide: sides, ready: Object.keys(lengths).length > 0 }
  }

  reset(): void {
    this.observed.clear()
    this.sides.clear()
  }
}

// ------------------------------------------------------------- validation

export interface BoneViolation {
  bone: BoneName
  /** Observed length this frame, normalised to torso. */
  observed: number
  expected: number
  /** Signed fractional deviation: +0.3 means 30% too long. */
  deviation: number
}

/**
 * Bones that are impossible this frame, given what we've learned.
 *
 * Reports rather than repairs: what to DO about a violation depends on which
 * joint it is and whether it can be reconstructed, and that decision belongs
 * to the caller, not here.
 */
export function validateBones(lms: Lm[], skeleton: Skeleton): BoneViolation[] {
  const torso = torsoLength(lms)
  if (!torso) return []
  const out: BoneViolation[] = []
  for (const [name, expected] of Object.entries(skeleton.lengths) as [BoneName, number][]) {
    const [i, j] = BONE_SEGMENTS[name]
    const a = lms[i], b = lms[j]
    if (!a || !b) continue
    const observed = dist(a, b) / torso
    const deviation = (observed - expected) / expected
    if (Math.abs(deviation) > BONE_TOLERANCE) {
      out.push({ bone: name, observed, expected, deviation })
    }
  }
  return out
}

/**
 * Anatomical interior-angle limits, in the same convention `pose.ts`'s
 * `jointAngle` uses (a straight limb is ~180°, not 0°).
 *
 * Generous on purpose. These exist to reject the physically impossible — a
 * knee bending backwards — not to police unusual mobility. Someone with a
 * genuinely deep squat should never be told their pose is invalid.
 */
export const ANGLE_LIMITS: Record<string, [number, number]> = {
  'Knee (L)': [20, 190], 'Knee (R)': [20, 190],
  'Elbow (L)': [20, 190], 'Elbow (R)': [20, 190],
  'Hip (L)': [15, 190], 'Hip (R)': [15, 190],
  'Shoulder (L)': [0, 190], 'Shoulder (R)': [0, 190],
}

/** True when an angle is outside what a human joint can do — i.e. the
 *  detection is wrong, whatever the model's confidence says. */
export function angleImplausible(joint: string, angle: number): boolean {
  const limits = ANGLE_LIMITS[joint]
  if (!limits) return false
  return angle < limits[0] || angle > limits[1]
}

// --------------------------------------------------------- reconstruction

export interface Pt { x: number; y: number }

/**
 * Where an occluded middle joint must be, given both endpoints and two known
 * bone lengths — the intersection of two circles.
 *
 * Returns both solutions: a two-bone chain is genuinely ambiguous in 2D (a
 * knee can bend toward or away from the camera and both are geometrically
 * valid), and pretending otherwise would be inventing certainty. Picking
 * between them is `reconstructJoint`'s job, using prior motion.
 *
 * Null when the endpoints are further apart than the limb can span, or closer
 * than it can fold. That's not a failure to report — it means one of the two
 * "visible" endpoints is itself mis-detected, which is worth knowing.
 */
export function circleIntersection(a: Pt, c: Pt, r1: number, r2: number): [Pt, Pt] | null {
  const dx = c.x - a.x, dy = c.y - a.y
  const d = Math.hypot(dx, dy)
  if (d === 0) return null            // coincident endpoints — undefined
  if (d > r1 + r2) return null        // limb can't reach that far
  if (d < Math.abs(r1 - r2)) return null // can't fold that tight

  const t = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const hSq = r1 * r1 - t * t
  const h = Math.sqrt(Math.max(0, hSq))
  const mx = a.x + (t * dx) / d
  const my = a.y + (t * dy) / d
  const ox = (h * dy) / d
  const oy = (h * dx) / d
  return [
    { x: mx + ox, y: my - oy },
    { x: mx - ox, y: my + oy },
  ]
}

export interface Reconstruction {
  point: Pt
  /** 0–1. Falls with the age of the hint used to disambiguate. */
  confidence: number
  /** Why it's this solution and not the mirrored one — surfaced so a coach
   *  can be told, and so this is debuggable rather than magic. */
  basis: 'anatomy' | 'velocity' | 'last-known' | 'ambiguous'
}

/** Confidence for an anatomically-determined reconstruction.
 *
 *  It does NOT decay with time, and that is the point: when the bend direction
 *  is known, both endpoints are visible and both bone lengths are calibrated,
 *  the joint's position is *determined by geometry* — it doesn't depend on a
 *  stale hint, so there is nothing to go stale. Capped below 1 because the
 *  endpoints are themselves measurements, and this is still an inference. */
export const ANATOMY_CONFIDENCE = 0.85

/**
 * Disambiguation hint.
 *
 * `last` and `ageFrames` answer deliberately different questions, and
 * collapsing them into one was a real bug: **where the joint probably is** may
 * be informed by the previous frame's reconstruction (a knee does not teleport
 * between frames, so the last estimate is the best disambiguator available),
 * but **how much to trust the answer** may only be reset by actually seeing
 * the joint. Chaining reconstructions is fine for picking between two mirrored
 * solutions; it is not evidence.
 */
export interface JointHint {
  /** Most recent estimate of the joint's position — observed or reconstructed. */
  last: Pt
  /** Per-frame displacement, if known. */
  velocity?: Pt
  /** Frames since the joint was last genuinely OBSERVED. Drives confidence. */
  ageFrames: number
}

/** Beyond this many frames of pure prediction, the estimate is fiction and
 *  the module says so rather than extrapolating (plan §2, Layer 1: "after
 *  ~0.4 s the app stops trusting it"). At 30fps this is ~0.4 s. */
export const MAX_PREDICT_FRAMES = 12

/**
 * Reconstruct one occluded joint.
 *
 * THE MACHINE CASE, concretely: on a leg press the hip and ankle are usually
 * visible while the knee is behind the pad. Femur and tibia lengths are known
 * from calibration, so the knee's position is determined up to a two-way
 * ambiguity — which the joint's own prior motion resolves, because a knee
 * mid-descent does not teleport to the mirrored solution between frames.
 */
export function reconstructJoint(opts: {
  proximal: Lm
  distal: Lm
  proximalLength: number
  distalLength: number
  /** Torso length this frame — lengths are stored normalised. */
  torso: number
  hint?: JointHint
  /** Which way this joint bends, from calibration. The strongest constraint
   *  available: a knee does not bend backwards, whatever the model says. */
  side?: 1 | -1
}): Reconstruction | null {
  const { proximal, distal, torso, hint, side } = opts
  if (!(torso > 0)) return null

  const solutions = circleIntersection(
    proximal, distal,
    opts.proximalLength * torso,
    opts.distalLength * torso,
  )
  if (!solutions) return null

  // Anatomy first. If the bend direction is known, one of the two solutions is
  // a limb bending backwards — reject it outright rather than letting a
  // velocity heuristic vote on whether the knee is inverted.
  //
  // This is what fixed the leg-press case: at full extension the two solutions
  // converge, so the frame *after* extension has a hint pointing straight down
  // the middle, and the mirrored (impossible) solution was closer to it.
  // Velocity could never resolve that. Anatomy resolves it exactly.
  if (side) {
    const matching = solutions.filter(s => {
      const observed = bendSide(proximal, s, distal, torso)
      return observed === 0 || observed === side
    })
    if (matching.length === 1) {
      return { point: matching[0], confidence: ANATOMY_CONFIDENCE, basis: 'anatomy' }
    }
    // Both match only when the limb is near-straight (`bendSide` returns 0 for
    // both), and there the two solutions are nearly the same point anyway — so
    // either is fine, and a hint isn't needed to choose. Note there is no
    // "neither matches" case: the two solutions sit on opposite sides of the
    // proximal→distal line, so a known side always selects exactly one unless
    // the limb is straight.
    if (matching.length === 2 && !hint) {
      return { point: matching[0], confidence: ANATOMY_CONFIDENCE, basis: 'anatomy' }
    }
  }

  // No prior at all: both solutions are equally valid and saying so is the
  // honest answer. Return one, but flagged and heavily discounted — the
  // caller's confidence gate is expected to drop it.
  if (!hint || hint.ageFrames > MAX_PREDICT_FRAMES) {
    return { point: solutions[0], confidence: 0.2, basis: 'ambiguous' }
  }

  // Prefer the solution nearest where the joint was actually heading; fall
  // back to where it last was.
  const target: Pt = hint.velocity
    ? { x: hint.last.x + hint.velocity.x, y: hint.last.y + hint.velocity.y }
    : hint.last

  const d0 = Math.hypot(solutions[0].x - target.x, solutions[0].y - target.y)
  const d1 = Math.hypot(solutions[1].x - target.x, solutions[1].y - target.y)
  const [best, other] = d0 <= d1 ? [solutions[0], solutions[1]] : [solutions[1], solutions[0]]

  // Confidence decays with how long we've been guessing, and drops when the
  // two solutions are close enough together that "picking the nearer one" is
  // barely a choice.
  const separation = Math.hypot(other.x - best.x, other.y - best.y)
  const ambiguityPenalty = separation < 0.02 ? 0.6 : 1
  const freshness = 1 - hint.ageFrames / (MAX_PREDICT_FRAMES + 1)
  const confidence = Math.max(0.05, Math.min(0.9, freshness * ambiguityPenalty))

  return {
    point: best,
    confidence,
    basis: hint.velocity ? 'velocity' : 'last-known',
  }
}

// ------------------------------------------------------------- pipeline

export interface RepairResult {
  /** The frame, with reconstructable occluded joints filled in. */
  landmarks: Lm[]
  /** Which joints were reconstructed this frame. */
  repaired: number[]
  /** Bones that were impossible this frame. */
  violations: BoneViolation[]
  /** True once calibration has something to work with. */
  calibrated: boolean
}

/** Visibility below which a joint is treated as occluded and worth
 *  reconstructing. Matches `pose.ts`'s MIN_VISIBILITY, deliberately — above
 *  it the existing smoother is already doing a good job and replacing a real
 *  measurement with an inference would be a downgrade. */
export const OCCLUDED_BELOW = 0.5

/**
 * The whole layer, as one stateful pass over a clip.
 *
 * Sits between `LandmarkSmoother` and the angle math: it learns proportions as
 * the clip plays and fills in joints the model lost, so `frameAngles` sees a
 * knee that kept descending behind the pad instead of one that froze.
 *
 * KEY INTEGRATION DECISION: a reconstructed landmark is written back with its
 * **visibility set to the reconstruction's confidence**. That means the
 * existing visibility gate in `pose.ts` does the withholding for free — a
 * confidently reconstructed knee flows into the angle math, a barely-guessed
 * one is dropped exactly as if it had never been seen. No downstream code
 * needs to know this layer exists, and none of it can accidentally consume a
 * number this module doesn't stand behind.
 */
export class OcclusionRepairer {
  private cal = new SkeletonCalibrator()
  /** Most recent ESTIMATE per joint — may be a reconstruction. Used only to
   *  pick between the two mirrored solutions. */
  private estimate = new Map<number, { pt: Pt; frame: number; velocity?: Pt }>()
  /** Frame each joint was last genuinely OBSERVED. Drives confidence, and a
   *  reconstruction never touches it. */
  private lastObserved = new Map<number, number>()
  private frameNo = 0

  repair(lms: Lm[]): RepairResult {
    this.frameNo++
    this.cal.observe(lms)
    const skeleton = this.cal.skeleton()
    const torso = torsoLength(lms)

    const out = [...lms]
    const repaired: number[] = []

    if (skeleton.ready && torso) {
      for (const [key, chain] of Object.entries(RECONSTRUCTABLE)) {
        const idx = Number(key)
        const joint = lms[idx]
        if (joint && (joint.visibility ?? 1) >= OCCLUDED_BELOW) continue

        const proximal = lms[chain.from]
        const distal = lms[chain.to]
        // Both endpoints must be genuinely visible — reconstructing from a
        // guess would compound the error rather than fix it.
        if (!proximal || !distal) continue
        if ((proximal.visibility ?? 1) < OCCLUDED_BELOW) continue
        if ((distal.visibility ?? 1) < OCCLUDED_BELOW) continue

        const pLen = skeleton.lengths[chain.proximal]
        const dLen = skeleton.lengths[chain.distal]
        if (pLen == null || dLen == null) continue

        const prior = this.estimate.get(idx)
        const observedAt = this.lastObserved.get(idx)
        const r = reconstructJoint({
          proximal, distal,
          proximalLength: pLen, distalLength: dLen,
          torso,
          // Position hint from the latest estimate (so the mirrored solution
          // is rejected correctly); age — and therefore confidence — measured
          // from the last real sighting, which a reconstruction cannot reset.
          hint: prior && observedAt != null
            ? { last: prior.pt, velocity: prior.velocity, ageFrames: this.frameNo - observedAt }
            : undefined,
          side: skeleton.bendSide[idx],
        })
        if (!r) continue

        out[idx] = { ...joint, x: r.point.x, y: r.point.y, visibility: r.confidence }
        repaired.push(idx)
      }
    }

    // Carry each joint's position forward for next frame's disambiguation,
    // from the frame we're actually returning — so a reconstructed knee still
    // anchors the next reconstruction, while `lastObserved` (and with it all
    // confidence) only moves when the joint is genuinely seen.
    for (const key of Object.keys(RECONSTRUCTABLE)) {
      const idx = Number(key)
      const raw = lms[idx]
      const lm = out[idx]
      if (!lm) continue
      const observed = raw && (raw.visibility ?? 1) >= OCCLUDED_BELOW
      const isEstimate = observed || repaired.includes(idx)
      if (!isEstimate) continue
      const prev = this.estimate.get(idx)
      const velocity = prev && this.frameNo - prev.frame === 1
        ? { x: lm.x - prev.pt.x, y: lm.y - prev.pt.y }
        : undefined
      this.estimate.set(idx, { pt: { x: lm.x, y: lm.y }, frame: this.frameNo, velocity })
      if (observed) this.lastObserved.set(idx, this.frameNo)
    }

    return {
      landmarks: out,
      repaired,
      violations: validateBones(out, skeleton),
      calibrated: skeleton.ready,
    }
  }

  reset(): void {
    this.cal.reset()
    this.estimate.clear()
    this.lastObserved.clear()
    this.frameNo = 0
  }
}

// ------------------------------------------------------ measured values

/** How a value was arrived at. Ordered worst-to-best deliberately: anything
 *  combining several bases should take the weakest. */
export type Basis = 'predicted' | 'reconstructed' | 'observed'

export interface Measured<T> {
  value: T
  /** 0–1. */
  confidence: number
  basis: Basis
  /** Frames within the measured window where the input was not observed. */
  occludedFrames: number
}

/** Below this a number is shown plainly. */
export const CONFIDENCE_SHOW = 0.8
/** Below this a number is not shown at all — an honest gap instead. */
export const CONFIDENCE_HIDE = 0.5

export type Presentation = 'show' | 'qualify' | 'withhold'

/**
 * Whether a measurement may be shown, and how.
 *
 * The rule this encodes: a coach trusting a wrong number is worse than a coach
 * seeing an honest gap. `withhold` is not a failure state — it is the module
 * working.
 */
export function presentation(m: Measured<unknown>): Presentation {
  if (m.confidence >= CONFIDENCE_SHOW) return 'show'
  if (m.confidence >= CONFIDENCE_HIDE) return 'qualify'
  return 'withhold'
}

/** Plain-language explanation for a measurement that isn't fully trusted.
 *  Names the cause, because "low confidence" tells a coach nothing they can
 *  act on whereas "the knee was hidden" tells them to move the camera. */
export function measurementNote(m: Measured<unknown>, jointLabel = 'the joint'): string | null {
  switch (presentation(m)) {
    case 'show':
      return null
    case 'qualify':
      return `${jointLabel} was blocked for part of this rep — treat this as approximate.`
    case 'withhold':
      return `Couldn't measure this: ${jointLabel} was hidden for most of the rep. Try a camera angle where it stays in view.`
  }
}

/** Combine per-frame bases over a rep. Takes the WEAKEST — a rep is only as
 *  trustworthy as its worst frames, and averaging would let a mostly-good rep
 *  hide a completely unmeasured bottom position, which is the exact moment
 *  that matters most. */
export function combineBasis(bases: Basis[]): Basis {
  if (bases.includes('predicted')) return 'predicted'
  if (bases.includes('reconstructed')) return 'reconstructed'
  return 'observed'
}

// NOTE: rep-level grading (`gradeRep`, `repQualityNote`) lives in `pose.ts`
// alongside the `Rep` type it describes, NOT here. Putting it in this module
// would have made `pose.ts` import `skeleton.ts` while `skeleton.ts` already
// imports `Lm` from `pose.ts` — a circular dependency, which this project
// checks for with madge precisely so it doesn't get one by accident.
