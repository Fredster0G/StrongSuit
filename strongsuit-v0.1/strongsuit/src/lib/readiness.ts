// ===== Readiness score (spec §4.18b) =====
// A 0–100 daily-readiness read from the client's latest check-in, with the
// same rule as the progression engine: no number without its reasoning.
// Weighting follows the wellness-questionnaire literature (Hooper & Mackinnon
// 1995 training-monitoring index; McLean et al. 2010 IJSPP): subjective
// sleep/fatigue/mood scales track training readiness surprisingly well and
// are the cheapest valid monitoring tool available — perfect for offline.

import type { CheckIn } from '@/db/types'

export interface Readiness {
  score: number                  // 0–100
  band: 'go' | 'moderate' | 'easy'
  drivers: string[]              // what pushed the score, plain language
  source: string
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Score one check-in. Missing fields simply drop out of the weighting. */
export function readinessFromCheckIn(c: CheckIn): Readiness | null {
  const parts: { w: number; v: number; label: string; low: string; high: string }[] = []

  if (c.sleepHours != null) {
    // 7–9 h = full credit (National Sleep Foundation range), linear falloff
    const v = clamp01(1 - Math.max(0, 7 - c.sleepHours) / 3.5 - Math.max(0, c.sleepHours - 9.5) / 4)
    parts.push({ w: 0.35, v, label: 'sleep', low: `only ${c.sleepHours}h sleep`, high: `${c.sleepHours}h sleep` })
  }
  if (c.energy != null) {
    // 1–10 scale (matches the check-in form)
    const v = clamp01((c.energy - 1) / 9)
    parts.push({ w: 0.3, v, label: 'energy', low: 'low energy', high: 'good energy' })
  }
  if (c.mood != null) {
    const v = clamp01((c.mood - 1) / 9)
    parts.push({ w: 0.2, v, label: 'mood', low: 'low mood', high: 'good mood' })
  }
  if (c.adherence != null) {
    const v = clamp01(c.adherence / 100)
    parts.push({ w: 0.15, v, label: 'adherence', low: 'adherence slipping', high: 'on plan' })
  }
  if (!parts.length) return null

  const totalW = parts.reduce((a, p) => a + p.w, 0)
  const score = Math.round((parts.reduce((a, p) => a + p.w * p.v, 0) / totalW) * 100)

  const drivers = parts
    .sort((a, b) => a.v - b.v)
    .slice(0, 2)
    .map(p => (p.v < 0.55 ? p.low : p.high))

  return {
    score,
    band: score >= 70 ? 'go' : score >= 45 ? 'moderate' : 'easy',
    drivers,
    source: 'Weighted wellness-questionnaire model (Hooper & Mackinnon 1995; McLean et al. 2010)',
  }
}

export const READINESS_COPY: Record<Readiness['band'], string> = {
  go: 'Green — train as planned. Good day to push top sets.',
  moderate: 'Amber — keep the plan, cap intensity. Leave a rep in the tank.',
  easy: 'Red — reduce load ~10–20% or switch to technique work. The gains are in recovering.',
}
