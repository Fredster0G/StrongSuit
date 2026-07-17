import { describe, it, expect } from 'vitest'
import { parseCsv, guessMapping, mapCsvRows } from './csv'

describe('parseCsv', () => {
  it('parses a plain comma-separated file', () => {
    const rows = parseCsv('First,Last,Email\nAlex,Rivera,alex@x.com\nSam,Lee,sam@x.com')
    expect(rows).toEqual([
      ['First', 'Last', 'Email'],
      ['Alex', 'Rivera', 'alex@x.com'],
      ['Sam', 'Lee', 'sam@x.com'],
    ])
  })

  it('handles quoted fields containing commas and escaped quotes', () => {
    const rows = parseCsv('Name,Goals\n"Rivera, Alex","Wants a ""strong"" deadlift"')
    expect(rows).toEqual([
      ['Name', 'Goals'],
      ['Rivera, Alex', 'Wants a "strong" deadlift'],
    ])
  })

  it('drops blank lines', () => {
    const rows = parseCsv('A,B\n\nC,D\n')
    expect(rows).toEqual([['A', 'B'], ['C', 'D']])
  })

  it('normalizes CRLF line endings', () => {
    const rows = parseCsv('A,B\r\nC,D\r\n')
    expect(rows).toEqual([['A', 'B'], ['C', 'D']])
  })
})

describe('guessMapping', () => {
  it('matches common export header names', () => {
    expect(guessMapping(['First Name', 'Last Name', 'Email Address', 'Phone', 'Goals'])).toEqual(
      ['firstName', 'lastName', 'email', 'phone', 'goals'],
    )
  })

  it('falls back to ignore for unrecognized headers', () => {
    expect(guessMapping(['Widget ID', 'Color'])).toEqual(['ignore', 'ignore'])
  })

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(guessMapping([' email ', 'PHONE'])).toEqual(['email', 'phone'])
  })
})

describe('mapCsvRows', () => {
  it('maps columns per the given mapping', () => {
    const rows = mapCsvRows(
      [['Alex', 'Rivera', 'alex@x.com', 'a,b;c']],
      ['firstName', 'lastName', 'email', 'tags'],
    )
    expect(rows).toEqual([{ firstName: 'Alex', lastName: 'Rivera', email: 'alex@x.com', tags: ['a', 'b', 'c'], invalid: false }])
  })

  it('splits a single full-name column when no separate last-name column is mapped', () => {
    const rows = mapCsvRows([['Alex Rivera']], ['firstName'])
    expect(rows[0]).toMatchObject({ firstName: 'Alex', lastName: 'Rivera' })
  })

  it('keeps a single-word name entirely in firstName', () => {
    const rows = mapCsvRows([['Madonna']], ['firstName'])
    expect(rows[0]).toMatchObject({ firstName: 'Madonna', lastName: '' })
  })

  it('flags rows missing a first name as invalid', () => {
    const rows = mapCsvRows([['', 'Rivera']], ['firstName', 'lastName'])
    expect(rows[0].invalid).toBe(true)
  })

  it('ignores columns mapped to "ignore"', () => {
    const rows = mapCsvRows([['Alex', 'skip-me']], ['firstName', 'ignore'])
    expect(rows[0]).not.toHaveProperty('goals')
  })
})
