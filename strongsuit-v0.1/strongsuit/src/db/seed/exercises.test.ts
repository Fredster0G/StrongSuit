import { describe, it, expect } from 'vitest'
import { buildSeedExercises } from './exercises'

describe('Exercise Seed Library', () => {
  it('contains no duplicate exercises by normalized name + equipment', () => {
    const exercises = buildSeedExercises()
    const seen = new Set<string>()
    const duplicates: string[] = []

    for (const ex of exercises) {
      const normName = ex.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const key = `${normName}|${ex.equipment.slice().sort().join(',')}`
      
      if (seen.has(key)) {
        duplicates.push(ex.name)
      }
      seen.add(key)
    }

    expect(duplicates, 'Expected no duplicates').toEqual([])
  })

  it('all exercises conform to required schema', () => {
    const exercises = buildSeedExercises()
    for (const ex of exercises) {
      expect(typeof ex.name).toBe('string')
      expect(ex.name.length).toBeGreaterThan(0)
      expect(ex.category).toBeTruthy()
      expect(Array.isArray(ex.primaryMuscles)).toBe(true)
      expect(Array.isArray(ex.equipment)).toBe(true)
      expect(ex.isCustom).toBe(false)
      expect(ex.defaultTracking).toBeTruthy()
    }
  })
})
