// ===== Parse a transcribed voice log into a structured set =====
//
// Whisper hands back plain text — "185 for 8", "8 reps at 185 pounds", "12
// at RPE 8" — and this turns that into the same {load, reps, rpe} shape
// SessionLoggerPage's `updateSet` already writes to `LoggedSet.actualLoad`/
// `actualReps`/`rpe`. Deliberately never applied silently: the caller shows
// what was heard and what was parsed from it before touching a set, the same
// "confirm, don't guess" posture as every other AI feature in this app.
//
// Scope, stated plainly: this parses DIGIT-form numbers ("185", "8"), not
// spelled-out number words ("one hundred eighty five") — Whisper's own
// normalizer renders spoken numbers as digits in the overwhelming majority
// of real cases (well-documented behavior, not an assumption this app is
// making), so a full English number-word parser would mostly be solving a
// problem transcription has already solved. A phrase this can't parse still
// reaches the coach as the raw transcript, editable by hand — it never just
// disappears.

export interface ParsedSetLog {
  load?: number
  reps?: number
  rpe?: number
  /** The exact text this was parsed from — always populated, shown to the
   *  coach alongside whatever did or didn't get extracted from it. */
  raw: string
}

/** True when nothing beyond the raw transcript was recognized — the caller
 *  should let the coach fill the set in by hand rather than imply a field
 *  is now known. */
export function isEmpty(parsed: ParsedSetLog): boolean {
  return parsed.load == null && parsed.reps == null && parsed.rpe == null
}

export function parseSetLog(text: string): ParsedSetLog {
  const raw = text.trim()
  const result: ParsedSetLog = { raw }
  if (!raw) return result

  let lower = raw.toLowerCase()

  // RPE can appear anywhere in the utterance alongside load/reps ("185 for
  // 8 at RPE 8") — pulled out first, and stripped from the string before the
  // load/reps patterns run, so "rpe 8" can't also get misread as a rep count.
  const rpeMatch = lower.match(/rpe\s*(?:of\s*)?(\d+(?:\.\d+)?)/)
  if (rpeMatch) {
    result.rpe = parseFloat(rpeMatch[1])
    lower = lower.slice(0, rpeMatch.index) + lower.slice(rpeMatch.index! + rpeMatch[0].length)
  }
  lower = lower.trim()

  // "<load> [lb/kg] for|by|x <reps>" — "185 for 8", "225 by 5", "60kg x 10"
  let m = lower.match(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?|kgs?|kilos?|kilograms?)?\s*(?:for|by|x|×)\s*(\d+)/)
  if (m) {
    result.load = parseFloat(m[1])
    result.reps = parseInt(m[2], 10)
    return result
  }

  // "<reps> reps at <load>" / "<reps> at <load>" — "8 reps at 185", "8 at 185"
  m = lower.match(/(\d+)\s*(?:reps?)?\s*at\s*(\d+(?:\.\d+)?)/)
  if (m) {
    result.reps = parseInt(m[1], 10)
    result.load = parseFloat(m[2])
    return result
  }

  // Bodyweight — no numeric load, but the rep count still matters.
  // "bodyweight for 12", "body weight, 12 reps"
  m = lower.match(/body\s*weight[^\d]*(\d+)/)
  if (m) {
    result.reps = parseInt(m[1], 10)
    return result
  }

  // Bare "N reps" or a single bare number — the single-number case defaults
  // to reps, since a lone number mid-set ("eight") is almost always a rep
  // count, not a load spoken with no unit or partner number.
  m = lower.match(/^(\d+)\s*reps?$/) ?? lower.match(/^(\d+(?:\.\d+)?)$/)
  if (m) {
    result.reps = parseInt(m[1], 10)
    return result
  }

  return result
}
