import type { Block, SetPrescription } from '@/db/types'

/** One set's compact text — reps plus whatever load info is actually set. */
function formatOneSet(s: SetPrescription): string {
  const reps = s.reps || '—'
  if (s.loadMode === 'percent1rm' && s.load != null) return `${reps} @${s.load}%`
  if (s.loadMode === 'rpe' && s.rpe != null) return `${reps} @RPE${s.rpe}`
  if (s.loadNote) return `${reps} (${s.loadNote})`
  if (s.load != null) return `${reps} @${s.load}`
  if (s.timeSeconds != null) return `${s.timeSeconds}s`
  if (s.distanceM != null) return `${s.distanceM}m`
  return reps
}

/** "3×8-10 @185" when every set is identical, else each set joined — the
 *  Grid view's per-exercise detail line. */
export function formatSetsSummary(sets: SetPrescription[]): string {
  if (sets.length === 0) return 'No sets'
  const parts = sets.map(formatOneSet)
  const uniform = parts.every(p => p === parts[0])
  return uniform ? `${sets.length}×${parts[0]}` : parts.join(', ')
}

/** A block's Grid-view detail line: interval spec first (EMOM/circuit
 *  blocks are timed, not set-by-set), else the single exercise's set
 *  summary, else a superset count for multi-exercise blocks. */
export function summarizeBlock(block: Block): string {
  if (block.intervalSpec) return block.intervalSpec
  if (block.exercises.length === 0) return 'Empty'
  if (block.exercises.length === 1) return formatSetsSummary(block.exercises[0].sets)
  return `Superset · ${block.exercises.length} exercises`
}
