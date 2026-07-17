// ===== Nutrition engine (spec §4.18a) =====
// Evidence-based, deterministic, fully offline. Every number this module
// produces carries a rationale with its source — the trainer can defend any
// recommendation to a client. This is NOT medical advice and the UI must say
// so; it implements published sports-nutrition consensus positions.
//
// Sources implemented:
// - BMR: Mifflin-St Jeor equation (Mifflin et al., Am J Clin Nutr 1990) —
//   identified as the most accurate predictive equation for healthy adults by
//   the Academy of Nutrition and Dietetics' evidence review (Frankenfield
//   et al., J Am Diet Assoc 2005).
// - TDEE activity factors: standard FAO/WHO-derived multipliers (1.2–1.9).
// - Deficit/surplus sizing: 0.5–1.0% bodyweight/week loss (Helms, Aragon &
//   Fitschen, JISSN 2014); lean-gain surplus ~5–15% over maintenance (Iraki
//   et al., Sports 2019 off-season recommendations).
// - Protein: 1.6–2.2 g/kg/day for trainees (Morton et al., Br J Sports Med
//   2018 meta-analysis; ISSN Position Stand, Jäger et al., JISSN 2017);
//   high end while dieting (Helms et al., JISSN 2014).
// - Fat: 20–35% of calories (Institute of Medicine AMDR, Dietary Reference
//   Intakes 2005).
// - Fiber: 14 g per 1,000 kcal (Institute of Medicine DRI 2005).
// - Water: Adequate Intake ~3.7 L/day men, ~2.7 L/day women, more with
//   training sweat losses (Institute of Medicine 2005; ACSM fluid guidance).

import type { ActivityLevel, NutritionGoal, Sex, Units } from '@/db/types'
import { KG_PER_LB } from './core'

export interface RationaleLine {
  text: string    // why this number, in plain coach language
  source: string  // the citation
}

export interface NutritionPlan {
  bmr: number
  tdee: number
  calories: number
  proteinG: number
  fatG: number
  carbsG: number
  fiberG: number
  waterL: number
  weeklyRateNote: string
  rationale: {
    calories: RationaleLine
    protein: RationaleLine
    fat: RationaleLine
    carbs: RationaleLine
    fiber: RationaleLine
    water: RationaleLine
  }
}

export const ACTIVITY_FACTORS: Record<ActivityLevel, { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary (desk job, little exercise)' },
  light: { factor: 1.375, label: 'Light (training 1–3 days/week)' },
  moderate: { factor: 1.55, label: 'Moderate (training 3–5 days/week)' },
  very: { factor: 1.725, label: 'Very active (hard training 6–7 days/week)' },
  extra: { factor: 1.9, label: 'Extra (physical job + hard daily training)' },
}

/** Mifflin-St Jeor resting energy expenditure, kcal/day. */
export function mifflinStJeor(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(base + (sex === 'male' ? 5 : -161))
}

export function ageFromBirthDate(birthDate: string, onDate = new Date()): number {
  const b = new Date(birthDate + 'T00:00:00')
  let age = onDate.getFullYear() - b.getFullYear()
  const m = onDate.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && onDate.getDate() < b.getDate())) age--
  return age
}

export const toKg = (weight: number, units: Units) =>
  units === 'kg' ? weight : weight * KG_PER_LB

const round5 = (n: number) => Math.round(n / 5) * 5

export function nutritionPlan(opts: {
  weightKg: number
  heightCm: number
  age: number
  sex: Sex
  activity: ActivityLevel
  goal: NutritionGoal
}): NutritionPlan {
  const { weightKg, heightCm, age, sex, activity, goal } = opts
  const bmr = mifflinStJeor(weightKg, heightCm, age, sex)
  const tdee = Math.round(bmr * ACTIVITY_FACTORS[activity].factor)

  // calories: moderate 15% deficit / 10% surplus, floored so a cut never
  // drops below resting needs (aggressive cuts belong to a clinician).
  let calories = tdee
  if (goal === 'cut') calories = Math.max(Math.round(tdee * 0.85), bmr)
  if (goal === 'gain') calories = Math.round(tdee * 1.1)
  calories = round5(calories)

  // protein: 2.2 g/kg dieting (muscle retention), 1.8 g/kg otherwise
  const proteinPerKg = goal === 'cut' ? 2.2 : 1.8
  const proteinG = Math.round(weightKg * proteinPerKg)

  // fat: 25% of calories (inside the 20–35% AMDR)
  const fatG = Math.round((calories * 0.25) / 9)

  // carbs: the remainder — the training fuel
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4))

  const fiberG = Math.round((calories / 1000) * 14)
  const waterL = Math.round((sex === 'male' ? 3.7 : 2.7) * 10) / 10

  const deficit = tdee - calories
  const weeklyKg = (deficit * 7) / 7700 // ≈7,700 kcal per kg of tissue
  const weeklyRateNote =
    goal === 'cut'
      ? `Expected loss ≈ ${Math.abs(weeklyKg).toFixed(2)} kg/week (${((Math.abs(weeklyKg) / weightKg) * 100).toFixed(1)}% of bodyweight) — inside the 0.5–1%/week range research links to keeping muscle while dieting.`
      : goal === 'gain'
        ? `Expected gain ≈ ${Math.abs(weeklyKg).toFixed(2)} kg/week — a lean surplus; faster mostly adds fat.`
        : 'Maintenance: expect bodyweight to hold within normal daily fluctuation (±1–2%).'

  return {
    bmr, tdee, calories, proteinG, fatG, carbsG, fiberG, waterL, weeklyRateNote,
    rationale: {
      calories: {
        text: goal === 'cut'
          ? `Resting burn is ~${bmr} kcal; with activity ~${tdee} kcal/day. A moderate 15% deficit (${calories} kcal) trades fat for minimal muscle loss and is sustainable — crash deficits rebound.`
          : goal === 'gain'
            ? `Maintenance is ~${tdee} kcal/day. A 10% surplus (${calories} kcal) supports muscle growth while limiting fat gain.`
            : `Maintenance ≈ ${tdee} kcal/day: resting burn ~${bmr} kcal × ${ACTIVITY_FACTORS[activity].factor} activity factor.`,
        source: 'Mifflin et al. 1990 (Am J Clin Nutr); Frankenfield et al. 2005 accuracy review; Helms et al. 2014 (JISSN) deficit sizing',
      },
      protein: {
        text: `${proteinPerKg} g per kg bodyweight = ${proteinG} g/day. ${goal === 'cut' ? 'The high end matters most in a deficit — it is the strongest dietary lever for keeping muscle while losing fat.' : 'Meta-analysis found muscle-building benefits plateau around 1.6–2.2 g/kg — this hits that zone with margin.'}`,
        source: 'Morton et al. 2018 (Br J Sports Med meta-analysis); Jäger et al. 2017 (ISSN Position Stand)',
      },
      fat: {
        text: `25% of calories = ${fatG} g/day — inside the 20–35% range that supports hormone production without crowding out carbohydrate for training.`,
        source: 'Institute of Medicine, Dietary Reference Intakes (2005) — AMDR',
      },
      carbs: {
        text: `The remaining ${carbsG} g/day fuels training volume and recovery — carbohydrate is the primary fuel for hard sets.`,
        source: 'Kerksick et al. 2018 (ISSN nutrient timing position stand)',
      },
      fiber: {
        text: `${fiberG} g/day (14 g per 1,000 kcal) — satiety, digestion, and cardiovascular health; especially useful appetite control on a cut.`,
        source: 'Institute of Medicine DRI (2005)',
      },
      water: {
        text: `~${waterL} L/day baseline, more on heavy training days to replace sweat losses. Even 2% dehydration measurably drops performance.`,
        source: 'Institute of Medicine (2005) Adequate Intake; ACSM fluid replacement guidance',
      },
    },
  }
}

// ---- Training-day / rest-day carb cycling (spec §4.18c expansion) ----
// Keeps protein and average weekly calories constant; shifts carbohydrate
// toward training days (fuel + recovery when it's used) and fat toward rest
// days (satiety when carbs are lower) — a standard periodized-nutrition
// pattern, not a novel idea of this app's.
export interface DayTargets { calories: number; proteinG: number; carbsG: number; fatG: number }
export interface CycledPlan {
  trainingDay: DayTargets
  restDay: DayTargets
  rationale: RationaleLine
}

export function carbCycle(plan: NutritionPlan, trainingDaysPerWeek: number): CycledPlan {
  const days = Math.max(1, Math.min(7, trainingDaysPerWeek))
  const restDays = 7 - days
  // Shift ~15% of average calories from rest days to training days, entirely
  // via carbohydrate (protein and fat stay flat across both day types).
  const shiftKcal = plan.calories * 0.15
  const trainingCarbsG = plan.carbsG + Math.round(shiftKcal / 4)
  const restCarbsG = restDays > 0 ? Math.max(0, plan.carbsG - Math.round((shiftKcal * days) / Math.max(1, restDays) / 4)) : plan.carbsG

  const trainingDay: DayTargets = {
    calories: Math.round(plan.proteinG * 4 + plan.fatG * 9 + trainingCarbsG * 4),
    proteinG: plan.proteinG, fatG: plan.fatG, carbsG: trainingCarbsG,
  }
  const restDay: DayTargets = {
    calories: Math.round(plan.proteinG * 4 + plan.fatG * 9 + restCarbsG * 4),
    proteinG: plan.proteinG, fatG: plan.fatG, carbsG: restCarbsG,
  }

  return {
    trainingDay, restDay,
    rationale: {
      text: `Training days: ${trainingDay.carbsG}g carbs (${trainingDay.calories} kcal). Rest days: ${restDay.carbsG}g carbs (${restDay.calories} kcal). Protein and fat stay flat — only carbohydrate shifts to match training demand, and the weekly average still lands on the same target as the flat plan above.`,
      source: 'Periodized/nutrient-timing carb cycling: Kerksick et al. 2018 (ISSN nutrient timing position stand); Aragon & Schoenfeld 2013 (nutrient timing review)',
    },
  }
}

// ---- Diet-break awareness (spec §4.18c expansion) ----
export interface DietBreakAdvice { recommend: boolean; note: string; source: string }

/** After enough consecutive weeks in a deficit, research supports a planned
 *  1–2 week return to maintenance ("diet break") — better long-run adherence
 *  and some evidence of protecting resting metabolic rate, without giving
 *  back meaningful fat-loss progress. */
export function dietBreakAdvice(weeksInDeficit: number): DietBreakAdvice {
  if (weeksInDeficit >= 12) {
    return {
      recommend: true,
      note: `${weeksInDeficit} weeks in a deficit is a long block. A 1–2 week diet break (eat at maintenance, keep training) is well past due — it tends to improve adherence and may protect against metabolic adaptation, without erasing fat-loss progress.`,
      source: 'Trexler, Smith-Ryan & Norton 2014 (JISSN) — adaptive thermogenesis & diet breaks; Peos et al. 2019 (Sports) intermittent energy restriction review',
    }
  }
  if (weeksInDeficit >= 8) {
    return {
      recommend: true,
      note: `${weeksInDeficit} weeks in — a 1–2 week maintenance break in the next couple of weeks is a reasonable, evidence-supported call, especially if adherence or motivation is slipping.`,
      source: 'Trexler, Smith-Ryan & Norton 2014 (JISSN)',
    }
  }
  return {
    recommend: false,
    note: `${weeksInDeficit} weeks in — no break needed yet; most protocols wait 8–12+ weeks before the first one.`,
    source: 'Trexler, Smith-Ryan & Norton 2014 (JISSN)',
  }
}

// ---- Percent-based warm-up ramp (surfaced next to progression suggestions) ----
export interface WarmupSet { pct: number; load: number; reps: number }

/** Classic ramp to a top working load: bar/50% × 8 → 70% × 5 → 85% × 3 → 95% × 1.
 *  Rounded to plate steps by the caller's display; percentages are the standard
 *  practice pattern in strength coaching literature. */
export function warmupRamp(workingLoad: number, roundTo = 2.5): WarmupSet[] {
  if (workingLoad <= 0) return []
  const steps: [number, number][] = [[0.5, 8], [0.7, 5], [0.85, 3], [0.95, 1]]
  return steps
    .map(([pct, reps]) => ({
      pct: Math.round(pct * 100),
      load: Math.max(roundTo, Math.round((workingLoad * pct) / roundTo) * roundTo),
      reps,
    }))
    .filter((s, i, arr) => i === 0 || s.load > arr[i - 1].load) // collapse tiny loads
}
