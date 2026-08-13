import { describe, it, expect } from 'vitest'
import { buildSelfReviewSummary } from './filmSummary'
import type { Rep } from './pose'

const rep = (over: Partial<Rep> = {}): Rep =>
  ({ bottomAngle: 92, eccentricMs: 1500, concentricMs: 900, depth: 96, ...over })

describe('buildSelfReviewSummary', () => {
  it('returns nothing when no reps were tracked', () => {
    // Callers check truthiness to decide whether to show the summary card at
    // all — an empty string must mean "nothing to say", not a stub heading.
    expect(buildSelfReviewSummary({ reps: [] })).toBe('')
  })

  it('reports rep count and the last rep\'s tempo and depth', () => {
    const out = buildSelfReviewSummary({ reps: [rep(), rep({ eccentricMs: 2000, concentricMs: 1000, depth: 88 })] })
    expect(out).toContain('2 reps tracked')
    expect(out).toContain('2.0s down, 1.0s up, 88% of target depth')
  })

  it('uses the singular for one rep', () => {
    expect(buildSelfReviewSummary({ reps: [rep()] })).toContain('1 rep tracked')
  })

  it('praises good numbers and flags poor ones', () => {
    const good = buildSelfReviewSummary({
      reps: [rep()], depthConsistency: 92, tempoConsistency: 88, symmetryPct: 96, barPathDriftPct: 4,
    })
    expect(good).toContain('depth held steady')
    expect(good).toContain('tempo was even')
    expect(good).toContain('Left and right stayed even')
    expect(good).toContain('stayed close to vertical')

    const poor = buildSelfReviewSummary({
      reps: [rep()], depthConsistency: 40, tempoConsistency: 55, symmetryPct: 70, barPathDriftPct: 30,
    })
    expect(poor).toContain('depth drifted')
    expect(poor).toContain('tempo changed')
    expect(poor).toContain('One side worked harder')
    expect(poor).toContain('drifted off vertical')
  })

  it('omits any measurement that could not be computed', () => {
    const out = buildSelfReviewSummary({ reps: [rep()], symmetryPct: null, barPathDriftPct: null })
    expect(out).not.toContain('symmetry')
    expect(out).not.toContain('bar')
  })

  it('names the exercise in the heading when one is known', () => {
    expect(buildSelfReviewSummary({ reps: [rep()] }, { exerciseName: 'Back Squat' }))
      .toContain('Self-review — Back Squat')
  })
})
