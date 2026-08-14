// ===== Energy Availability & REDs screening =====
// (docs/plans/03-SCIENCE-ENGINES.md §2.2)
//
// This is the module that turns the nutrition tab from a calculator into a
// safety instrument. Everything else in `lib/nutrition.ts` answers "what
// should they eat"; this answers "is what you've prescribed actually safe".
//
//   Energy Availability = (intake − exercise energy expenditure) / fat-free mass
//
// It is the energy left to run the body's physiology once training has taken
// its cut. Drive it low enough for long enough and endocrine, bone, immune and
// menstrual function suffer — regardless of whether bodyweight looks fine,
// which is exactly why scale weight alone misses it.
//
// SOURCES
//  · Loucks & Thuma 2003; Loucks 2011 — the original controlled work
//    establishing ~30 kcal/kg FFM/day as the threshold below which LH
//    pulsatility and metabolic markers are disrupted.
//  · De Souza et al. 2014 — Female Athlete Triad Coalition consensus.
//  · Mountjoy et al. 2023 (Br J Sports Med) — IOC consensus on Relative
//    Energy Deficiency in Sport (REDs), the current authority. Note the 2023
//    statement explicitly reframes this as a spectrum with graded severity
//    rather than a single cliff-edge.
//
// ⚠️ HONESTY RULES — this module screens, it does not diagnose.
//  1. EA is only as good as its inputs, and BOTH inputs are hard to measure:
//     self-reported intake is routinely under-reported by 10–30%, and exercise
//     energy expenditure is an estimate. We therefore report a BAND, never a
//     single confident number, and say what would tighten it.
//  2. The 30 kcal/kg threshold derives largely from studies in young
//     exercising women. Mountjoy 2023 is explicit that male and broader
//     population thresholds are less well established. We flag lower
//     confidence rather than pretending the number transfers cleanly.
//  3. Nothing here is a diagnosis. Low EA is a REFERRAL TRIGGER — to a sports
//     dietitian or physician — never something the app resolves itself.

import type { Sex, Units } from '@/db/types'
import { toKg } from './nutrition'

/** kcal per kg of fat-free mass per day. */
export type EAValue = number

export const EA_OPTIMAL = 45
export const EA_LOW_THRESHOLD = 30

export type EABand = 'optimal' | 'reduced' | 'low' | 'unknown'

export interface EAAssessment {
  /** Point estimate, kcal/kg FFM/day. Null when inputs are insufficient. */
  ea: EAValue | null
  /** Plausible range given measurement error — the honest read (rule 1). */
  range: { low: number; high: number } | null
  band: EABand
  ffmKg: number | null
  /** How much we trust this, and why. */
  confidence: 'good' | 'moderate' | 'low'
  confidenceReason: string
  /** Plain-language read for the coach. */
  summary: string
  /** True when this should prompt a referral rather than a programming tweak. */
  referral: boolean
  source: string
}

/**
 * Fat-free mass. Measured body-fat % is far better than any estimate — if it
 * isn't known we return null rather than guessing, because a wrong FFM
 * silently corrupts every EA number downstream.
 */
export function fatFreeMass(weight: number, units: Units, bodyFatPct?: number): number | null {
  if (bodyFatPct == null || bodyFatPct <= 0 || bodyFatPct >= 60) return null
  const kg = toKg(weight, units)
  return Math.round(kg * (1 - bodyFatPct / 100) * 10) / 10
}

/**
 * Typical self-report error on dietary intake. Applied as a band, not a
 * correction — we don't know the direction for any individual, only that the
 * literature shows systematic under-reporting at the population level.
 */
const INTAKE_UNCERTAINTY = 0.15

export interface EAInputs {
  /** kcal/day actually eaten (logged or estimated). */
  intakeKcal: number
  /** kcal/day expended in *purposeful exercise* — not total daily activity.
   *  Using TDEE here is the single most common way to get EA wrong. */
  exerciseKcal: number
  weight: number
  units: Units
  bodyFatPct?: number
  sex?: Sex
}

export function assessEnergyAvailability(i: EAInputs): EAAssessment {
  const source = 'Loucks 2011; De Souza et al. 2014; Mountjoy et al. 2023 (IOC REDs consensus)'
  const ffmKg = fatFreeMass(i.weight, i.units, i.bodyFatPct)

  if (ffmKg == null) {
    return {
      ea: null, range: null, band: 'unknown', ffmKg: null,
      confidence: 'low',
      confidenceReason: 'Energy availability is per kilogram of fat-free mass, so it needs a body-fat measurement.',
      summary: 'Add a body-fat percentage to screen energy availability. Without it this can’t be calculated — and an estimate would be worse than nothing.',
      referral: false, source,
    }
  }
  if (!(i.intakeKcal > 0)) {
    return {
      ea: null, range: null, band: 'unknown', ffmKg,
      confidence: 'low',
      confidenceReason: 'No intake data.',
      summary: 'Log a few days of intake to screen energy availability.',
      referral: false, source,
    }
  }

  const ea = (i.intakeKcal - Math.max(0, i.exerciseKcal)) / ffmKg
  const rounded = Math.round(ea)

  // Band the intake uncertainty through to the result rather than hiding it.
  const low = Math.round((i.intakeKcal * (1 - INTAKE_UNCERTAINTY) - i.exerciseKcal) / ffmKg)
  const high = Math.round((i.intakeKcal * (1 + INTAKE_UNCERTAINTY) - i.exerciseKcal) / ffmKg)

  const band: EABand = rounded >= EA_OPTIMAL ? 'optimal' : rounded >= EA_LOW_THRESHOLD ? 'reduced' : 'low'

  // Rule 2: the threshold's evidence base is strongest in exercising women.
  const female = i.sex === 'female'
  const confidence: EAAssessment['confidence'] = i.bodyFatPct == null ? 'low' : female ? 'good' : 'moderate'
  const confidenceReason = female
    ? 'Thresholds are best established in exercising women (Loucks 2011; De Souza 2014).'
    : 'Thresholds derive largely from studies in exercising women; Mountjoy 2023 notes male thresholds are less well established, so treat this as directional.'

  return {
    ea: rounded,
    range: { low, high },
    band,
    ffmKg,
    confidence,
    confidenceReason,
    summary: summarise(band, rounded, low, high),
    // Low EA is a referral trigger, not a programming tweak (rule 3).
    referral: band === 'low',
    source,
  }
}

function summarise(band: EABand, ea: number, low: number, high: number): string {
  const spread = `Best estimate ${ea} kcal/kg FFM (plausibly ${low}–${high}, given how imprecise intake reporting is).`
  switch (band) {
    case 'optimal':
      return `${spread} At or above ${EA_OPTIMAL} — enough energy for training and normal physiological function.`
    case 'reduced':
      return `${spread} Between ${EA_LOW_THRESHOLD} and ${EA_OPTIMAL} — acceptable for a deliberate, time-limited fat-loss phase, but not somewhere to live.`
    case 'low':
      return `${spread} Below ${EA_LOW_THRESHOLD}, the threshold associated with disrupted hormonal, bone and immune function. This needs a conversation, not a programming tweak.`
    default:
      return spread
  }
}

// ---------------------------------------------------------------- screening

/**
 * Would a prescribed calorie target push this client into low EA?
 *
 * THIS IS THE POINT OF THE MODULE. A coach sets an aggressive deficit with
 * good intentions; this catches it before the client lives there for twelve
 * weeks. Returns null when there's nothing to warn about.
 */
export function screenPrescription(opts: {
  targetKcal: number
  exerciseKcal: number
  weight: number
  units: Units
  bodyFatPct?: number
  sex?: Sex
}): { severity: 'warn' | 'stop'; message: string; source: string } | null {
  const a = assessEnergyAvailability({ ...opts, intakeKcal: opts.targetKcal })
  if (a.ea == null) return null

  const source = 'Mountjoy et al. 2023 (IOC REDs consensus); De Souza et al. 2014'

  if (a.band === 'low') {
    return {
      severity: 'stop',
      message:
        `This target puts energy availability at about ${a.ea} kcal/kg fat-free mass — below the ${EA_LOW_THRESHOLD} threshold ` +
        `associated with hormonal, bone and immune disruption. Raise calories, reduce training energy cost, or refer to a sports ` +
        `dietitian before running this.`,
      source,
    }
  }
  // Catch the near-miss too: measurement error means "just above" can be below.
  if (a.range && a.range.low < EA_LOW_THRESHOLD) {
    return {
      severity: 'warn',
      message:
        `This target lands close to the low-energy-availability threshold (estimate ${a.ea}, but plausibly as low as ${a.range.low} ` +
        `once intake-reporting error is allowed for). Worth tightening the intake data before committing to it.`,
      source,
    }
  }
  return null
}

// ------------------------------------------------------- REDs risk indicators

export interface RedsFlags {
  /** 3+ missed or irregular cycles. A primary REDs indicator. */
  menstrualDisruption?: boolean
  /** Bone stress injury history. */
  boneStressInjury?: boolean
  /** Recurrent illness / slow recovery. */
  frequentIllness?: boolean
  /** Unexplained performance decline despite training. */
  performanceDecline?: boolean
  /** Disordered-eating screening flag. */
  disorderedEatingConcern?: boolean
}

export interface RedsScreen {
  /** How many independent indicators are present. */
  indicators: number
  level: 'none' | 'monitor' | 'refer'
  message: string
  source: string
}

/**
 * Combine low EA with the clinical indicators from the REDs consensus.
 *
 * Deliberately conservative: any disordered-eating concern refers immediately
 * regardless of the arithmetic, because that is not a coaching problem and
 * the cost of under-reacting is far higher than the cost of an unnecessary
 * referral.
 */
export function screenReds(ea: EAAssessment, flags: RedsFlags): RedsScreen {
  const source = 'Mountjoy et al. 2023 (IOC consensus on REDs); De Souza et al. 2014'
  const present = Object.values(flags).filter(Boolean).length

  if (flags.disorderedEatingConcern) {
    return {
      indicators: present, level: 'refer',
      message:
        'A disordered-eating concern has been flagged. This sits outside coaching scope — refer to a physician or a sports dietitian ' +
        'with eating-disorder experience, and avoid prescribing a deficit in the meantime.',
      source,
    }
  }

  const lowEA = ea.band === 'low'

  if (lowEA && present >= 1) {
    return {
      indicators: present, level: 'refer',
      message:
        `Low energy availability alongside ${present} other REDs indicator${present === 1 ? '' : 's'}. ` +
        'This pattern warrants referral to a sports physician or dietitian rather than a training adjustment.',
      source,
    }
  }
  if (lowEA || present >= 2) {
    return {
      indicators: present, level: 'monitor',
      message: lowEA
        ? 'Energy availability is below threshold. Raise intake or reduce training energy cost, and re-screen in two weeks.'
        : `${present} REDs indicators present without confirmed low energy availability. Worth tightening intake tracking and re-screening.`,
      source,
    }
  }
  return {
    indicators: present, level: 'none',
    message: 'No energy-availability or REDs indicators flagged.',
    source,
  }
}
