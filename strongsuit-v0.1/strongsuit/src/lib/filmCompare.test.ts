import { describe, it, expect } from 'vitest'
import { compareReps, compareAngles } from './filmCompare'
import type { Rep, AngleSample } from './pose'

function rep(depth: number, eccentricMs: number, concentricMs: number): Rep {
  return { bottomAngle: 90, eccentricMs, concentricMs, depth }
}

describe('compareReps', () => {
  it('matches reps by ordinal and reports depth/tempo deltas', () => {
    const repsA: Rep[] = [rep(100, 1000, 1000), rep(90, 1000, 1000)]
    const repsB: Rep[] = [rep(80, 1000, 1500), rep(95, 1000, 1000)]
    const out = compareReps(repsA, repsB)
    expect(out).toHaveLength(2)
    expect(out[0].depthDeltaPts).toBe(-20) // B went 20pts shallower than A
    expect(out[0].tempoDeltaPct).toBe(25)  // B's rep took 25% longer (2.5s vs 2s)
    expect(out[1].depthDeltaPts).toBe(5)
  })

  it('only compares as many reps as the shorter side has', () => {
    const repsA: Rep[] = [rep(100, 1000, 1000), rep(100, 1000, 1000), rep(100, 1000, 1000)]
    const repsB: Rep[] = [rep(100, 1000, 1000)]
    expect(compareReps(repsA, repsB)).toHaveLength(1)
  })

  it('empty on either side yields no comparisons', () => {
    expect(compareReps([], [rep(100, 1000, 1000)])).toEqual([])
    expect(compareReps([rep(100, 1000, 1000)], [])).toEqual([])
  })
})

describe('compareAngles', () => {
  it('reports zero deviation when both clips run identical angles in sync', () => {
    const samples: AngleSample[] = Array.from({ length: 20 }, (_, i) => ({
      tMs: i * 50,
      angles: { 'Knee (L)': 90 + i, 'Knee (R)': 90 },
    }))
    const out = compareAngles(samples, samples, 0)
    const knee = out.find(d => d.joint === 'Knee (L)')!
    expect(knee.avgDeltaDeg).toBe(0)
    expect(knee.samples).toBeGreaterThan(0)
  })

  it('detects a consistent angle gap between the two clips', () => {
    const samplesA: AngleSample[] = Array.from({ length: 20 }, (_, i) => ({
      tMs: i * 50,
      angles: { 'Knee (L)': 90 },
    }))
    const samplesB: AngleSample[] = Array.from({ length: 20 }, (_, i) => ({
      tMs: i * 50,
      angles: { 'Knee (L)': 105 }, // consistently 15° more open
    }))
    const out = compareAngles(samplesA, samplesB, 0)
    const knee = out.find(d => d.joint === 'Knee (L)')!
    expect(knee.avgDeltaDeg).toBe(15)
    expect(knee.maxDeltaDeg).toBe(15)
  })

  it('applies the clip-to-clip time offset before matching samples', () => {
    // B's clock runs 200ms ahead of A's — without applying the offset,
    // naive same-index matching would compare unrelated moments.
    const samplesA: AngleSample[] = Array.from({ length: 10 }, (_, i) => ({
      tMs: i * 100,
      angles: { 'Elbow (L)': 90 },
    }))
    const samplesB: AngleSample[] = Array.from({ length: 10 }, (_, i) => ({
      tMs: i * 100 + 200,
      angles: { 'Elbow (L)': 90 },
    }))
    const out = compareAngles(samplesA, samplesB, 200)
    const elbow = out.find(d => d.joint === 'Elbow (L)')!
    expect(elbow.avgDeltaDeg).toBe(0)
  })

  it('skips pairs outside the match tolerance instead of comparing wrong moments', () => {
    const samplesA: AngleSample[] = [{ tMs: 0, angles: { 'Hip (L)': 90 } }]
    const samplesB: AngleSample[] = [{ tMs: 5000, angles: { 'Hip (L)': 40 } }] // way out of range
    expect(compareAngles(samplesA, samplesB, 0)).toEqual([])
  })
})
