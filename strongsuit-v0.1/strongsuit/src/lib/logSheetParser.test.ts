import { describe, it, expect } from 'vitest'
import { parseLogSheet } from './logSheetParser'

describe('parseLogSheet', () => {
  it('extracts one set per parseable line, in order', () => {
    const result = parseLogSheet('Bench Press\n185 for 8\n195 for 6\n205 for 3')
    expect(result.sets).toHaveLength(3)
    expect(result.sets[0]).toMatchObject({ load: 185, reps: 8 })
    expect(result.sets[1]).toMatchObject({ load: 195, reps: 6 })
    expect(result.sets[2]).toMatchObject({ load: 205, reps: 3 })
  })

  it('skips lines that do not parse (a title, a date) without throwing', () => {
    const result = parseLogSheet('Leg Day - Aug 12\n315 for 5\nfelt heavy today\n325 for 3')
    expect(result.sets).toHaveLength(2)
    expect(result.sets[0]).toMatchObject({ load: 315, reps: 5 })
    expect(result.sets[1]).toMatchObject({ load: 325, reps: 3 })
  })

  it('always preserves the full raw OCR text, even when nothing parses', () => {
    const result = parseLogSheet('just noise, no numbers here')
    expect(result.raw).toBe('just noise, no numbers here')
    expect(result.sets).toHaveLength(0)
  })

  it('handles Windows and Unix line endings the same way', () => {
    expect(parseLogSheet('185 for 8\r\n195 for 6').sets).toHaveLength(2)
  })

  it('ignores blank lines between sets', () => {
    const result = parseLogSheet('185 for 8\n\n\n195 for 6')
    expect(result.sets).toHaveLength(2)
  })

  it('handles an empty scan without throwing', () => {
    const result = parseLogSheet('')
    expect(result.sets).toHaveLength(0)
    expect(result.raw).toBe('')
  })
})
