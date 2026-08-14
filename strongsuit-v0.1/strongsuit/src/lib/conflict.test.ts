import { describe, it, expect } from 'vitest'
import {
  policyFor, resolve, unionSessionEntries, sameContent, naturalKey, TABLE_POLICY,
} from './conflict'
import type { Base } from '@/db/types'

const T0 = '2026-08-01T10:00:00.000Z'
const T1 = '2026-08-01T11:00:00.000Z'

function row<T extends object>(over: T & { id?: string; updatedAt?: string }) {
  return {
    id: 'r1', createdAt: T0, updatedAt: T0,
    ...over,
  } as unknown as Base & T
}

describe('policyFor', () => {
  it('routes training history and money away from newest-wins', () => {
    expect(policyFor('sessionLogs')).toBe('union-entries')
    expect(policyFor('payments')).toBe('manual')
    expect(policyFor('invoices')).toBe('manual')
    expect(policyFor('metrics')).toBe('union-by-key')
  })

  it('falls back to newest-wins for anything unlisted', () => {
    // Adding a table must not silently change how an existing one merges.
    expect(policyFor('somethingNew')).toBe('newest-wins')
  })

  it('never lets a money table be auto-resolved', () => {
    // Doctrine test. The cost of asking is a click; the cost of guessing is a
    // wrong balance the coach may never notice.
    for (const table of ['payments', 'invoices']) {
      expect(TABLE_POLICY[table]).toBe('manual')
    }
  })
})

describe('unionSessionEntries — two trainers, one session', () => {
  it('keeps exercises only one device knows about', () => {
    // THE BUG. Both rows share an id, so the old whole-row put() replaced one
    // trainer's work with the other's and no one was told.
    const mine = row({
      updatedAt: T1,
      entries: [{ exerciseId: 'squat', sets: [1, 2, 3] }],
    })
    const theirs = row({
      updatedAt: T0,
      entries: [{ exerciseId: 'bench', sets: [1, 2] }],
    })
    const merged = unionSessionEntries(mine, theirs) as unknown as { entries: { exerciseId: string }[] }
    expect(merged.entries.map(e => e.exerciseId).sort()).toEqual(['bench', 'squat'])
  })

  it('keeps the fuller record when both logged the same exercise', () => {
    // Picking by timestamp would throw away four logged sets in favour of two
    // just because the two were saved later.
    const fuller = row({ updatedAt: T0, entries: [{ exerciseId: 'squat', sets: [1, 2, 3, 4] }] })
    const thinner = row({ updatedAt: T1, entries: [{ exerciseId: 'squat', sets: [1, 2] }] })
    expect(unionSessionEntries(thinner, fuller).entries[0].sets).toHaveLength(4)
    expect(unionSessionEntries(fuller, thinner).entries[0].sets).toHaveLength(4)
  })

  it('keeps both coaches’ notes rather than deleting one', () => {
    const a = row({ updatedAt: T0, entries: [], sessionNotes: 'Knee felt tight.' })
    const b = row({ updatedAt: T1, entries: [], sessionNotes: 'Dropped to 80%.' })
    const merged = unionSessionEntries(b, a)
    expect(merged.sessionNotes).toContain('Knee felt tight.')
    expect(merged.sessionNotes).toContain('Dropped to 80%.')
  })

  it('does not duplicate an identical note', () => {
    const a = row({ updatedAt: T0, entries: [], sessionNotes: 'Same note.' })
    const b = row({ updatedAt: T1, entries: [], sessionNotes: 'Same note.' })
    expect(unionSessionEntries(b, a).sessionNotes).toBe('Same note.')
  })

  it('takes single-valued fields from the newer row', () => {
    const older = row({ updatedAt: T0, title: 'Lower A', entries: [] })
    const newer = row({ updatedAt: T1, title: 'Lower A (deload)', entries: [] })
    expect((unionSessionEntries(newer, older) as { title: string }).title).toBe('Lower A (deload)')
  })

  it('survives rows with no entries at all', () => {
    const a = row({ updatedAt: T0, entries: undefined })
    const b = row({ updatedAt: T1, entries: undefined })
    expect(unionSessionEntries(b, a).entries).toEqual([])
  })

  it('is order-independent for the union itself', () => {
    const a = row({ updatedAt: T0, entries: [{ exerciseId: 'squat', sets: [1] }] })
    const b = row({ updatedAt: T1, entries: [{ exerciseId: 'row', sets: [1] }] })
    const ids = (r: { entries: { exerciseId: string }[] }) => r.entries.map(e => e.exerciseId).sort()
    expect(ids(unionSessionEntries(a, b))).toEqual(ids(unionSessionEntries(b, a)))
  })
})

describe('resolve', () => {
  it('applies anything genuinely new', () => {
    const r = resolve('manual', row({ updatedAt: T0 }), undefined)
    expect(r.action).toBe('apply')
  })

  it('does nothing for an identical row, whatever the policy', () => {
    // An unchanged row arriving again is not a conflict, and flagging it as
    // one would fill the Conflicts view with noise until it gets ignored.
    for (const p of ['manual', 'newest-wins', 'union-by-key'] as const) {
      const a = row({ updatedAt: T0, amount: 50 })
      const b = row({ updatedAt: T1, amount: 50 }) // differs only by timestamp
      expect(resolve(p, b, a).action).toBe('keep')
    }
  })

  it('refuses to auto-resolve money and hands it to a person', () => {
    const existing = row({ updatedAt: T0, amount: 100 })
    const incoming = row({ updatedAt: T1, amount: 40 })
    const r = resolve('manual', incoming, existing)
    expect(r.action).toBe('conflict')
    expect(r.reason).toMatch(/financial/i)
  })

  it('merges session entries rather than replacing the row', () => {
    const existing = row({ updatedAt: T0, entries: [{ exerciseId: 'bench', sets: [1] }] })
    const incoming = row({ updatedAt: T1, entries: [{ exerciseId: 'squat', sets: [1] }] })
    const r = resolve('union-entries', incoming, existing)
    expect(r.action).toBe('apply')
    if (r.action !== 'apply') return
    expect((r.row as unknown as { entries: unknown[] }).entries).toHaveLength(2)
  })

  it('does not let a timestamp TIE be decided by arrival order', () => {
    // The old merge used `>=`, so two saves in the same second were resolved
    // by whichever packet happened to arrive second.
    const existing = row({ updatedAt: T0, note: 'local' })
    const incoming = row({ updatedAt: T0, note: 'remote' })
    expect(resolve('newest-wins', incoming, existing).action).toBe('keep')
    expect(resolve('union-by-key', incoming, existing).action).toBe('keep')
  })

  it('takes a genuinely newer row under newest-wins', () => {
    const r = resolve('newest-wins', row({ updatedAt: T1, v: 2 }), row({ updatedAt: T0, v: 1 }))
    expect(r.action).toBe('apply')
  })

  it('keeps the local row when the incoming one is older', () => {
    const r = resolve('newest-wins', row({ updatedAt: T0, v: 1 }), row({ updatedAt: T1, v: 2 }))
    expect(r.action).toBe('keep')
  })

  it('never deletes — the worst outcome is keeping what we already had', () => {
    // Every branch either applies, keeps, or asks. None of them drop a row.
    const outcomes = (['manual', 'newest-wins', 'union-by-key', 'union-entries'] as const)
      .map(p => resolve(p, row({ updatedAt: T1, v: 2 }), row({ updatedAt: T0, v: 1 })).action)
    expect(outcomes.every(a => a === 'apply' || a === 'keep' || a === 'conflict')).toBe(true)
  })
})

describe('sameContent', () => {
  it('ignores timestamps when comparing', () => {
    expect(sameContent(row({ updatedAt: T0, a: 1 }), row({ updatedAt: T1, a: 1 }))).toBe(true)
  })

  it('notices a real difference', () => {
    expect(sameContent(row({ updatedAt: T0, a: 1 }), row({ updatedAt: T0, a: 2 }))).toBe(false)
  })

  it('sees differences INSIDE nested objects and arrays', () => {
    // The bug this test exists for: the first version used
    // `JSON.stringify(v, keys)`, whose array argument is a property allowlist
    // rather than a sort order — so it stripped every nested field and two
    // completely different session logs compared as identical, which would
    // have silently skipped real training data.
    const a = row({ updatedAt: T0, entries: [{ exerciseId: 'squat', sets: [1, 2, 3] }] })
    const b = row({ updatedAt: T0, entries: [{ exerciseId: 'bench', sets: [1] }] })
    expect(sameContent(a, b)).toBe(false)
  })

  it('is not fooled by key order', () => {
    const a = row({ updatedAt: T0, ...{ x: 1, y: 2 } })
    const b = row({ updatedAt: T0, ...{ y: 2, x: 1 } })
    expect(sameContent(a, b)).toBe(true)
  })

  it('distinguishes array ORDER, which is meaningful for sets', () => {
    const a = row({ updatedAt: T0, sets: [1, 2] })
    const b = row({ updatedAt: T0, sets: [2, 1] })
    expect(sameContent(a, b)).toBe(false)
  })
})

describe('naturalKey', () => {
  it('collapses the same reading recorded on two devices', () => {
    const a = row({ clientId: 'c1', date: '2026-08-01', key: 'bodyweight' })
    const b = row({ id: 'other', clientId: 'c1', date: '2026-08-01', key: 'bodyweight' })
    expect(naturalKey(a)).toBe(naturalKey(b))
  })

  it('keeps different days and different measures apart', () => {
    const base = { clientId: 'c1', date: '2026-08-01', key: 'bodyweight' }
    expect(naturalKey(row(base))).not.toBe(naturalKey(row({ ...base, date: '2026-08-02' })))
    expect(naturalKey(row(base))).not.toBe(naturalKey(row({ ...base, key: 'waist' })))
  })
})
