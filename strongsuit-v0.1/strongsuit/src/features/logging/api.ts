import type { Program, Day, SessionLog, LogEntry, LoggedSet } from '@/db/types'
import { today, stamp } from '@/lib/core'

export function createSessionLogTemplate(clientId: string, program: Program, day: Day): SessionLog {
  const entries: LogEntry[] = []

  for (const block of day.blocks) {
    for (const ex of block.exercises) {
      const sets: LoggedSet[] = ex.sets.map(s => ({
        targetReps: s.reps,
        targetLoad: s.load,
        targetLoadMode: s.loadMode,
        done: false,
      }))
      entries.push({
        exerciseId: ex.exerciseId,
        sets,
        restSeconds: ex.restSeconds,
      })
    }
  }

  let weekId: string | undefined
  for (const w of program.weeks) {
    if (w.days.some(d => d.id === day.id)) {
      weekId = w.id
      break
    }
  }

  return stamp({
    clientId,
    programId: program.id,
    weekId,
    dayId: day.id,
    date: today(),
    title: day.name,
    entries,
    source: 'trainer' as const
  } as Partial<SessionLog>) as SessionLog
}
