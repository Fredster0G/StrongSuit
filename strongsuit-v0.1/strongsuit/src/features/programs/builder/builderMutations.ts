import type { Block, BlockType, ExercisePrescription } from '@/db/types'
import { newId } from '@/lib/core'

/** Shared block/exercise shapes so Day view and Grid view never drift on
 *  what a freshly-created block or prescription looks like. */
export function makeBlock(type: BlockType = 'straight'): Block {
  return { id: newId(), type, exercises: [] }
}

export function makeExercisePrescription(exerciseId: string): ExercisePrescription {
  return { id: newId(), exerciseId, sets: [{ reps: '10', loadMode: 'absolute' }] }
}
