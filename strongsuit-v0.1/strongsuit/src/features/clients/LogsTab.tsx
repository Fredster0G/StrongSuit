import { useEffect, useState } from 'react'
import { Card, EmptyState } from '@/design'
import { logsRepo, exercisesRepo } from '@/db/repo'
import type { SessionLog, Exercise } from '@/db/types'
import { format, parseISO } from 'date-fns'
import { Activity, Loader2, DownloadCloud } from 'lucide-react'
import { fmtLoad, setTonnage, nowIso } from '@/lib/core'
import { toast } from '@/design'
import ExerciseHistoryDrawer from '../logging/ExerciseHistoryDrawer'

interface LogsTabProps {
  clientId: string
  clientUnits: 'lb' | 'kg'
}

export default function LogsTab({ clientId, clientUnits }: LogsTabProps) {
  const [logs, setLogs] = useState<SessionLog[]>([])
  const [exercises, setExercises] = useState<Record<string, Exercise>>({})
  const [loading, setLoading] = useState(true)

  const [drawerEx, setDrawerEx] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const data = await logsRepo.forClient(clientId)
      setLogs(data)
      
      const allEx = await exercisesRepo.all()
      const map: Record<string, Exercise> = {}
      for (const e of allEx) map[e.id] = e
      setExercises(map)
      
      setLoading(false)
    }
    load()
  }, [clientId])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.logs && Array.isArray(data.logs)) {
        // Stamp them just in case they lack updatedAt
        const logsToMerge = data.logs.map((log: any) => ({
          ...log,
          createdAt: log.createdAt || nowIso(),
          updatedAt: log.updatedAt || nowIso()
        }))
        const { applied, skipped } = await logsRepo.mergeUpsert(logsToMerge)
        toast(`Imported ${applied} sessions (skipped ${skipped} duplicates).`)
        // reload
        setLoading(true)
        const updated = await logsRepo.forClient(clientId)
        setLogs(updated)
        setLoading(false)
      } else {
        toast('Invalid Companion Data file.')
      }
    } catch (err) {
      toast('Failed to parse file.')
      console.error(err)
    }
  }

  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-faint" /></div>
  }

  if (logs.length === 0) {
    return (
      <EmptyState 
        icon={<Activity size={28} strokeWidth={1.5} />}
        title="No sessions logged yet" 
        body="Log the first one and the charts start working for you." 
      />
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Session History</h3>
        <div>
          <input type="file" id="import-companion" accept=".ssdata" className="hidden" onChange={handleImport} />
          <label htmlFor="import-companion" className="cursor-pointer inline-flex items-center justify-center bg-surface border border-line text-ink px-3 py-1.5 rounded-md font-medium text-sm hover:opacity-80 transition-opacity">
            <DownloadCloud size={14} className="mr-1.5" /> Import Data
          </label>
        </div>
      </div>
      <div className="space-y-4">
        {logs.map(log => {
        // Calculate session summary (total volume, etc.)
        let sessionVolume = 0
        let setsCompleted = 0
        for (const e of log.entries) {
          for (const s of e.sets) {
            if (s.done) {
              setsCompleted++
              if (s.actualLoad && s.actualReps) {
                sessionVolume += setTonnage(s.actualLoad, s.actualReps)
              }
            }
          }
        }

        return (
          <Card key={log.id} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-iron-50 dark:bg-iron-900/20">
              <div>
                <h3 className="font-bold text-ink text-lg">{log.title || 'Freestyle Session'}</h3>
                <p className="text-sm text-faint font-medium">{format(parseISO(log.date), 'EEEE, MMM d, yyyy')}</p>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-ink">{setsCompleted} sets completed</div>
                {sessionVolume > 0 && <div className="text-xs text-muted">Vol: {fmtLoad(sessionVolume, clientUnits)}</div>}
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {log.entries.length === 0 ? (
                <p className="text-faint text-sm italic">Empty session</p>
              ) : (
                <div className="space-y-4">
                  {log.entries.map((entry, idx) => {
                    const ex = exercises[entry.exerciseId]
                    const doneSets = entry.sets.filter(s => s.done)
                    return (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
                        <button 
                          className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 text-left"
                          onClick={() => setDrawerEx(ex.id)}
                        >
                          {ex?.name || 'Unknown Exercise'}
                        </button>
                        
                        <div className="flex flex-wrap gap-2 flex-1">
                          {doneSets.length === 0 ? (
                            <span className="text-xs text-muted italic">Skipped</span>
                          ) : (
                            doneSets.map((s, sIdx) => (
                              <span key={sIdx} className="inline-flex items-center rounded bg-iron-100 dark:bg-iron-800 px-2 py-0.5 text-xs font-medium text-ink">
                                {s.actualLoad ? `${s.actualLoad} × ` : ''}{s.actualReps ?? '-'}{s.rpe ? ` @ ${s.rpe}` : ''}
                              </span>
                            ))
                          )}
                        </div>
                        {entry.notes && (
                          <div className="w-full text-xs text-faint mt-1 sm:mt-0 italic block">"{entry.notes}"</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {log.sessionNotes && (
                <div className="mt-4 pt-4 border-t border-line text-sm text-ink bg-amber-50 dark:bg-amber-950/20 p-3 rounded">
                  <span className="font-semibold text-amber-700 dark:text-amber-500 mr-2">Note:</span>
                  {log.sessionNotes}
                </div>
              )}
            </div>
          </Card>
        )
      })}

      </div>
      <ExerciseHistoryDrawer 
        clientId={clientId}
        exerciseId={drawerEx!}
        open={!!drawerEx}
        onClose={() => setDrawerEx(null)}
        clientUnits={clientUnits}
      />
    </div>
  )
}
