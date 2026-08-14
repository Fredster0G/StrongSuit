// ===== Client-vs-reference comparison math (Film Room dual tracking) =====
// Pure functions only — no MediaPipe, no DOM. Takes the same AngleSample/Rep
// data each tracked clip's analysis pipeline already produces and answers
// the actual coaching question: not just "here are two skeletons," but
// "which joint diverges most, and by how much, rep for rep."

import type { AngleSample, JointName, Rep } from './pose'

export interface RepComparison {
  index: number
  depthA: number | null
  depthB: number | null
  /** B's depth minus A's, in percentage points. Positive = B went deeper. */
  depthDeltaPts: number | null
  tempoASec: number | null
  tempoBSec: number | null
  /** (B − A) / A, as a percent. Positive = B's rep took longer overall. */
  tempoDeltaPct: number | null
}

/** Matches reps by ordinal (client's 3rd rep vs reference's 3rd rep) rather
 *  than by timestamp — robust even when the clips aren't sync-locked, and
 *  more directly answers "was this rep different" than a raw time overlay
 *  would. Only compares as many reps as both sides actually have. */
export function compareReps(repsA: Rep[], repsB: Rep[]): RepComparison[] {
  const n = Math.min(repsA.length, repsB.length)
  const out: RepComparison[] = []
  for (let i = 0; i < n; i++) {
    const a = repsA[i], b = repsB[i]
    const tempoA = (a.eccentricMs + a.concentricMs) / 1000
    const tempoB = (b.eccentricMs + b.concentricMs) / 1000
    out.push({
      index: i,
      depthA: a.depth,
      depthB: b.depth,
      depthDeltaPts: Math.round(b.depth - a.depth),
      tempoASec: tempoA,
      tempoBSec: tempoB,
      tempoDeltaPct: tempoA > 0 ? Math.round(((tempoB - tempoA) / tempoA) * 100) : null,
    })
  }
  return out
}

export interface JointDeviation {
  joint: JointName
  avgDeltaDeg: number
  maxDeltaDeg: number
  /** How many matched-in-time sample pairs this is based on — a deviation
   *  backed by 3 samples is noise; surface this so the UI can say so. */
  samples: number
}

/** Walks both angle-sample histories in lockstep (both are recorded in
 *  increasing-timestamp order) and, for every A sample, finds B's closest
 *  sample after applying the known clip-to-clip offset (the same B-minus-A
 *  seconds Film Room's "Lock sync" produces) — then reports, per joint, how
 *  far apart the two clips run on average. Samples with no match within
 *  `toleranceMs` are skipped rather than compared against a wrong moment;
 *  only meaningful once the two clips are actually time-aligned (sync-locked
 *  or overlaid), which is why the caller gates this on that state. */
export function compareAngles(
  samplesA: AngleSample[],
  samplesB: AngleSample[],
  offsetMs: number,
  toleranceMs = 80,
): JointDeviation[] {
  const acc = new Map<JointName, { sum: number; max: number; n: number }>()
  let bi = 0
  for (const sa of samplesA) {
    const targetB = sa.tMs + offsetMs
    while (
      bi < samplesB.length - 1 &&
      Math.abs(samplesB[bi + 1].tMs - targetB) <= Math.abs(samplesB[bi].tMs - targetB)
    ) {
      bi++
    }
    const sb = samplesB[bi]
    if (!sb || Math.abs(sb.tMs - targetB) > toleranceMs) continue
    for (const joint of Object.keys(sa.angles) as JointName[]) {
      const av = sa.angles[joint]
      const bv = sb.angles[joint]
      if (av == null || bv == null) continue
      const d = Math.abs(av - bv)
      const cur = acc.get(joint) ?? { sum: 0, max: 0, n: 0 }
      cur.sum += d
      cur.max = Math.max(cur.max, d)
      cur.n++
      acc.set(joint, cur)
    }
  }
  return [...acc.entries()]
    .map(([joint, s]) => ({ joint, avgDeltaDeg: Math.round(s.sum / s.n), maxDeltaDeg: Math.round(s.max), samples: s.n }))
    .sort((x, y) => y.avgDeltaDeg - x.avgDeltaDeg)
}
