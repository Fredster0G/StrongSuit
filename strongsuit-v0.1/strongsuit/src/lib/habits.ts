// ===== Habit streaks (spec §4.26b) =====
// Pure function: given a habit's done/not-done entries, compute the current
// consecutive-day streak ending today (or yesterday, so missing today doesn't
// zero out a streak still "in progress").

import { addDays, format } from 'date-fns'

export interface HabitEntryLike { date: string; done: boolean }

export function currentStreak(entries: HabitEntryLike[], today: string): number {
  const doneDates = new Set(entries.filter(e => e.done).map(e => e.date))
  let streak = 0
  let cursor = doneDates.has(today) ? today : format(addDays(new Date(today + 'T00:00:00'), -1), 'yyyy-MM-dd')
  // if neither today nor yesterday is done, streak is 0
  if (!doneDates.has(cursor)) return 0
  while (doneDates.has(cursor)) {
    streak++
    cursor = format(addDays(new Date(cursor + 'T00:00:00'), -1), 'yyyy-MM-dd')
  }
  return streak
}
