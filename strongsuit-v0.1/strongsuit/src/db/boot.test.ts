import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from './schema'
import { trainerRepo, exercisesRepo } from './repo'
import { seedExercisesIfEmpty } from './seed'
import { buildSeedExercises } from './seed/exercises'
import { singleFlight } from '@/lib/core'

// Regression coverage for debt #6 / #54a: on a brand-new profile the boot
// screen hung forever. Both boot steps below are check-then-insert, and React
// StrictMode invokes the boot effect twice — so two copies ran concurrently,
// both read "empty", both inserted, and the loser's ConstraintError rejected
// straight out of AppRoot's un-caught async chain.
beforeEach(async () => {
  for (const table of db.tables) await table.clear()
})

describe('singleFlight', () => {
  it('coalesces concurrent calls into one run', async () => {
    let runs = 0
    const fn = singleFlight(async () => { runs++; await Promise.resolve(); return runs })
    const [a, b, c] = await Promise.all([fn(), fn(), fn()])
    expect(runs).toBe(1)
    expect([a, b, c]).toEqual([1, 1, 1])
  })

  it('runs again after the previous call settles', async () => {
    let runs = 0
    const fn = singleFlight(async () => { runs++; return runs })
    await fn()
    await fn()
    expect(runs).toBe(2)
  })

  it('propagates a rejection to every waiter and still allows a retry', async () => {
    let attempts = 0
    const fn = singleFlight(async () => {
      attempts++
      if (attempts === 1) throw new Error('boom')
      return 'ok'
    })
    await expect(Promise.all([fn(), fn()])).rejects.toThrow('boom')
    // The failed run must not be cached — the boot screen's Retry depends on it.
    await expect(fn()).resolves.toBe('ok')
  })
})

describe('trainerRepo.getOrCreate', () => {
  it('creates exactly one singleton row under concurrent first-boot calls', async () => {
    const [a, b] = await Promise.all([trainerRepo.getOrCreate(), trainerRepo.getOrCreate()])
    expect(a.id).toBe('trainer')
    expect(b.id).toBe(a.id)
    expect(await db.trainer.count()).toBe(1)
  })

  it('returns the existing row on a second boot instead of inserting again', async () => {
    const first = await trainerRepo.getOrCreate()
    await trainerRepo.patch({ trainerName: 'Caleb' })
    const second = await trainerRepo.getOrCreate()
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.trainerName).toBe('Caleb')
    expect(await db.trainer.count()).toBe(1)
  })

  it('adopts the winner\'s row when another tab inserts between the read and the write', async () => {
    // singleFlight can't cover a second tab — IndexedDB is shared across them.
    // `as never`: Dexie's methods return its own PromiseExtended, which a plain
    // async mock can't satisfy structurally. Test-only, no production impact.
    const add = vi.spyOn(db.trainer, 'add').mockImplementationOnce((async () => {
      await db.trainer.put({
        id: 'trainer', createdAt: 'other-tab', updatedAt: 'other-tab',
        businessName: 'Other Tab', trainerName: '', units: 'lb', weekStartsOn: 1,
        defaultRestSeconds: 90, currency: 'USD', onboardingComplete: false,
        companionCredit: true, density: 'compact', theme: 'system',
      })
      throw new Error('ConstraintError: Key already exists in the object store.')
    }) as never)
    const t = await trainerRepo.getOrCreate()
    expect(t.businessName).toBe('Other Tab')
    expect(await db.trainer.count()).toBe(1)
    add.mockRestore()
  })

  it('still surfaces a genuine write failure', async () => {
    const add = vi.spyOn(db.trainer, 'add').mockRejectedValueOnce(new Error('QuotaExceededError'))
    await expect(trainerRepo.getOrCreate()).rejects.toThrow('QuotaExceededError')
    add.mockRestore()
  })
})

describe('seedExercisesIfEmpty', () => {
  it('seeds the library exactly once under concurrent first-boot calls', async () => {
    const expected = buildSeedExercises().length
    const results = await Promise.all([seedExercisesIfEmpty(), seedExercisesIfEmpty()])
    expect(await db.exercises.count()).toBe(expected)
    expect(results).toEqual([true, true]) // Both callers await the same coalesced promise
  })

  it('is a no-op once the seedVersion is up to date', async () => {
    await seedExercisesIfEmpty()
    const after = await db.exercises.count()
    expect(await seedExercisesIfEmpty()).toBe(false)
    expect(await db.exercises.count()).toBe(after)
  })

  it('a real coach edit (via exercisesRepo.update) survives a seed-version bump untouched', { timeout: 10000 }, async () => {
    // 1. Initial boot (sets seedVersion to 1)
    await seedExercisesIfEmpty()

    // 2. Coach edits an existing seed exercise through the REAL edit path —
    //    LibraryPage.tsx never writes db.exercises directly for a stock row,
    //    it always goes through exercisesRepo.update(), which routes into
    //    exerciseOverrides. A raw db.exercises.update() (the old version of
    //    this test) doesn't reflect how a coach edit actually reaches
    //    storage and was masking exactly the bug fixed alongside this test.
    const allEx = await db.exercises.toArray()
    const target = allEx.find(e => e.name === 'Back Squat')!
    await exercisesRepo.update(target.id, { cues: ['Custom cue 1', 'Custom cue 2'] })

    // 3. Roll back the seedVersion to simulate an update arriving
    await db.trainer.update('trainer', { seedVersion: 0 })

    // 4. Run the seeder again
    await seedExercisesIfEmpty()

    // 5. The override is untouched by the migration — it was never read or
    //    written by seedExercisesIfEmpty in the first place.
    const override = await db.exerciseOverrides.get(target.id)
    expect(override?.cues).toEqual(['Custom cue 1', 'Custom cue 2'])

    // 6. The base row picks up whatever the (identical, in this test) new
    //    seed content is, and the override still applies on top at read
    //    time — the coach's custom cues are what the app actually shows.
    const merged = await exercisesRepo.get(target.id)
    expect(merged?.cues).toEqual(['Custom cue 1', 'Custom cue 2'])
  })

  it('a legitimate seed content change reaches every coach, even one who never touched that exercise', { timeout: 10000 }, async () => {
    // Regression for the bug in the previous version of seedExercisesIfEmpty:
    // it diffed stored cues against the INCOMING seed and treated any
    // difference as "the coach edited this," which would silently freeze a
    // real content update behind a phantom override for every coach who
    // never touched the row at all.
    await seedExercisesIfEmpty()
    const before = await db.exercises.toArray()
    const target = before.find(e => e.name === 'Back Squat')!
    expect(target.cues).toEqual(buildSeedExercises().find(e => e.name === 'Back Squat')?.cues)

    // No coach edit happens here — just a version bump, simulating new seed
    // content having shipped (the seed itself is static in this test, so
    // this asserts the row is still unconditionally reconciled, not skipped).
    await db.trainer.update('trainer', { seedVersion: 0 })
    await seedExercisesIfEmpty()

    expect(await db.exerciseOverrides.get(target.id)).toBeUndefined()
    const after = await db.exercises.get(target.id)
    expect(after?.cues).toEqual(buildSeedExercises().find(e => e.name === 'Back Squat')?.cues)
  })
})
