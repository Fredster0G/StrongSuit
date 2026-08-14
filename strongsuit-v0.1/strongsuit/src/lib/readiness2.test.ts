import { describe, it, expect } from 'vitest'
import { readinessV2, MIN_BASELINE_DAYS } from './readiness'
import type { CheckIn } from '@/db/types'

/** Build a run of check-ins ending today, oldest first. */
function series(
  n: number,
  fill: (i: number) => Partial<CheckIn>,
): CheckIn[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date('2026-07-01T00:00:00')
    d.setDate(d.getDate() + i)
    return {
      id: `c${i}`, clientId: 'client', date: d.toISOString().slice(0, 10),
      answers: [], source: 'trainer', createdAt: '', updatedAt: '',
      ...fill(i),
    } as CheckIn
  })
}

describe('readinessV2 — the baseline requirement', () => {
  it('refuses to score until there is enough history', () => {
    // Showing a confident number on day three is inventing precision. The
    // first time a coach catches it being wrong, every number loses credibility.
    const r = readinessV2({ checkIns: series(5, () => ({ sleepHours: 8, energy: 7 })) })
    expect(r.score).toBeNull()
    expect(r.band).toBe('learning')
    expect(r.recommendation).toMatch(/more check-in/i)
  })

  it('says how many more check-ins are needed', () => {
    const r = readinessV2({ checkIns: series(10, () => ({ sleepHours: 8 })) })
    // 10 total = 9 prior + today, so 5 more prior days are needed.
    expect(r.recommendation).toContain('5 more check-ins')
  })

  it('scores once the baseline window is satisfied', () => {
    const r = readinessV2({ checkIns: series(MIN_BASELINE_DAYS + 1, () => ({ sleepHours: 8, energy: 7 })) })
    expect(r.score).not.toBeNull()
    expect(r.band).not.toBe('learning')
    expect(r.historyDays).toBeGreaterThanOrEqual(MIN_BASELINE_DAYS)
  })

  it('handles no check-ins at all', () => {
    const r = readinessV2({ checkIns: [] })
    expect(r.score).toBeNull()
    expect(r.recommendation).toMatch(/no check-ins/i)
  })
})

describe('readinessV2 — individual baselines', () => {
  it('does NOT penalise a consistent short sleeper', () => {
    // THE test that justifies this rewrite. Someone who always sleeps 6h is
    // normal for them; a population threshold flags them amber forever.
    const r = readinessV2({ checkIns: series(20, () => ({ sleepHours: 6, energy: 7 })) })
    expect(r.band).toBe('go')
    expect(r.driver).toBeNull()
  })

  it('flags a drop relative to the person’s own normal, even when absolutely fine', () => {
    // 7h is objectively decent sleep — but not for someone who reliably gets 9.
    const checkIns = series(20, i => ({
      sleepHours: i < 19 ? 9 : 7,
      energy: 7,
    }))
    const r = readinessV2({ checkIns })
    const sleep = r.domains.find(d => d.domain === 'sleep')!
    expect(sleep.z).toBeLessThan(-1)
    // Assert the meaning, not the exact wording — a large enough drop switches
    // to the capped phrasing, and both correctly say "below normal".
    expect(sleep.description).toMatch(/below their normal/)
    expect(sleep.baseline).toBe(9)
  })

  it('names the worst domain as the driver', () => {
    const checkIns = series(20, i => ({
      sleepHours: 8,
      energy: i < 19 ? 8 : 2,
      mood: 7,
    }))
    const r = readinessV2({ checkIns })
    expect(r.driver?.domain).toBe('energy')
    expect(r.recommendation).toContain('energy')
  })

  it('orders domains worst-first so the UI can lead with what matters', () => {
    const checkIns = series(20, i => ({
      sleepHours: i < 19 ? 8 : 4,
      energy: i < 19 ? 8 : 7,
      mood: 7,
    }))
    const r = readinessV2({ checkIns })
    expect(r.domains[0].domain).toBe('sleep')
    expect(r.domains[0].z).toBeLessThan(r.domains[1].z)
  })

  it('never divides by zero on a perfectly flat history', () => {
    const r = readinessV2({ checkIns: series(20, () => ({ sleepHours: 8, energy: 7 })) })
    expect(Number.isFinite(r.score!)).toBe(true)
    expect(r.domains.every(d => Number.isFinite(d.z))).toBe(true)
    expect(r.domains.every(d => d.z === 0)).toBe(true)
  })

  it('still detects a real drop for an unusually consistent athlete', () => {
    // The SD floor earning its keep: a client whose sleep never varies has
    // ~0 measured spread, and without a floor a genuine two-hour loss would
    // either read as z=0 (invisible) or divide by zero.
    const checkIns = series(20, i => ({ sleepHours: i < 19 ? 9 : 7 }))
    const r = readinessV2({ checkIns })
    const sleep = r.domains.find(d => d.domain === 'sleep')!
    expect(Number.isFinite(sleep.z)).toBe(true)
    expect(sleep.z).toBeLessThanOrEqual(-2)
    expect(r.band).toBe('easy')
  })
})

describe('readinessV2 — banding and output', () => {
  it('a normal day is a good day, not a mediocre one', () => {
    // 0 SD must land exactly on the 'go' threshold. If normal read as amber,
    // the score would be permanently pessimistic and coaches would ignore it.
    const r = readinessV2({ checkIns: series(20, () => ({ sleepHours: 7.5, energy: 7 })) })
    expect(r.score).toBe(70)
    expect(r.band).toBe('go')
  })

  it('drops to easy on a bad day across several domains', () => {
    const checkIns = series(20, i => ({
      sleepHours: i < 19 ? 8 : 4,
      energy: i < 19 ? 8 : 2,
      mood: i < 19 ? 8 : 3,
    }))
    const r = readinessV2({ checkIns })
    expect(r.band).toBe('easy')
    expect(r.recommendation).toMatch(/cut load|technique/i)
  })

  it('clamps outliers instead of producing an impossible score', () => {
    const checkIns = series(20, i => ({ sleepHours: i < 19 ? 8 : 40 }))
    const r = readinessV2({ checkIns })
    expect(r.score).toBeLessThanOrEqual(100)
    expect(r.score).toBeGreaterThanOrEqual(0)
  })

  it('ignores domains missing from today’s check-in', () => {
    const checkIns = series(20, i => ({
      sleepHours: 8,
      energy: i < 19 ? 8 : undefined,
    }))
    const r = readinessV2({ checkIns })
    expect(r.domains.map(d => d.domain)).toEqual(['sleep'])
  })

  it('caps the reported deviation instead of printing an absurd figure', () => {
    // Found in live testing, not here: a very consistent client whose measured
    // spread is floored to MIN_SPREAD can compute to −10 SD, which reads as
    // broken. Beyond ~3 SD the exact number carries no extra meaning.
    const checkIns = series(20, i => ({ sleepHours: 9, energy: i < 19 ? 8 : 1 }))
    const r = readinessV2({ checkIns })
    const energy = r.domains.find(d => d.domain === 'energy')!
    expect(Math.abs(energy.z)).toBeLessThanOrEqual(3)
    // And when capped, the copy stops quoting a figure we don't believe.
    expect(energy.description).toBe('energy is far below their normal')
    expect(energy.description).not.toMatch(/\d+ SD/)
  })

  it('carries its citation', () => {
    const r = readinessV2({ checkIns: series(20, () => ({ sleepHours: 8 })) })
    expect(r.source).toMatch(/Bourdon|Hooper/)
  })
})
