import { db } from '../schema'
import { trainerRepo } from '../repo'
import { singleFlight } from '@/lib/core'
import type { Exercise } from '../types'

/**
 * Idempotent: seeds an empty library, or updates an existing library if the
 * seed version has increased (DEBT-67).
 *
 * Safe to overwrite every non-custom row unconditionally on a version bump —
 * this does NOT need to diff old-vs-new content to "rescue" a coach edit,
 * because a coach edit to a stock exercise never lands in `db.exercises` in
 * the first place: `exercisesRepo.update()` (the only real edit path,
 * `LibraryPage.tsx`) already routes every stock-exercise edit into the
 * separate `exerciseOverrides` table and leaves the base row untouched (see
 * `repo/index.ts`'s `mergeOverride`/`update`). An earlier version of this
 * function diffed stored cues/equipment against the incoming seed and
 * treated any difference as "the coach must have edited this" — which is
 * wrong the moment a seed version legitimately changes an exercise's own
 * cues: every coach who never touched that row would have had the OLD text
 * frozen into a phantom override, permanently blocking the real update from
 * ever reaching them. Overrides are untouched here on purpose; they keep
 * applying on top of whatever stock content this writes, via `mergeOverride`
 * at read time.
 */
export const seedExercisesIfEmpty = singleFlight(async () => {
  const CURRENT_SEED_VERSION = 1
  const trainer = await trainerRepo.getOrCreate()

  if (trainer.seedVersion && trainer.seedVersion >= CURRENT_SEED_VERSION) return false

  const { buildSeedExercises } = await import('./exercises')
  const newSeed = buildSeedExercises()

  const existing = await db.exercises.toArray()
  const existingByName = new Map(existing.filter(e => !e.isCustom).map(e => [e.name, e]))

  const toPut: Exercise[] = newSeed.map(seedEx => {
    const prior = existingByName.get(seedEx.name)
    // Preserve the row's id/createdAt if it already existed (so its
    // ExerciseOverride, keyed by id, keeps applying); a genuinely new
    // seed entry gets its own fresh id/createdAt from buildSeedExercises().
    return prior ? { ...seedEx, id: prior.id, createdAt: prior.createdAt } : seedEx
  })

  await db.transaction('rw', [db.exercises, db.trainer], async () => {
    await db.exercises.bulkPut(toPut)
    await trainerRepo.patch({ seedVersion: CURRENT_SEED_VERSION })
  })

  return true
})
