import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/schema'
import { modelBlobsRepo } from '@/db/repo'
import { resolvePoseModel, BUNDLED_LITE_PATH } from './modelSelection'

beforeEach(async () => {
  for (const table of db.tables) await table.clear()
})

describe('resolvePoseModel', () => {
  it('falls back to the bundled lite model when nothing is cached', async () => {
    const resolved = await resolvePoseModel()
    expect(resolved.modelId).toBe('pose-lite')
    expect(resolved.assetPath).toBe(BUNDLED_LITE_PATH)
    expect(resolved.objectUrl).toBeUndefined()
  })

  it('prefers a cached pose-full over the bundled default', async () => {
    await modelBlobsRepo.put('pose-full', new Blob(['x']))
    const resolved = await resolvePoseModel()
    expect(resolved.modelId).toBe('pose-full')
    expect(resolved.objectUrl).toBeDefined()
    expect(resolved.assetPath).toBe(resolved.objectUrl)
  })

  it('prefers pose-heavy over pose-full when both are cached — the upgrade ladder, not a pick-one choice', async () => {
    await modelBlobsRepo.put('pose-full', new Blob(['x']))
    await modelBlobsRepo.put('pose-heavy', new Blob(['y']))
    const resolved = await resolvePoseModel()
    expect(resolved.modelId).toBe('pose-heavy')
  })

  it('ignores unrelated cached models entirely', async () => {
    await modelBlobsRepo.put('bge-small-en-v1.5', new Blob(['z']))
    const resolved = await resolvePoseModel()
    expect(resolved.modelId).toBe('pose-lite')
  })
})
