// ===== Turn OCR'd log-sheet text into a list of sets =====
//
// One page can hold several sets, one per line — this is the multi-line
// counterpart to voice logging's single-utterance `setLogParser.ts`, and
// deliberately reuses that exact parser per line rather than writing a
// second number-extraction engine: a printed/handwritten "185 for 8" means
// the same thing whether it arrived via a microphone or a photo.

import { parseSetLog, isEmpty, type ParsedSetLog } from './setLogParser'

export interface ParsedLogSheet {
  /** The full text OCR actually read, shown to the coach so a bad read is
   *  visible and correctable rather than silently producing wrong sets. */
  raw: string
  /** One entry per line that parsed to something — lines that didn't
   *  parse (a title, a date, OCR noise) are silently skipped here, but
   *  still visible in `raw` for the coach to check. */
  sets: ParsedSetLog[]
}

export function parseLogSheet(ocrText: string): ParsedLogSheet {
  const lines = ocrText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const sets: ParsedSetLog[] = []
  for (const line of lines) {
    const parsed = parseSetLog(line)
    if (!isEmpty(parsed)) sets.push(parsed)
  }
  return { raw: ocrText, sets }
}
