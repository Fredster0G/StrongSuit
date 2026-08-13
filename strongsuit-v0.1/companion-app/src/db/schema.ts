import Dexie, { type EntityTable } from 'dexie'
import type { CompanionProfile, CoachLink, PersonalWorkout, PersonalMetric, CoachMessage, AssignedProgram, CoachExercise, CycleDay } from './types'

export const db = new Dexie('coachwright-companion') as Dexie & {
  profile: EntityTable<CompanionProfile, 'id'>
  coachLink: EntityTable<CoachLink, 'id'>
  workouts: EntityTable<PersonalWorkout, 'id'>
  metrics: EntityTable<PersonalMetric, 'id'>
  messages: EntityTable<CoachMessage, 'id'>
  assignedPrograms: EntityTable<AssignedProgram, 'id'>
  coachExercises: EntityTable<CoachExercise, 'id'>
  /** Local-only health data — never synced. See types.ts. */
  cycleDays: EntityTable<CycleDay, 'id'>
}

// Still pre-release (no real installs yet) — new stores go straight into
// version 1 rather than a migration bump. Once this ships, follow the coach
// app's schema-change recipe (APPEND a new .version(N+1) instead).
db.version(1).stores({
  profile: 'id',
  coachLink: 'id',
  workouts: 'id, date',
  metrics: 'id, date, type',
  messages: 'id, createdAt',
  assignedPrograms: 'id, status',
  coachExercises: 'id',
  cycleDays: 'id, date',
})
