import { describe, it, expect } from 'vitest'
import { formatSetsSummary, summarizeBlock } from './gridFormat'
import type { Block, ExercisePrescription, SetPrescription } from '@/db/types'

function ex(sets: SetPrescription[], overrides: Partial<ExercisePrescription> = {}): ExercisePrescription {
  return { id: 'e1', exerciseId: 'bench-press', sets, ...overrides }
}

function block(overrides: Partial<Block> = {}): Block {
  return { id: 'b1', type: 'straight', exercises: [], ...overrides }
}

describe('formatSetsSummary', () => {
  it('collapses uniform sets into a count', () => {
    expect(formatSetsSummary([{ reps: '8-10' }, { reps: '8-10' }, { reps: '8-10' }])).toBe('3×8-10')
  })

  it('lists varying sets individually', () => {
    expect(formatSetsSummary([{ reps: '10' }, { reps: '8' }, { reps: 'AMRAP' }])).toBe('10, 8, AMRAP')
  })

  it('includes absolute load', () => {
    expect(formatSetsSummary([{ reps: '8', load: 185, loadMode: 'absolute' }])).toBe('1×8 @185')
  })

  it('includes percent-1RM load', () => {
    expect(formatSetsSummary([{ reps: '5', load: 72, loadMode: 'percent1rm' }])).toBe('1×5 @72%')
  })

  it('includes RPE load', () => {
    expect(formatSetsSummary([{ reps: '5', rpe: 8, loadMode: 'rpe' }])).toBe('1×5 @RPE8')
  })

  it('includes a load note', () => {
    expect(formatSetsSummary([{ reps: '10', loadNote: 'moderate band' }])).toBe('1×10 (moderate band)')
  })

  it('falls back to time or distance when no reps-based load applies', () => {
    expect(formatSetsSummary([{ timeSeconds: 30 }])).toBe('1×30s')
    expect(formatSetsSummary([{ distanceM: 400 }])).toBe('1×400m')
  })

  it('handles missing reps as an em dash', () => {
    expect(formatSetsSummary([{}])).toBe('1×—')
  })

  it('returns a message for no sets at all', () => {
    expect(formatSetsSummary([])).toBe('No sets')
  })
})

describe('summarizeBlock', () => {
  it('prefers intervalSpec for timed blocks regardless of exercises', () => {
    expect(summarizeBlock(block({ intervalSpec: 'EMOM 10', type: 'interval' }))).toBe('EMOM 10')
  })

  it('shows the single exercise set summary for a straight block', () => {
    expect(summarizeBlock(block({ exercises: [ex([{ reps: '8-10' }, { reps: '8-10' }])] }))).toBe('2×8-10')
  })

  it('shows a superset count for multi-exercise blocks', () => {
    expect(summarizeBlock(block({ type: 'superset', exercises: [ex([{ reps: '10' }]), ex([{ reps: '10' }], { id: 'e2' })] })))
      .toBe('Superset · 2 exercises')
  })

  it('shows Empty for a block with no exercises and no interval spec', () => {
    expect(summarizeBlock(block())).toBe('Empty')
  })
})
