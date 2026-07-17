import { describe, it, expect } from 'vitest'
import { repConsistency, barPathDeviation, type Rep, type Pt } from './pose'
import { nutritionPlan, carbCycle, dietBreakAdvice } from './nutrition'
import { presetsForGoal, METRIC_PRESETS } from './metricPresets'
import { classifyVideoUrl, exerciseVideos } from './videoEmbed'

const rep = (over: Partial<Rep>): Rep => ({ bottomAngle: 90, eccentricMs: 1000, concentricMs: 1000, depth: 100, ...over })

describe('rep consistency', () => {
  it('scores identical reps as maximally consistent', () => {
    const reps = [rep({}), rep({}), rep({})]
    const c = repConsistency(reps)
    expect(c.depth!.score).toBe(100)
    expect(c.tempo!.score).toBe(100)
  })

  it('scores wildly varying depth lower than consistent depth', () => {
    const steady = repConsistency([rep({ depth: 100 }), rep({ depth: 100 }), rep({ depth: 100 })])
    const erratic = repConsistency([rep({ depth: 100 }), rep({ depth: 60 }), rep({ depth: 40 })])
    expect(erratic.depth!.score).toBeLessThan(steady.depth!.score)
  })

  it('returns null with fewer than 2 reps', () => {
    expect(repConsistency([rep({})]).depth).toBeNull()
    expect(repConsistency([]).tempo).toBeNull()
  })
})

describe('bar path deviation', () => {
  it('a perfectly vertical path has zero drift', () => {
    const pts: Pt[] = [{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 }]
    expect(barPathDeviation(pts).driftPct).toBe(0)
  })

  it('detects forward drift and locates the worst point', () => {
    const pts: Pt[] = [{ x: 0.5, y: 0.2 }, { x: 0.6, y: 0.5 }, { x: 0.5, y: 0.8 }]
    const result = barPathDeviation(pts)
    expect(result.driftPct).toBeGreaterThan(0)
    expect(result.worstPoint).toEqual({ x: 0.6, y: 0.5 })
  })

  it('handles a single point without throwing', () => {
    expect(barPathDeviation([{ x: 0.5, y: 0.5 }]).driftPct).toBe(0)
  })
})

describe('carb cycling', () => {
  it('shifts carbs toward training days, keeps protein/fat flat, holds the weekly average', () => {
    const plan = nutritionPlan({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 'moderate', goal: 'maintain' })
    const cycled = carbCycle(plan, 4)
    expect(cycled.trainingDay.proteinG).toBe(plan.proteinG)
    expect(cycled.restDay.proteinG).toBe(plan.proteinG)
    expect(cycled.trainingDay.fatG).toBe(plan.fatG)
    expect(cycled.trainingDay.carbsG).toBeGreaterThan(cycled.restDay.carbsG)
    // weekly average should roughly equal the flat plan's daily calories
    const weeklyAvg = (cycled.trainingDay.calories * 4 + cycled.restDay.calories * 3) / 7
    expect(Math.abs(weeklyAvg - plan.calories)).toBeLessThan(30)
  })
})

describe('diet break advice', () => {
  it('does not recommend a break early in a cut', () => {
    expect(dietBreakAdvice(4).recommend).toBe(false)
  })
  it('recommends a break at 8+ weeks, more urgently at 12+', () => {
    expect(dietBreakAdvice(8).recommend).toBe(true)
    expect(dietBreakAdvice(14).recommend).toBe(true)
    expect(dietBreakAdvice(14).note).toContain('past due')
  })
})

describe('metric presets', () => {
  it('every preset item carries a source and applies to at least one goal', () => {
    for (const preset of METRIC_PRESETS) {
      expect(preset.appliesTo.length).toBeGreaterThan(0)
      for (const item of preset.items) {
        expect(item.source.length).toBeGreaterThan(8)
        expect(item.why.length).toBeGreaterThan(10)
      }
    }
  })
  it('filters presets by training goal', () => {
    const strength = presetsForGoal('strength')
    expect(strength.some(p => p.id === 'strength-testing')).toBe(true)
    expect(strength.some(p => p.id === 'endurance-testing')).toBe(false)
  })
  it('returns all presets when no goal given', () => {
    expect(presetsForGoal(undefined).length).toBe(METRIC_PRESETS.length)
  })
})

describe('video embed classification', () => {
  it('classifies youtube watch/short/embed URLs and strips to nocookie embed', () => {
    expect(classifyVideoUrl('https://www.youtube.com/watch?v=abc123').kind).toBe('youtube')
    expect(classifyVideoUrl('https://www.youtube.com/watch?v=abc123').src).toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(classifyVideoUrl('https://youtu.be/xyz789').src).toContain('xyz789')
    expect(classifyVideoUrl('https://www.youtube.com/shorts/short1').src).toContain('short1')
  })

  it('classifies vimeo URLs', () => {
    const r = classifyVideoUrl('https://vimeo.com/123456789')
    expect(r.kind).toBe('vimeo')
    expect(r.src).toBe('https://player.vimeo.com/video/123456789')
  })

  it('classifies direct video files and falls back to link for everything else', () => {
    expect(classifyVideoUrl('https://cdn.example.com/clip.mp4').kind).toBe('direct')
    expect(classifyVideoUrl('https://drive.google.com/file/d/xyz/view').kind).toBe('link')
    expect(classifyVideoUrl('not a url').kind).toBe('link')
  })

  it('merges legacy videoUrl with videoLinks without duplicating', () => {
    expect(exerciseVideos({ videoUrl: 'https://a.com/1', videoLinks: [{ label: 'Alt', url: 'https://a.com/2' }] }))
      .toEqual([{ label: 'Video', url: 'https://a.com/1' }, { label: 'Alt', url: 'https://a.com/2' }])
    expect(exerciseVideos({ videoUrl: 'https://a.com/1', videoLinks: [{ label: 'Video', url: 'https://a.com/1' }] }).length).toBe(1)
    expect(exerciseVideos({})).toEqual([])
  })
})
