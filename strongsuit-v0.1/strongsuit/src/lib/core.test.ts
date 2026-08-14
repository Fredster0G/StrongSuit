import { describe, it, expect, afterEach, vi } from 'vitest'
import { daysSince, singleFlight } from './core'

afterEach(() => { vi.useRealTimers() })

/** Freeze the clock at a local wall-clock time. */
function at(y: number, m: number, d: number, h = 12) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(y, m - 1, d, h))
}

describe('daysSince — calendar days, in the user’s own timezone', () => {
  it('reports 0 for something logged today', () => {
    at(2026, 8, 5)
    expect(daysSince('2026-08-05')).toBe(0)
  })

  it('still reports 0 late in the evening — the bug this was written for', () => {
    // Debt #63, reproduced exactly: a date-only string parses as UTC
    // midnight, so at 9pm in any timezone behind UTC the arithmetic version
    // saw >24h elapsed and rendered a session logged TODAY as "1d ago".
    at(2026, 8, 5, 21)
    expect(daysSince('2026-08-05')).toBe(0)
    at(2026, 8, 5, 23)
    expect(daysSince('2026-08-05')).toBe(0)
  })

  it('reports 0 in the early hours too, from the other side of UTC', () => {
    at(2026, 8, 5, 1)
    expect(daysSince('2026-08-05')).toBe(0)
  })

  it('counts sleeps, not 24-hour periods', () => {
    // 11pm Monday → 1am Tuesday is "yesterday" to a person and 0.08 days to
    // arithmetic. The old floor-the-elapsed-hours version said 0.
    at(2026, 8, 5, 1)
    expect(daysSince('2026-08-04')).toBe(1)
  })

  it('counts multi-day gaps correctly', () => {
    at(2026, 8, 5)
    expect(daysSince('2026-08-01')).toBe(4)
    expect(daysSince('2026-07-05')).toBe(31)
  })

  it('handles full ISO timestamps, not just date-only strings', () => {
    at(2026, 8, 5, 12)
    const yesterdayNoon = new Date(2026, 7, 4, 12).toISOString()
    expect(daysSince(yesterdayNoon)).toBe(1)
  })

  it('returns null for missing or unparseable input rather than NaN', () => {
    // NaN renders as "NaN days ago", which is worse than showing nothing.
    expect(daysSince(undefined)).toBeNull()
    expect(daysSince('')).toBeNull()
    expect(daysSince('not a date')).toBeNull()
  })

  it('does not go negative for a date logged today in the future', () => {
    at(2026, 8, 5, 9)
    expect(daysSince('2026-08-05')).toBe(0)
  })
})

describe('singleFlight', () => {
  it('coalesces concurrent callers onto one run', async () => {
    // The fix for the first-boot blank screen in both apps: StrictMode ran the
    // boot effect twice, both copies missed the row, both inserted, and the
    // loser's ConstraintError rejected a promise nothing was catching.
    let runs = 0
    const fn = singleFlight(async () => {
      runs++
      await new Promise(r => setTimeout(r, 10))
      return 'value'
    })
    const [a, b, c] = await Promise.all([fn(), fn(), fn()])
    expect(runs).toBe(1)
    expect([a, b, c]).toEqual(['value', 'value', 'value'])
  })

  it('runs again after the first call settles', async () => {
    let runs = 0
    const fn = singleFlight(async () => { runs++; return runs })
    await fn()
    await fn()
    expect(runs).toBe(2)
  })

  it('clears its in-flight slot when the call rejects', async () => {
    // Otherwise one transient failure poisons every later attempt for the
    // lifetime of the page.
    let runs = 0
    const fn = singleFlight(async () => {
      runs++
      if (runs === 1) throw new Error('transient')
      return 'ok'
    })
    await expect(fn()).rejects.toThrow('transient')
    await expect(fn()).resolves.toBe('ok')
  })
})
