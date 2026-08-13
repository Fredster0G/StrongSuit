// ===== Self-review summary (T13) =====
// Turns a tracked set's numbers into plain English. The coach app has a
// sibling of this (`lib/filmRoomSummary.ts`) but it is deliberately NOT a
// verbatim copy the way `lib/sync.ts`/`lib/pose.ts` are: those must agree
// byte-for-byte because they define a shared wire format and shared math.
// This is prose, and the audience is different — the coach's version is
// written about a client ("worth watching for a one-sided compensation"),
// this one is written to you, about your own lift.
//
// Every threshold below is the same as the coach app's so the two never
// disagree about whether a set was good; only the wording differs.

import type { Rep } from './pose'

export interface SelfReviewStats {
  reps: Rep[]
  symmetryPct?: number | null
  depthConsistency?: number | null
  tempoConsistency?: number | null
  barPathDriftPct?: number | null
}

export const GOOD_CONSISTENCY = 80
export const GOOD_SYMMETRY = 90
export const GOOD_BAR_PATH_DRIFT = 15

/** Plain-English readout of a tracked set, addressed to the lifter. Returns
 *  an empty string when nothing was tracked, so callers can just check truthiness. */
export function buildSelfReviewSummary(stats: SelfReviewStats, opts: { exerciseName?: string } = {}): string {
  if (stats.reps.length === 0) return ''

  const lines: string[] = []
  lines.push(opts.exerciseName ? `Self-review — ${opts.exerciseName}` : 'Self-review')
  lines.push('')

  const last = stats.reps.at(-1)!
  const repWord = stats.reps.length === 1 ? 'rep' : 'reps'
  lines.push(`${stats.reps.length} ${repWord} tracked. Last rep: ${(last.eccentricMs / 1000).toFixed(1)}s down, ${(last.concentricMs / 1000).toFixed(1)}s up, ${last.depth}% of target depth.`)

  if (stats.depthConsistency != null) {
    lines.push(stats.depthConsistency >= GOOD_CONSISTENCY
      ? `Your depth held steady across reps (${stats.depthConsistency}% consistency).`
      : `Your depth drifted between reps (${stats.depthConsistency}% consistency) — often the first thing to go as you fatigue.`)
  }
  if (stats.tempoConsistency != null) {
    lines.push(stats.tempoConsistency >= GOOD_CONSISTENCY
      ? `Your tempo was even rep to rep (${stats.tempoConsistency}% consistency).`
      : `Your tempo changed rep to rep (${stats.tempoConsistency}% consistency) — try counting the lowering phase.`)
  }
  if (stats.symmetryPct != null) {
    lines.push(stats.symmetryPct >= GOOD_SYMMETRY
      ? `Left and right stayed even (${stats.symmetryPct}% symmetry).`
      : `One side worked harder than the other (${stats.symmetryPct}% symmetry) — worth mentioning to your coach.`)
  }
  if (stats.barPathDriftPct != null) {
    lines.push(stats.barPathDriftPct <= GOOD_BAR_PATH_DRIFT
      ? `The bar stayed close to vertical (${stats.barPathDriftPct}% drift).`
      : `The bar drifted off vertical (${stats.barPathDriftPct}% drift) — think about keeping it over mid-foot.`)
  }

  return lines.join('\n')
}
