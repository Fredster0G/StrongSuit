// ===== Training-load analytics (spec §4.6 extended) =====
// Turns logged work into the load-management metrics a professional S&C staff
// watches — so a coach can see over/undertraining and injury risk, not just
// tonnage. Pure + unit-tested.
//
// Sources:
// - Gabbett 2016 (Br J Sports Med) — acute:chronic workload ratio (ACWR);
//   a "sweet spot" ~0.8–1.3 and sharply rising injury risk above ~1.5.
// - Hulin et al. 2014/2016 — ACWR and injury in athletes.
// - Foster 1998 (Med Sci Sports Exerc) — session-RPE load, training monotony
//   and strain.
// - Relative-strength standards: widely published bodyweight-ratio bands
//   (e.g., ExRx.net strength standards; Lon Kilgore) for the main barbell lifts.

export interface DayLoad { date: string; load: number } // yyyy-MM-dd, arbitrary load unit

/** session-RPE load (Foster): RPE (0–10) × duration in minutes. */
export const sessionLoad = (rpe: number, minutes: number) => Math.max(0, rpe) * Math.max(0, minutes)

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/** Sum loads within [fromDate, toDate] inclusive. */
function sumWindow(loads: DayLoad[], fromISO: string, toISO: string): number {
  return loads.reduce((a, l) => (l.date >= fromISO && l.date <= toISO ? a + l.load : a), 0)
}

export type LoadZone = 'detraining' | 'sweet-spot' | 'caution' | 'danger'

export interface ACWR {
  acute: number      // last 7 days
  chronic: number    // rolling 28-day weekly average
  ratio: number
  zone: LoadZone
  note: string
}

/**
 * Acute:chronic workload ratio. Acute = last 7 days of load; chronic = average
 * weekly load over the last 28 days (28-day total ÷ 4). Ratio = acute/chronic.
 */
export function acwr(loads: DayLoad[], today: string): ACWR {
  const end = new Date(today + 'T00:00:00')
  const acuteStart = new Date(end); acuteStart.setDate(end.getDate() - 6)
  const chronicStart = new Date(end); chronicStart.setDate(end.getDate() - 27)

  const acute = sumWindow(loads, dayKey(acuteStart), today)
  const chronic28 = sumWindow(loads, dayKey(chronicStart), today)
  const chronic = chronic28 / 4
  const ratio = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0

  let zone: LoadZone
  let note: string
  if (chronic === 0) {
    zone = 'detraining'; note = 'Not enough history yet — log a few weeks to read load safely.'
  } else if (ratio < 0.8) {
    zone = 'detraining'; note = `Load is ${ratio} of the 4-week norm — undertraining/detraining range. Fine when tapering or returning.`
  } else if (ratio <= 1.3) {
    zone = 'sweet-spot'; note = `Ratio ${ratio} sits in the 0.8–1.3 "sweet spot" linked to the lowest injury risk.`
  } else if (ratio <= 1.5) {
    zone = 'caution'; note = `Ratio ${ratio} — load is climbing faster than the body has adapted to. Ease the ramp.`
  } else {
    zone = 'danger'; note = `Ratio ${ratio} is above 1.5, the range associated with markedly higher injury risk. Back off this week.`
  }
  return { acute: Math.round(acute), chronic: Math.round(chronic), ratio, zone, note }
}

export interface Monotony { monotony: number; strain: number; note: string }

/** Foster training monotony (mean/SD of daily load over 7d) and strain (load×monotony). */
export function monotonyStrain(loads: DayLoad[], today: string): Monotony {
  const end = new Date(today + 'T00:00:00')
  const days: number[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end); d.setDate(end.getDate() - i)
    const k = dayKey(d)
    days.push(loads.filter(l => l.date === k).reduce((a, l) => a + l.load, 0))
  }
  const mean = days.reduce((a, b) => a + b, 0) / 7
  const variance = days.reduce((a, b) => a + (b - mean) ** 2, 0) / 7
  const sd = Math.sqrt(variance)
  // Zero variance with real load = a week with no hard/easy variation at all,
  // which Foster's model treats as maximally monotonous (division by ~0). Report
  // it at the top of the practical range rather than a misleading 0.
  const monotony = sd > 0 ? Math.round((mean / sd) * 100) / 100 : (mean > 0 ? 3 : 0)
  const weekLoad = days.reduce((a, b) => a + b, 0)
  const strain = Math.round(weekLoad * monotony)
  const note = monotony >= 2
    ? 'High monotony — every day looks the same. Vary hard and easy days to lower strain and illness risk.'
    : 'Healthy day-to-day variation between hard and easy sessions.'
  return { monotony, strain, note }
}

// ---- relative strength standards ----
export type StrengthLift = 'squat' | 'bench' | 'deadlift' | 'ohp'
export type StrengthLevel = 'untrained' | 'novice' | 'intermediate' | 'advanced' | 'elite'

// Multiples of bodyweight for a 1RM, by lift and sex. Rounded consensus of
// published strength-standard tables; used to place a lifter, not to certify.
const STANDARDS: Record<StrengthLift, Record<'male' | 'female', number[]>> = {
  //            [novice, intermediate, advanced, elite]  (untrained = below novice)
  squat:    { male: [1.0, 1.5, 2.0, 2.5], female: [0.7, 1.1, 1.5, 2.0] },
  bench:    { male: [0.75, 1.1, 1.5, 2.0], female: [0.4, 0.6, 0.9, 1.2] },
  deadlift: { male: [1.25, 1.75, 2.25, 3.0], female: [0.9, 1.3, 1.8, 2.4] },
  ohp:      { male: [0.55, 0.8, 1.1, 1.4], female: [0.3, 0.45, 0.65, 0.9] },
}

export interface StrengthStanding {
  ratio: number
  level: StrengthLevel
  source: string
}

/** Place a lift's 1RM (in same unit as bodyweight) into a strength level. */
export function strengthStanding(lift: StrengthLift, oneRepMax: number, bodyweight: number, sex: 'male' | 'female'): StrengthStanding | null {
  if (oneRepMax <= 0 || bodyweight <= 0) return null
  const ratio = Math.round((oneRepMax / bodyweight) * 100) / 100
  const t = STANDARDS[lift][sex]
  let level: StrengthLevel = 'untrained'
  if (ratio >= t[3]) level = 'elite'
  else if (ratio >= t[2]) level = 'advanced'
  else if (ratio >= t[1]) level = 'intermediate'
  else if (ratio >= t[0]) level = 'novice'
  return { ratio, level, source: 'Published relative-strength standards (ExRx.net; Kilgore) — bodyweight-ratio bands' }
}
