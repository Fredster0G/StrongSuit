// ===== Pose analysis math (Film Room tracking AI, spec §4.16b) =====
// Pure functions over pose landmarks — no MediaPipe imports here, so all of
// this is unit-testable. The landmark indices follow the MediaPipe Pose
// 33-point topology (https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker).

export interface Lm { x: number; y: number; z?: number; visibility?: number }

/** Joint triples [A, vertex, C] in MediaPipe Pose index space. */
export const JOINTS = {
  'Knee (L)': [23, 25, 27],
  'Knee (R)': [24, 26, 28],
  'Hip (L)': [11, 23, 25],
  'Hip (R)': [12, 24, 26],
  'Elbow (L)': [11, 13, 15],
  'Elbow (R)': [12, 14, 16],
  'Shoulder (L)': [13, 11, 23],
  'Shoulder (R)': [14, 12, 24],
} as const
export type JointName = keyof typeof JOINTS

/** Landmark pairs for symmetry readout: [left joint, right joint]. */
export const SYMMETRY_PAIRS: [JointName, JointName, string][] = [
  ['Knee (L)', 'Knee (R)', 'Knees'],
  ['Hip (L)', 'Hip (R)', 'Hips'],
  ['Elbow (L)', 'Elbow (R)', 'Elbows'],
]

const MIN_VISIBILITY = 0.5

/** Interior angle at the vertex of a joint triple, in degrees. Null when any
 *  landmark is missing or below the visibility gate. */
export function jointAngle(lms: Lm[], triple: readonly [number, number, number]): number | null {
  const pts = triple.map(i => lms[i])
  if (pts.some(p => !p || (p.visibility ?? 1) < MIN_VISIBILITY)) return null
  const [a, b, c] = pts
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const m1 = Math.hypot(v1.x, v1.y)
  const m2 = Math.hypot(v2.x, v2.y)
  if (!m1 || !m2) return null
  const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / (m1 * m2)))
  return Math.round((Math.acos(cos) * 180) / Math.PI)
}

/** All joint angles for a frame. */
export function frameAngles(lms: Lm[]): Partial<Record<JointName, number>> {
  const out: Partial<Record<JointName, number>> = {}
  for (const [name, triple] of Object.entries(JOINTS) as [JointName, readonly [number, number, number]][]) {
    const a = jointAngle(lms, triple)
    if (a !== null) out[name] = a
  }
  return out
}

/** Left/right symmetry as a percentage: 100 = perfectly matched angles. */
export function symmetryPct(left: number | undefined, right: number | undefined): number | null {
  if (left == null || right == null) return null
  const diff = Math.abs(left - right)
  return Math.max(0, Math.round(100 - (diff / 180) * 100 * 2)) // 9° apart ≈ 90%
}

/** Depth achieved as % of a target range of motion. standAngle = joint angle
 *  standing tall, targetAngle = angle at full target depth (e.g. squat: 90°
 *  knee for powerlifting depth). Capped at 0–120 so "beyond depth" is visible. */
export function depthPct(minAngle: number, standAngle = 175, targetAngle = 90): number {
  const rom = standAngle - targetAngle
  if (rom <= 0) return 0
  return Math.max(0, Math.min(120, Math.round(((standAngle - minAngle) / rom) * 100)))
}

// ---- Rep detection: hysteresis state machine over one joint-angle series ----
export interface Rep {
  bottomAngle: number       // deepest angle reached in the rep
  eccentricMs: number       // time descending
  concentricMs: number      // time ascending
  depth: number             // depthPct at the bottom
  /**
   * How well the working joint was actually SEEN during this rep
   * (docs/plans/04-FILM-ROOM-V2.md §2, Layer 3).
   *
   * `partial`/`unmeasurable` mean equipment was blocking the joint and
   * `lib/skeleton.ts` reconstructed it. The depth number above is then an
   * inference, and the UI must not present it as a measurement — a coach
   * trusting a wrong depth is worse than a coach seeing an honest gap.
   *
   * Optional because a caller that never feeds occlusion data (any existing
   * one) gets `undefined` and the UI treats it exactly as before.
   */
  quality?: RepQuality
  /**
   * What the depth percentage is measured AGAINST.
   *
   * `preset` = true full extension for this equipment. `observed` = the widest
   * angle that appeared in this clip, which is a weaker claim: if the lifter
   * never reached the top, the reference is short and the percentage is
   * flattering. The UI says which, because presenting them identically is how
   * a coach ends up trusting the wrong one (debt #10).
   */
  depthBasis?: 'preset' | 'observed'
}

/** `measured` = seen throughout · `partial` = reconstructed for part of the
 *  rep · `unmeasurable` = hidden for the part that decides depth. */
export type RepQuality = 'measured' | 'partial' | 'unmeasurable'

/** A rep is `partial` once this share of its frames were reconstructed. */
export const PARTIAL_FRACTION = 0.15
/** …and `unmeasurable` past this. Beyond roughly half, the depth number is an
 *  inference wearing a measurement's clothes. */
export const UNMEASURABLE_FRACTION = 0.5

/**
 * Grade how well a rep was actually observed.
 *
 * Deliberately NOT a flat percentage of occluded frames: the frames that
 * decide depth are the ones AT THE BOTTOM. A rep that was crystal clear on
 * the way down and hidden at the turnaround is exactly the rep whose depth
 * number is worthless, and a percentage would happily call it "85% measured".
 * So a hidden bottom is enough on its own to withhold the number.
 */
export function gradeRep(opts: {
  /** Frames in the rep. */
  total: number
  /** How many had the working joint reconstructed rather than seen. */
  reconstructed: number
  /** Was the joint reconstructed at the rep's deepest point? */
  bottomReconstructed: boolean
}): RepQuality {
  if (opts.total <= 0) return 'unmeasurable'
  const share = opts.reconstructed / opts.total
  if (opts.bottomReconstructed && share >= PARTIAL_FRACTION) return 'unmeasurable'
  if (share >= UNMEASURABLE_FRACTION) return 'unmeasurable'
  if (share > 0 || opts.bottomReconstructed) return 'partial'
  return 'measured'
}

/** What to say about a rep whose depth we don't fully trust. Null when the
 *  rep was properly measured and the number needs no caveat. */
export function repQualityNote(q: RepQuality): string | null {
  switch (q) {
    case 'measured': return null
    case 'partial': return 'Part of this rep was blocked — depth is approximate.'
    case 'unmeasurable': return "The joint was hidden at the bottom of this rep, so depth couldn't be measured."
  }
}

/**
 * One-Euro Filter (1€ Filter) for smoothing noisy signals (like pose angles).
 * It uses an adaptive low-pass filter: heavy smoothing at low speeds (to cut jitter),
 * and light smoothing at high speeds (to reduce lag).
 */
class OneEuroFilter {
  private minCutoff: number
  private beta: number
  private dCutoff: number

  constructor(minCutoff = 1.0, beta = 0.05, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  private lastTime = -1
  private xHat = 0
  private dxHat = 0

  private alpha(cutoff: number, dt: number) {
    const tau = 1.0 / (2 * Math.PI * cutoff)
    return 1.0 / (1.0 + tau / dt)
  }

  filter(tMs: number, x: number): number {
    const t = tMs / 1000.0 // seconds
    if (this.lastTime < 0) {
      this.lastTime = t
      this.xHat = x
      this.dxHat = 0
      return x
    }
    const dt = t - this.lastTime
    if (dt <= 0) return this.xHat // prevent div by zero if timestamps repeat

    // 1. estimate speed (derivative) and smooth it
    const dx = (x - this.xHat) / dt
    const alphaD = this.alpha(this.dCutoff, dt)
    this.dxHat = alphaD * dx + (1 - alphaD) * this.dxHat

    // 2. compute dynamic cutoff: higher speed -> higher cutoff -> less smoothing (less lag)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxHat)

    // 3. smooth the position
    const alphaX = this.alpha(cutoff, dt)
    this.xHat = alphaX * x + (1 - alphaX) * this.xHat

    this.lastTime = t
    return this.xHat
  }

  reset() {
    this.lastTime = -1
    this.xHat = 0
    this.dxHat = 0
  }
}

// ---- Landmark-level smoothing (spec §4.16b advanced tracking) ----
// The 1€ filter above was only ever applied to the ANGLE derived from
// landmarks — the raw skeleton (what actually renders on screen, and what
// bar-path tracking reads) was never smoothed at all, so it could visibly
// jitter frame to frame even while the rep-counting math looked stable.
// LandmarkSmoother runs every one of the 33 points through its own x/y
// filter pair, AND blends toward the smoothed history — not the raw new
// value — when a point's visibility is in the low-confidence band just
// above the detection gate, since that's exactly where occlusion (a bench,
// a rack upright) produces a real but noisy, low-confidence estimate rather
// than a clean drop to "not visible." A point never seen before has nothing
// to blend toward, so the very first sighting always passes through raw.
const LOW_CONF_VISIBILITY = 0.7 // below this: blend toward filtered history

export class LandmarkSmoother {
  private fx: (OneEuroFilter | undefined)[] = []
  private fy: (OneEuroFilter | undefined)[] = []
  private last: (Lm | undefined)[] = []

  smooth(lms: Lm[], tMs: number): Lm[] {
    return lms.map((lm, i) => {
      const visibility = lm.visibility ?? 1
      if (visibility < MIN_VISIBILITY) return lm // not visible at all — nothing to smooth, pass through

      this.fx[i] ??= new OneEuroFilter()
      this.fy[i] ??= new OneEuroFilter()
      // Always update the filter, even on a low-confidence frame — it needs
      // continuous input to track velocity correctly. What changes with
      // confidence is which output we actually USE below.
      const filteredX = this.fx[i]!.filter(tMs, lm.x)
      const filteredY = this.fy[i]!.filter(tMs, lm.y)

      let outX = filteredX, outY = filteredY
      const prev = this.last[i]
      if (prev && visibility < LOW_CONF_VISIBILITY) {
        // Low-confidence band: lean toward the last trusted position rather
        // than this frame's noisy (but nominally-above-the-gate) reading —
        // linearly, so a point right at the MIN_VISIBILITY floor relies
        // almost entirely on the held position, and one just under the
        // high-confidence line barely blends at all.
        const trust = (visibility - MIN_VISIBILITY) / (LOW_CONF_VISIBILITY - MIN_VISIBILITY)
        outX = filteredX * trust + prev.x * (1 - trust)
        outY = filteredY * trust + prev.y * (1 - trust)
      }

      const out = { ...lm, x: outX, y: outY }
      this.last[i] = out
      return out
    })
  }

  reset() {
    this.fx = []
    this.fy = []
    this.last = []
  }
}

/**
 * Feed (timestampMs, angle) samples in order; reps are detected when the angle
 * dips below the lower threshold and returns above the upper threshold
 * (hysteresis avoids double-counting jitter). Thresholds auto-calibrate from
 * the observed range after a small warm-up window. Uses a 1€ filter for smoothing.
 */
export class RepCounter {
  private minSeen = Infinity
  private maxSeen = -Infinity
  private samples = 0
  private phase: 'idle' | 'down' | 'up' = 'idle'
  private descentStart = 0
  private bottomTime = 0
  private bottomAngle = Infinity
  private filter = new OneEuroFilter()
  readonly reps: Rep[] = []

  /**
   * True full-extension angle for this movement, when it's actually known
   * (supplied by an equipment preset — see `lib/equipment.ts`).
   *
   * Fixes debt #10. Without it, depth is measured against the widest angle
   * that happened to appear in the footage — fine for a squat where the
   * lifter stands up between reps, and wrong on a **leg press where nobody
   * locks out**, because the "top" was never in the clip and every depth
   * reading is inflated against a reference that doesn't exist.
   */
  private readonly opts: { referenceExtended?: number; referenceTarget?: number }
  constructor(opts: { referenceExtended?: number; referenceTarget?: number } = {}) {
    this.opts = opts
  }

  // Occlusion bookkeeping for the rep currently in progress. Counted here
  // rather than by the caller because only this class knows where a rep
  // starts, and — critically — which frame was the BOTTOM, which is the one
  // that decides whether the depth number means anything at all.
  private framesInRep = 0
  private occludedInRep = 0
  private bottomWasOccluded = false

  /**
   * @param occluded true when the working joint was reconstructed rather than
   *        seen this frame. Optional: callers that don't track occlusion pass
   *        nothing and reps come back without a `quality`, exactly as before.
   */
  push(tMs: number, rawAngle: number, occluded = false): Rep | null {
    const angle = this.filter.filter(tMs, rawAngle)
    this.minSeen = Math.min(this.minSeen, angle)
    this.maxSeen = Math.max(this.maxSeen, angle)
    this.samples++
    const range = this.maxSeen - this.minSeen
    // need a real movement range before we trust thresholds
    if (this.samples < 10 || range < 25) return null

    const downThresh = this.maxSeen - range * 0.35
    const upThresh = this.maxSeen - range * 0.12

    if (this.phase === 'idle' && angle < downThresh) {
      this.phase = 'down'
      this.descentStart = tMs
      this.bottomAngle = angle
      this.bottomTime = tMs
      this.framesInRep = 1
      this.occludedInRep = occluded ? 1 : 0
      this.bottomWasOccluded = occluded
    } else if (this.phase === 'down') {
      this.framesInRep++
      if (occluded) this.occludedInRep++
      if (angle < this.bottomAngle) {
        this.bottomAngle = angle
        this.bottomTime = tMs
        // Whether the DEEPEST frame was seen or inferred — the single fact
        // that decides if this rep's depth is a measurement or a guess.
        this.bottomWasOccluded = occluded
      }
      if (angle > upThresh) {
        this.phase = 'idle'
        const rep: Rep = {
          bottomAngle: Math.round(this.bottomAngle),
          eccentricMs: Math.max(0, this.bottomTime - this.descentStart),
          concentricMs: Math.max(0, tMs - this.bottomTime),
          depth: depthPct(
            this.bottomAngle,
            this.opts.referenceExtended ?? this.maxSeen,
            this.opts.referenceTarget,
          ),
          depthBasis: this.opts.referenceExtended != null ? 'preset' : 'observed',
          quality: gradeRep({
            total: this.framesInRep,
            reconstructed: this.occludedInRep,
            bottomReconstructed: this.bottomWasOccluded,
          }),
        }
        this.reps.push(rep)
        return rep
      }
    }
    return null
  }

  reset() {
    this.minSeen = Infinity
    this.maxSeen = -Infinity
    this.samples = 0
    this.phase = 'idle'
    this.reps.length = 0
    this.filter.reset()
  }
}

/** One buffered frame's worth of joint angles, keyed by timestamp — what
 *  FilmRoomPage accumulates while the focus joint is still undetermined. */
export interface AngleSample { tMs: number; angles: Partial<Record<JointName, number>> }

/**
 * Feed a buffered history of per-frame angles for one joint through a
 * RepCounter that hasn't seen any frames yet. `RepCounter` and
 * `FocusJointPicker` both need a warm-up window before they'll trust
 * anything (a real movement range for the counter, `>24°` of observed range
 * for the joint picker) — until both warm-ups clear, no angle sample ever
 * reaches the counter, so a rep completed *during* that calibration window
 * would otherwise be silently dropped forever. Call this once, the moment
 * the focus joint first becomes known, with every sample buffered since
 * tracking started — it replays them through the counter in order so any
 * rep that already happened gets scored retroactively, then live frames
 * continue pushing into the same counter as normal.
 */
export function replayHistory(counter: RepCounter, history: AngleSample[], joint: JointName): void {
  for (const sample of history) {
    const a = sample.angles[joint]
    if (a != null) counter.push(sample.tMs, a)
  }
}

/** Pick the joint with the largest range of motion — that's the working joint
 *  (knee for squats, elbow for presses/curls, hip for hinges).
 *
 *  Also tracks how often each joint was actually visible out of every frame
 *  pushed. Equipment (a bench, a machine arm, a rack upright) partially
 *  blocking a limb doesn't just drop that joint to `null` cleanly — MediaPipe
 *  still emits a low-confidence estimate right around the visibility gate,
 *  and that estimate can swing wildly frame to frame. A joint that's only
 *  ever glimpsed through a gap can rack up a bigger apparent "range" than a
 *  joint that's genuinely, cleanly tracked the whole time — so `best()`
 *  requires a joint to have been seen in most frames before it's trusted,
 *  not just to have the widest range. */
export class FocusJointPicker {
  private ranges = new Map<JointName, { min: number; max: number; seen: number }>()
  private totalFrames = 0

  /** Joints an equipment preset says can't be the working joint on this
   *  movement — seated legs on a lat pulldown, for instance. Excluding them is
   *  not a heuristic: it's knowing what machine the person is on, which beats
   *  any amount of inference from the pixels. */
  private readonly exclude: readonly JointName[]
  constructor(exclude: readonly JointName[] = []) {
    this.exclude = exclude
  }

  push(angles: Partial<Record<JointName, number>>) {
    this.totalFrames++
    for (const [name, a] of Object.entries(angles) as [JointName, number][]) {
      if (this.exclude.includes(name)) continue
      const r = this.ranges.get(name)
      if (!r) this.ranges.set(name, { min: a, max: a, seen: 1 })
      else { r.min = Math.min(r.min, a); r.max = Math.max(r.max, a); r.seen++ }
    }
  }
  best(): JointName | null {
    let bestName: JointName | null = null
    let bestRange = 24 // require meaningful movement
    for (const [name, r] of this.ranges) {
      const range = r.max - r.min
      const visibleFrac = this.totalFrames > 0 ? r.seen / this.totalFrames : 0
      if (range > bestRange && visibleFrac >= 0.6) { bestRange = range; bestName = name }
    }
    return bestName
  }
}

/** Skeleton bone list (landmark index pairs) for overlay drawing. */
export const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],       // arms + shoulders
  [11, 23], [12, 24], [23, 24],                            // torso
  [23, 25], [25, 27], [24, 26], [26, 28],                  // legs
  [27, 31], [28, 32],                                      // feet
]

// ---- Set-level consistency (spec §4.16c biomechanics expansion) ----
export interface ConsistencyScore {
  score: number   // 0–100, higher = more repeatable
  cv: number      // coefficient of variation (%) the score is derived from
}

/** Coefficient of variation (SD/mean) turned into a 0–100 "consistency"
 *  score — the standard way exercise-science literature expresses rep-to-rep
 *  repeatability of a measured quantity. Lower CV = higher score. */
function cvScore(values: number[]): ConsistencyScore | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return null
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
  const sd = Math.sqrt(variance)
  const cv = (sd / Math.abs(mean)) * 100
  return { score: Math.max(0, Math.round(100 - cv * 4)), cv: Math.round(cv * 10) / 10 }
}

export interface SetConsistency {
  depth: ConsistencyScore | null
  tempo: ConsistencyScore | null
}

/** How repeatable a set was, rep to rep — depth and tempo. A coach reads a
 *  low depth-consistency score as "reps are getting shallower/inconsistent,"
 *  a classic fatigue or technique-breakdown signal. */
export function repConsistency(reps: Rep[]): SetConsistency {
  return {
    depth: cvScore(reps.map(r => r.depth)),
    tempo: cvScore(reps.map(r => r.eccentricMs + r.concentricMs)),
  }
}

// ---- Bar-path tracking (spec §4.16c) ----
/** Wrist landmarks — the practical stand-in for "the bar" when a client grips
 *  a barbell; both wrists average out minor left/right camera-angle noise. */
const WRIST_LANDMARKS: [number, number] = [15, 16]

export function barPathPoint(lms: Lm[]): Pt | null {
  const pts = WRIST_LANDMARKS.map(i => lms[i]).filter(p => p && (p.visibility ?? 1) >= MIN_VISIBILITY)
  if (!pts.length) return null
  return {
    x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
    y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
  }
}

export interface Pt { x: number; y: number }

export interface BarPathResult {
  /** horizontal drift from the starting x, in % of the tracked path's own
   *  width — 0 = perfectly vertical bar path, higher = more forward/backward drift. */
  driftPct: number
  /** the point of maximum horizontal drift, useful to mark on the overlay. */
  worstPoint: Pt | null
}

/** Deviation of a tracked path from vertical — the classic "bar path"
 *  analysis coaches use to spot a bar drifting forward off the mid-foot. */
export function barPathDeviation(points: Pt[]): BarPathResult {
  if (points.length < 2) return { driftPct: 0, worstPoint: null }
  const xs = points.map(p => p.x)
  const startX = xs[0]
  const spanY = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) || 1
  let worstDrift = 0
  let worstPoint: Pt | null = null
  for (const p of points) {
    const drift = Math.abs(p.x - startX)
    if (drift > worstDrift) { worstDrift = drift; worstPoint = p }
  }
  return { driftPct: Math.round((worstDrift / spanY) * 1000) / 10, worstPoint }
}
