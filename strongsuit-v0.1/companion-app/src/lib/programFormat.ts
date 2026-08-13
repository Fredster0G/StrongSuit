// Pure formatting for coach-assigned set prescriptions — kept out of the
// page component so it can be unit-tested (same lib-with-tests convention
// as the coach app).
import type { SetPrescription, Units } from '@/db/types'

export function fmtSet(s: SetPrescription, units: Units): string {
  if (s.timeSeconds) return `${s.timeSeconds}s`
  if (s.distanceM) return `${s.distanceM}m`
  const reps = s.reps ?? '?'
  if (s.loadMode === 'note' && s.loadNote) return `${reps} @ ${s.loadNote}`
  if (s.loadMode === 'percent1rm' && s.load != null) return `${reps} @ ${s.load}%`
  if (s.loadMode === 'rpe' || (s.load == null && s.rpe != null)) return `${reps} @ RPE ${s.rpe ?? '?'}`
  if (s.load != null) return `${reps} × ${s.load} ${units}`
  return `${reps}`
}
