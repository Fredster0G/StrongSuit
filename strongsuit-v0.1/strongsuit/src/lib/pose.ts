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
}

/**
 * Feed (timestampMs, angle) samples in order; reps are detected when the angle
 * dips below the lower threshold and returns above the upper threshold
 * (hysteresis avoids double-counting jitter). Thresholds auto-calibrate from
 * the observed range after a small warm-up window.
 */
export class RepCounter {
  private minSeen = Infinity
  private maxSeen = -Infinity
  private samples = 0
  private phase: 'idle' | 'down' | 'up' = 'idle'
  private descentStart = 0
  private bottomTime = 0
  private bottomAngle = Infinity
  readonly reps: Rep[] = []

  push(tMs: number, angle: number): Rep | null {
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
    } else if (this.phase === 'down') {
      if (angle < this.bottomAngle) {
        this.bottomAngle = angle
        this.bottomTime = tMs
      }
      if (angle > upThresh) {
        this.phase = 'idle'
        const rep: Rep = {
          bottomAngle: Math.round(this.bottomAngle),
          eccentricMs: Math.max(0, this.bottomTime - this.descentStart),
          concentricMs: Math.max(0, tMs - this.bottomTime),
          depth: depthPct(this.bottomAngle, this.maxSeen),
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
  }
}

/** Pick the joint with the largest range of motion — that's the working joint
 *  (knee for squats, elbow for presses/curls, hip for hinges). */
export class FocusJointPicker {
  private ranges = new Map<JointName, { min: number; max: number }>()
  push(angles: Partial<Record<JointName, number>>) {
    for (const [name, a] of Object.entries(angles) as [JointName, number][]) {
      const r = this.ranges.get(name)
      if (!r) this.ranges.set(name, { min: a, max: a })
      else { r.min = Math.min(r.min, a); r.max = Math.max(r.max, a) }
    }
  }
  best(): JointName | null {
    let bestName: JointName | null = null
    let bestRange = 24 // require meaningful movement
    for (const [name, r] of this.ranges) {
      const range = r.max - r.min
      if (range > bestRange) { bestRange = range; bestName = name }
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
