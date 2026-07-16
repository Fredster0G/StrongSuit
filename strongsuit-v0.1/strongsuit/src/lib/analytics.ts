import { parseISO, startOfWeek, format } from 'date-fns'
import type { SessionLog } from '@/db/types'
import { e1rm, setTonnage } from './core'

export interface PREvent {
  id: string
  date: string
  exerciseId: string
  type: 'load' | 'rep' | 'e1rm'
  load: number
  reps: number
  value: number // the new PR value
}

/** Detect PRs from a chronological (or any, we sort it) array of SessionLogs. */
export function detectPRs(logs: SessionLog[]): PREvent[] {
  const prs: PREvent[] = []
  
  // Sort ascending by date
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date))
  
  const maxLoad: Record<string, number> = {}
  const maxE1rm: Record<string, number> = {}
  const maxRepsByLoad: Record<string, Record<number, number>> = {}
  const hasHistory: Record<string, boolean> = {}

  for (const log of sorted) {
    // Process session chronologically
    for (const entry of log.entries) {
      const ex = entry.exerciseId
      if (!maxRepsByLoad[ex]) maxRepsByLoad[ex] = {}

      for (let i = 0; i < entry.sets.length; i++) {
        const set = entry.sets[i]
        if (!set.done || !set.actualLoad || !set.actualReps) continue
        
        const load = set.actualLoad
        const reps = set.actualReps
        const rm = e1rm(load, reps)

        let isLoad = false
        let isRep = false
        let isRm = false

        if (load > (maxLoad[ex] || 0)) {
          isLoad = true
          maxLoad[ex] = load
        }
        if (rm > (maxE1rm[ex] || 0)) {
          isRm = true
          maxE1rm[ex] = rm
        }
        if (reps > (maxRepsByLoad[ex][load] || 0)) {
          isRep = true
          maxRepsByLoad[ex][load] = reps
        }

        if (hasHistory[ex]) {
          // Only emit highest precedence PR to avoid spam. 1 set = 1 PR event max.
          if (isRm) {
            prs.push({ id: `${log.id}-${ex}-${i}-rm`, date: log.date, exerciseId: ex, type: 'e1rm', load, reps, value: rm })
          } else if (isLoad) {
            prs.push({ id: `${log.id}-${ex}-${i}-load`, date: log.date, exerciseId: ex, type: 'load', load, reps, value: load })
          } else if (isRep) {
            prs.push({ id: `${log.id}-${ex}-${i}-rep`, date: log.date, exerciseId: ex, type: 'rep', load, reps, value: reps })
          }
        }
      }
      
      // After processing the first session for an exercise, subsequent sessions can trigger PRs
      hasHistory[ex] = true
    }
  }

  // Return newest first
  return prs.reverse()
}

/** Tonnage grouped by week start date (YYYY-MM-DD). */
export function calculateWeeklyTonnage(logs: SessionLog[], weekStartsOn: 0 | 1 = 1): { week: string; tonnage: number }[] {
  const map: Record<string, number> = {}
  
  for (const log of logs) {
    const d = parseISO(log.date)
    const weekStart = format(startOfWeek(d, { weekStartsOn }), 'yyyy-MM-dd')
    
    let vol = 0
    for (const entry of log.entries) {
      for (const set of entry.sets) {
        if (set.done) {
          vol += setTonnage(set.actualLoad, set.actualReps)
        }
      }
    }
    
    map[weekStart] = (map[weekStart] || 0) + vol
  }

  // Return sorted oldest to newest for charts
  return Object.entries(map)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, tonnage]) => ({ week, tonnage }))
}

/** Adherence: just completed sessions per week. */
export function calculateWeeklySessions(logs: SessionLog[], weekStartsOn: 0 | 1 = 1): { week: string; count: number }[] {
  const map: Record<string, number> = {}
  
  for (const log of logs) {
    const d = parseISO(log.date)
    const weekStart = format(startOfWeek(d, { weekStartsOn }), 'yyyy-MM-dd')
    map[weekStart] = (map[weekStart] || 0) + 1
  }

  return Object.entries(map)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, count]) => ({ week, count }))
}
