// ===== Progression engine (spec §4.14) =====
// Pure, deterministic, explainable. Given exercise history + a policy, return
// a next-session suggestion WITH its reasoning line. No I/O, no randomness —
// every suggestion can be reproduced and defended to a client.

import type { ProgressionPolicy, Units } from '@/db/types'

/** One past performance of an exercise (a session's sets, done sets only matter). */
export interface PerformedSet {
  load?: number
  reps?: number
  rpe?: number
  done: boolean
}
export interface Performance {
  date: string // yyyy-MM-dd
  sets: PerformedSet[]
}

export interface Suggestion {
  load?: number
  reps?: string           // display string, e.g. "8" | "8-12"
  reason: string          // human reasoning line, always present
  direction: 'up' | 'hold' | 'down'
}

/** Smallest sensible jump the trainer can actually load on a bar. */
export const plateStep = (units: Units) => (units === 'lb' ? 2.5 : 1.25)

/** Round a load to the nearest achievable plate increment. */
export function roundToPlate(load: number, units: Units): number {
  const step = plateStep(units)
  return Math.round(load / step) * step
}

/** Working sets = done sets with a real load+reps. */
const workingSets = (p: Performance) =>
  p.sets.filter(s => s.done && (s.load ?? 0) > 0 && (s.reps ?? 0) > 0)

const topLoad = (p: Performance) =>
  Math.max(...workingSets(p).map(s => s.load ?? 0), 0)

const avgRpe = (p: Performance) => {
  const rated = workingSets(p).filter(s => s.rpe != null)
  if (!rated.length) return null
  return rated.reduce((a, s) => a + (s.rpe ?? 0), 0) / rated.length
}

/**
 * Next-session suggestion for a policy. `history` is newest-first (matches
 * logsRepo.exerciseHistory). Returns null when there is nothing to reason from.
 */
export function suggestNext(
  policy: ProgressionPolicy,
  history: Performance[],
  units: Units,
): Suggestion | null {
  const last = history.find(p => workingSets(p).length > 0)
  if (!last) return null
  const load = topLoad(last)
  const sets = workingSets(last)

  switch (policy.kind) {
    case 'linear-load': {
      const next = roundToPlate(load * (1 + policy.percent / 100), units)
      const bumped = next > load ? next : roundToPlate(load + plateStep(units), units)
      return {
        load: bumped,
        direction: 'up',
        reason: `Linear +${policy.percent}% on last top set ${load} ${units} → ${bumped} ${units} (rounded to ${plateStep(units)} ${units} steps).`,
      }
    }

    case 'double-progression': {
      const [lo, hi] = policy.repRange
      const allAtTop = sets.every(s => (s.reps ?? 0) >= hi)
      if (allAtTop) {
        const next = roundToPlate(load + policy.loadIncrement, units)
        return {
          load: next,
          reps: `${lo}`,
          direction: 'up',
          reason: `Every set hit the top of the ${lo}–${hi} range at ${load} ${units} — add ${policy.loadIncrement} ${units} and reset to ${lo} reps.`,
        }
      }
      const minReps = Math.min(...sets.map(s => s.reps ?? 0))
      const nextReps = Math.min(minReps + 1, hi)
      return {
        load,
        reps: `${nextReps}`,
        direction: 'hold',
        reason: `Still inside the ${lo}–${hi} range (lowest set: ${minReps} reps). Hold ${load} ${units}, aim for ${nextReps}+ on every set.`,
      }
    }

    case 'rpe-target': {
      const rpe = avgRpe(last)
      if (rpe == null) {
        return {
          load,
          direction: 'hold',
          reason: `No RPE logged last session — hold ${load} ${units} and record RPE to drive progression.`,
        }
      }
      const r = Math.round(rpe * 10) / 10
      if (rpe <= policy.target - 1) {
        const next = Math.max(roundToPlate(load * 1.025, units), roundToPlate(load + plateStep(units), units))
        return {
          load: next,
          direction: 'up',
          reason: `Last session averaged RPE ${r}, target is ${policy.target} — room to add. ${load} → ${next} ${units} (~2.5%).`,
        }
      }
      if (rpe >= policy.target + 1) {
        const next = Math.min(roundToPlate(load * 0.96, units), roundToPlate(load - plateStep(units), units))
        return {
          load: Math.max(next, plateStep(units)),
          direction: 'down',
          reason: `Last session averaged RPE ${r}, over the ${policy.target} target — back off ~4%. ${load} → ${Math.max(next, plateStep(units))} ${units}.`,
        }
      }
      return {
        load,
        direction: 'hold',
        reason: `Last session averaged RPE ${r} — right on the ${policy.target} target. Hold ${load} ${units}.`,
      }
    }
  }
}

/**
 * Policy-free heuristic used where no program policy is attached (history
 * drawer): infers a double-progression read from the last performance alone.
 */
export function suggestHeuristic(history: Performance[], units: Units): Suggestion | null {
  const last = history.find(p => workingSets(p).length > 0)
  if (!last) return null
  const sets = workingSets(last)
  const load = topLoad(last)
  const minReps = Math.min(...sets.map(s => s.reps ?? 0))
  const rpe = avgRpe(last)

  if (rpe != null && rpe >= 9.5) {
    return {
      load,
      direction: 'hold',
      reason: `Last session averaged RPE ${Math.round(rpe * 10) / 10} — near max. Repeat ${load} ${units} before adding.`,
    }
  }
  if (minReps >= 12) {
    const next = roundToPlate(load * 1.05, units)
    return {
      load: next > load ? next : roundToPlate(load + plateStep(units), units),
      reps: '8',
      direction: 'up',
      reason: `All sets at ${minReps}+ reps — load is light. Add ~5% (${load} → ${next} ${units}) and rebuild from 8.`,
    }
  }
  if (minReps >= 8) {
    const next = roundToPlate(load + plateStep(units), units)
    return {
      load: next,
      direction: 'up',
      reason: `Every set at ${minReps}+ reps at ${load} ${units} — take the smallest jump to ${next} ${units}.`,
    }
  }
  return {
    load,
    reps: `${minReps + 1}`,
    direction: 'hold',
    reason: `Lowest set was ${minReps} reps at ${load} ${units} — hold the load, chase ${minReps + 1}+ on every set.`,
  }
}
