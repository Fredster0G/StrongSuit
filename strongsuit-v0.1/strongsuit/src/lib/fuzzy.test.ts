import { describe, it, expect } from 'vitest'
import { createFuzzyIndex } from './fuzzy'

describe('createFuzzyIndex', () => {
  const items = [
    { name: 'Romanian Deadlift', aliases: ['rdl'] },
    { name: 'Conventional Deadlift', aliases: ['deadlift', 'dl'] },
    { name: 'Leg Press', aliases: ['press'] },
    { name: 'Overhead Press', aliases: ['ohp'] },
    { name: 'Barbell Row', aliases: ['row'] },
    { name: 'Dumbbell Row', aliases: ['db row'] },
  ]

  const search = createFuzzyIndex(items, (i) => [i.name, ...i.aliases])

  it('matches exactly', () => {
    const res = search('rdl')
    expect(res[0].item.name).toBe('Romanian Deadlift')
    expect(res[0].score).toBe(100) // EXACT
  })

  it('matches prefix', () => {
    const res = search('Romanian')
    expect(res[0].item.name).toBe('Romanian Deadlift')
    expect(res[0].score).toBe(80) // PREFIX
  })

  it('matches word prefix', () => {
    const res = search('Dead')
    // Both 'Romanian Deadlift' and 'Conventional Deadlift' contain 'Dead' as word prefix
    expect(res.some((r) => r.item.name === 'Romanian Deadlift')).toBe(true)
    expect(res.some((r) => r.item.name === 'Conventional Deadlift')).toBe(true)
  })

  it('matches subsequence', () => {
    // "dl" matches exactly to Conventional Deadlift's alias
    const exactDl = search('dl')
    expect(exactDl[0].item.name).toBe('Conventional Deadlift')

    // "cgbp" doesn't exist, but "bb row" exists
    const row = search('bb')
    expect(row.some((r) => r.item.name === 'Barbell Row')).toBe(true)
    expect(row.some((r) => r.item.name === 'Dumbbell Row')).toBe(true)
  })

  it('matches subsequence properly', () => {
    // "r d l" without spaces
    const rdlSub = search('rodl') 
    // "ROmanian DeadLift" -> subsequence
    expect(rdlSub[0].item.name).toBe('Romanian Deadlift')
    expect(rdlSub[0].score).toBeGreaterThanOrEqual(10)
    expect(rdlSub[0].score).toBeLessThan(40)
  })
})
