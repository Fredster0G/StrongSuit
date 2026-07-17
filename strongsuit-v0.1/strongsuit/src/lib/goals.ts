// ===== Goal engine (spec §4.21) =====
// Turns a client's primary training goal into concrete, evidence-based
// programming targets AND a nutrition adjustment — every parameter cited, in
// the same "no number without its source" discipline as the rest of the app.
//
// This is decision support for a qualified coach, not a prescription. Ranges
// reflect published consensus; the coach adapts to the individual.
//
// Core sources:
// - ACSM, Progression Models in Resistance Training for Healthy Adults
//   (Med Sci Sports Exerc, 2009) — rep/intensity/rest ranges by goal.
// - Schoenfeld, Ogborn & Krieger 2017 (J Sports Sci) — weekly volume ↔
//   hypertrophy dose-response (≥10 sets/muscle/week).
// - Schoenfeld et al. 2021 / Israetel "volume landmarks" — MEV/MAV per muscle.
// - Grgic et al. 2018 (Sports Med) — rest-interval effects; longer rest for
//   strength/hypertrophy, shorter for muscular endurance.
// - Rhea et al. 2003 (Med Sci Sports Exerc) — intensity dose-response for
//   strength (~85% 1RM trained lifters).
// - ACSM/AHA 2007 & Garber et al. 2011 (ACSM Position Stand) — aerobic
//   endurance dose (150+ min/wk moderate or 75+ vigorous).
// - Helms et al. 2014 (JISSN) — deficit sizing & protein while dieting.
// - Iraki et al. 2019 (Sports) — lean-gain surplus.
// - Morton et al. 2018 (Br J Sports Med) — protein 1.6–2.2 g/kg.

import type { NutritionGoal, TrainingGoal } from '@/db/types'

export interface Cited { text: string; source: string }

export interface GoalPlan {
  goal: TrainingGoal
  label: string
  summary: string
  // resistance-training targets
  repRange: [number, number]
  intensityPct: [number, number]   // % of 1RM
  restSeconds: [number, number]
  setsPerMusclePerWeek: [number, number]
  rir: [number, number]            // reps-in-reserve target range
  sessionsPerWeek: [number, number]
  tempo?: string
  // conditioning
  cardio: string
  // nutrition mapping
  nutritionGoal: NutritionGoal
  proteinPerKg: number
  calorieAdjustmentPct: number      // vs maintenance (+/-)
  // the "why", cited
  rationale: Cited[]
}

const GOALS: Record<TrainingGoal, GoalPlan> = {
  strength: {
    goal: 'strength', label: 'Maximal strength',
    summary: 'Heavy loads, low reps, long rests, submaximal effort most sets.',
    repRange: [3, 6], intensityPct: [80, 92], restSeconds: [180, 300],
    setsPerMusclePerWeek: [10, 20], rir: [1, 3], sessionsPerWeek: [3, 5], tempo: 'controlled',
    cardio: '1–2 easy aerobic sessions/week for recovery; keep it low-interference.',
    nutritionGoal: 'maintain', proteinPerKg: 1.8, calorieAdjustmentPct: 0,
    rationale: [
      { text: 'Loads ≥80% 1RM for 3–6 reps drive the largest strength gains in trained lifters.', source: 'Rhea et al. 2003 (Med Sci Sports Exerc); ACSM 2009 progression models' },
      { text: 'Rest 3–5 min between heavy sets to restore force output and total volume.', source: 'Grgic et al. 2018 (Sports Med) rest-interval review' },
      { text: 'Leaving 1–3 reps in reserve on most sets sustains quality without excess fatigue.', source: 'Helms et al. 2016 (Strength Cond J) RIR-based loading' },
    ],
  },
  hypertrophy: {
    goal: 'hypertrophy', label: 'Muscle growth',
    summary: 'Moderate loads, moderate reps, 10+ hard sets per muscle per week.',
    repRange: [6, 12], intensityPct: [65, 80], restSeconds: [90, 180],
    setsPerMusclePerWeek: [10, 20], rir: [0, 2], sessionsPerWeek: [3, 6], tempo: '2–3s eccentric',
    cardio: 'Optional; keep hard cardio separate from lifts to limit interference.',
    nutritionGoal: 'gain', proteinPerKg: 2.0, calorieAdjustmentPct: 8,
    rationale: [
      { text: 'Growth scales with weekly hard sets — aim for ≥10 per muscle, more as you advance.', source: 'Schoenfeld, Ogborn & Krieger 2017 (J Sports Sci) volume meta-analysis' },
      { text: '6–12 reps at 65–80% 1RM taken close to failure is the classic hypertrophy zone.', source: 'ACSM 2009 progression models; Schoenfeld 2021' },
      { text: 'A modest 5–10% surplus supplies material for muscle while limiting fat gain.', source: 'Iraki et al. 2019 (Sports); Morton et al. 2018 protein 1.6–2.2 g/kg' },
    ],
  },
  power: {
    goal: 'power', label: 'Power & explosiveness',
    summary: 'Fast intent, low reps, full rest; light-to-moderate loads moved maximally fast.',
    repRange: [1, 5], intensityPct: [30, 85], restSeconds: [120, 300],
    setsPerMusclePerWeek: [8, 16], rir: [2, 4], sessionsPerWeek: [3, 4], tempo: 'maximal velocity',
    cardio: 'Short sprints/plyometrics; avoid heavy fatigue before power work.',
    nutritionGoal: 'maintain', proteinPerKg: 1.8, calorieAdjustmentPct: 0,
    rationale: [
      { text: 'Power improves most when reps are moved with maximal intended velocity and rests are full.', source: 'ACSM 2009 progression models; Cormie et al. 2011 (Sports Med)' },
      { text: 'Mixed loads (light ballistic + heavier strength) train the whole force–velocity curve.', source: 'Haff & Nimphius 2012 (Strength Cond J)' },
    ],
  },
  endurance: {
    goal: 'endurance', label: 'Muscular & aerobic endurance',
    summary: 'Higher reps, short rests, plus 150+ min/week of aerobic work.',
    repRange: [12, 20], intensityPct: [50, 67], restSeconds: [30, 60],
    setsPerMusclePerWeek: [8, 16], rir: [1, 3], sessionsPerWeek: [3, 5],
    cardio: '150+ min/week moderate OR 75+ min vigorous aerobic, building gradually.',
    nutritionGoal: 'maintain', proteinPerKg: 1.6, calorieAdjustmentPct: 0,
    rationale: [
      { text: '≥150 min/week moderate (or 75 vigorous) aerobic activity is the established dose for cardiorespiratory fitness and health.', source: 'Garber et al. 2011 (ACSM Position Stand); ACSM/AHA 2007' },
      { text: 'Higher reps (12–20) with short rests (≤60s) best build local muscular endurance.', source: 'ACSM 2009 progression models; Grgic et al. 2018 rest review' },
    ],
  },
  'fat-loss': {
    goal: 'fat-loss', label: 'Fat loss',
    summary: 'Keep training heavy enough to hold muscle; the deficit drives fat loss.',
    repRange: [6, 12], intensityPct: [67, 80], restSeconds: [60, 120],
    setsPerMusclePerWeek: [10, 16], rir: [1, 2], sessionsPerWeek: [3, 5],
    cardio: 'Add aerobic/steps to widen the deficit; 150–300 min/week is a practical band.',
    nutritionGoal: 'cut', proteinPerKg: 2.2, calorieAdjustmentPct: -18,
    rationale: [
      { text: 'Resistance training + high protein preserves lean mass during a deficit — the goal is to lose fat, not muscle.', source: 'Helms et al. 2014 (JISSN); Longland et al. 2016 (Am J Clin Nutr)' },
      { text: 'A moderate 15–20% deficit is sustainable and muscle-sparing; aggressive cuts rebound.', source: 'Helms et al. 2014 (JISSN)' },
      { text: 'Protein toward 2.2 g/kg is the strongest dietary lever for keeping muscle while dieting.', source: 'Morton et al. 2018 (Br J Sports Med); Helms et al. 2014' },
    ],
  },
  'lean-gain': {
    goal: 'lean-gain', label: 'Lean muscle gain',
    summary: 'Hypertrophy training on a small surplus to add muscle with minimal fat.',
    repRange: [6, 12], intensityPct: [67, 80], restSeconds: [90, 180],
    setsPerMusclePerWeek: [12, 20], rir: [0, 2], sessionsPerWeek: [4, 6], tempo: '2–3s eccentric',
    cardio: 'Light aerobic for health; avoid large deficits that blunt growth.',
    nutritionGoal: 'gain', proteinPerKg: 2.0, calorieAdjustmentPct: 10,
    rationale: [
      { text: 'A small (~10%) surplus maximizes the muscle-to-fat gain ratio for trainees.', source: 'Iraki et al. 2019 (Sports) off-season recommendations' },
      { text: 'Progressive volume (12–20 sets/muscle/week) with loads to near-failure drives growth.', source: 'Schoenfeld et al. 2017/2021 volume research' },
    ],
  },
  'general-fitness': {
    goal: 'general-fitness', label: 'General fitness & health',
    summary: 'Balanced strength + cardio to the public-health minimums, sustainably.',
    repRange: [8, 15], intensityPct: [60, 80], restSeconds: [60, 120],
    setsPerMusclePerWeek: [8, 14], rir: [1, 3], sessionsPerWeek: [2, 4],
    cardio: 'Meet 150 min/week moderate aerobic + 2 resistance sessions (public-health floor).',
    nutritionGoal: 'maintain', proteinPerKg: 1.6, calorieAdjustmentPct: 0,
    rationale: [
      { text: 'Adults benefit from ≥150 min/week aerobic activity plus muscle-strengthening on 2+ days.', source: 'Physical Activity Guidelines for Americans, 2nd ed. (2018); Garber et al. 2011' },
      { text: '8–15 reps at moderate loads builds strength and endurance without heavy joint stress.', source: 'ACSM 2009 progression models' },
    ],
  },
}

export function goalPlan(goal: TrainingGoal): GoalPlan {
  return GOALS[goal]
}

export const ALL_GOALS: TrainingGoal[] = [
  'strength', 'hypertrophy', 'power', 'endurance', 'fat-loss', 'lean-gain', 'general-fitness',
]

export const GOAL_LABELS: Record<TrainingGoal, string> =
  Object.fromEntries(ALL_GOALS.map(g => [g, GOALS[g].label])) as Record<TrainingGoal, string>
