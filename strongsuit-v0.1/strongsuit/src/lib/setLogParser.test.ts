import { describe, it, expect } from 'vitest'
import { parseSetLog, isEmpty } from './setLogParser'

describe('parseSetLog', () => {
  it('parses "<load> for <reps>"', () => {
    expect(parseSetLog('185 for 8')).toMatchObject({ load: 185, reps: 8 })
    expect(parseSetLog('225 by 5')).toMatchObject({ load: 225, reps: 5 })
    expect(parseSetLog('60kg x 10')).toMatchObject({ load: 60, reps: 10 })
    expect(parseSetLog('135 pounds for 10')).toMatchObject({ load: 135, reps: 10 })
  })

  it('parses "<reps> [reps] at <load>"', () => {
    expect(parseSetLog('8 reps at 185')).toMatchObject({ load: 185, reps: 8 })
    expect(parseSetLog('8 at 185')).toMatchObject({ load: 185, reps: 8 })
  })

  it('pulls RPE out regardless of where it sits in the phrase', () => {
    expect(parseSetLog('185 for 8 at RPE 8')).toMatchObject({ load: 185, reps: 8, rpe: 8 })
    expect(parseSetLog('RPE 9, 225 for 5')).toMatchObject({ load: 225, reps: 5, rpe: 9 })
    expect(parseSetLog('12 reps at an RPE of 7.5')).toMatchObject({ rpe: 7.5 })
  })

  it('parses bodyweight sets as reps only, no load', () => {
    const p = parseSetLog('bodyweight for 12')
    expect(p.reps).toBe(12)
    expect(p.load).toBeUndefined()
  })

  it('parses a bare rep count', () => {
    expect(parseSetLog('8 reps')).toMatchObject({ reps: 8 })
    expect(parseSetLog('8')).toMatchObject({ reps: 8 })
  })

  it('is case-insensitive', () => {
    expect(parseSetLog('185 FOR 8 AT RPE 8')).toMatchObject({ load: 185, reps: 8, rpe: 8 })
  })

  it('always preserves the raw transcript, even when nothing parses', () => {
    const p = parseSetLog('felt strong today')
    expect(p.raw).toBe('felt strong today')
    expect(isEmpty(p)).toBe(true)
  })

  it('trims whitespace and handles empty input without throwing', () => {
    expect(parseSetLog('  185 for 8  ')).toMatchObject({ load: 185, reps: 8 })
    expect(parseSetLog('')).toEqual({ raw: '' })
    expect(isEmpty(parseSetLog(''))).toBe(true)
  })

  it('isEmpty is false as soon as any one field parsed', () => {
    expect(isEmpty(parseSetLog('185 for 8'))).toBe(false)
    expect(isEmpty(parseSetLog('RPE 8'))).toBe(false)
    expect(isEmpty(parseSetLog('8 reps'))).toBe(false)
  })
})
