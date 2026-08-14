import { describe, it, expect } from 'vitest'
import { clampToStep, filterOptions } from './advanced'

describe('clampToStep', () => {
  it('passes an in-range value through unchanged', () => {
    expect(clampToStep(50, { min: 0, max: 100 })).toBe(50)
  })

  it('clamps to min and max', () => {
    expect(clampToStep(-5, { min: 0, max: 100 })).toBe(0)
    expect(clampToStep(150, { min: 0, max: 100 })).toBe(100)
  })

  it('works with only one bound set', () => {
    expect(clampToStep(-5, { min: 0 })).toBe(0)
    expect(clampToStep(150, { max: 100 })).toBe(100)
    expect(clampToStep(-5, { max: 100 })).toBe(-5)
  })

  it('is a no-op with no bounds at all', () => {
    expect(clampToStep(12345)).toBe(12345)
  })

  it('rounds to the step’s own decimal precision', () => {
    // The actual bug this exists to prevent: repeated 0.1 increments
    // accumulate floating-point noise (0.1 + 0.1 + 0.1 !== 0.3) into the
    // value shown in the field — Business's profit-planner mockup uses
    // exactly this step size for "Sessions / client / mo".
    expect(clampToStep(0.1 + 0.1 + 0.1, { step: 0.1 })).toBe(0.3)
  })

  it('rounds a whole-number step to a whole number', () => {
    expect(clampToStep(4.7, { step: 5 })).toBe(5)
    expect(clampToStep(4.2, { step: 1 })).toBe(4)
  })

  it('defaults to whole-number rounding when step is omitted', () => {
    expect(clampToStep(4.999999999)).toBe(5)
  })

  it('clamps and rounds together, in either order the caller might hit it', () => {
    expect(clampToStep(99.9999, { max: 100, step: 5 })).toBe(100)
  })
})

describe('filterOptions', () => {
  const options = [
    { value: 'jordan', label: 'Jordan Fields' },
    { value: 'sam', label: 'Sam Rivera' },
    { value: 'alex', label: 'Alex Chen' },
  ]

  it('returns everything for an empty query', () => {
    expect(filterOptions(options, '')).toEqual(options)
    expect(filterOptions(options, '   ')).toEqual(options)
  })

  it('matches a substring case-insensitively', () => {
    expect(filterOptions(options, 'jordan')).toEqual([options[0]])
    expect(filterOptions(options, 'JORDAN')).toEqual([options[0]])
    expect(filterOptions(options, 'rive')).toEqual([options[1]])
  })

  it('matches mid-label, not just a prefix', () => {
    // A client-switcher is searched by first OR last name — "Fields" must
    // match even though "Jordan" comes first in the label.
    expect(filterOptions(options, 'Fields')).toEqual([options[0]])
  })

  it('returns an empty array rather than falling back to everything', () => {
    expect(filterOptions(options, 'zzz')).toEqual([])
  })

  it('trims surrounding whitespace before matching', () => {
    expect(filterOptions(options, '  sam  ')).toEqual([options[1]])
  })
})
