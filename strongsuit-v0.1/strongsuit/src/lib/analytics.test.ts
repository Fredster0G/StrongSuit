import { describe, it, expect } from 'vitest'
import { currentWeekSessionCount } from './analytics'
import type { SessionLog } from '@/db/types'

function logOn(date: string): SessionLog {
  return {
    id: date, createdAt: '', updatedAt: '',
    clientId: 'c1', date, title: 'Session', entries: [], source: 'trainer',
  }
}

describe('currentWeekSessionCount', () => {
  // Week starts Monday (weekStartsOn=1). 2026-08-10 is a Monday, so
  // 2026-08-10..16 is "this week" and 2026-08-13 (Thursday) is today.
  const today = '2026-08-13'

  it('counts only sessions within the current calendar week', () => {
    const logs = [logOn('2026-08-11'), logOn('2026-08-12'), logOn('2026-08-03')]
    expect(currentWeekSessionCount(logs, 1, today)).toBe(2)
  })

  it('returns 0 when the most recent session was in a prior week', () => {
    const logs = [logOn('2026-07-20'), logOn('2026-08-01')]
    expect(currentWeekSessionCount(logs, 1, today)).toBe(0)
  })

  it('returns 0 for no logs at all', () => {
    expect(currentWeekSessionCount([], 1, today)).toBe(0)
  })

  it('respects weekStartsOn=0 (Sunday) boundaries', () => {
    // With Sunday start, the week containing 2026-08-13 (Thu) runs
    // 2026-08-09 (Sun) .. 2026-08-15 (Sat) — 2026-08-08 (Sat) falls outside it.
    const logs = [logOn('2026-08-09'), logOn('2026-08-08')]
    expect(currentWeekSessionCount(logs, 0, today)).toBe(1)
  })
})
