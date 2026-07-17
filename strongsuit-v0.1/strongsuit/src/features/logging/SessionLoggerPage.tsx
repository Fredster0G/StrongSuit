import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, Plus, Trash2, Loader2, PlayCircle } from 'lucide-react'
import { Button, Card, SectionHeader } from '@/design'
import { toast, toastError } from '@/design/overlay'
import { today, stamp } from '@/lib/core'
import { clientsRepo, programsRepo, exercisesRepo, logsRepo, trainerRepo } from '@/db/repo'
import type { SessionLog, Client, Exercise, LogEntry, Trainer } from '@/db/types'
import { createSessionLogTemplate } from './api'
import { Stepper } from './Stepper'
import { RestTimer } from './RestTimer'
import { VideoViewerDialog } from '../library/VideoViewer'
import { exerciseVideos } from '@/lib/videoEmbed'
import ExerciseSearch from '../programs/builder/ExerciseSearch'

export default function SessionLoggerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const clientId = searchParams.get('clientId')
  const programId = searchParams.get('programId')
  const dayId = searchParams.get('dayId')

  const [client, setClient] = useState<Client | null>(null)
  const [trainer, setTrainer] = useState<Trainer | null>(null)
  const [log, setLog] = useState<SessionLog | null>(null)
  const [exercises, setExercises] = useState<Record<string, Exercise>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [searchOpen, setSearchOpen] = useState(false)
  const [restSeconds, setRestSeconds] = useState<number | null>(null)
  const [restKey, setRestKey] = useState(0)
  const [videoFor, setVideoFor] = useState<Exercise | null>(null)

  // Initialize
  useEffect(() => {
    if (!clientId) {
      navigate('/')
      return
    }

    async function init() {
      try {
        const [c, t] = await Promise.all([
          clientsRepo.get(clientId!),
          trainerRepo.getOrCreate()
        ])
        if (!c) {
          toastError('Client not found')
          navigate('/')
          return
        }
        setClient(c)
        setTrainer(t)

        const allEx = await exercisesRepo.all()
        const exMap: Record<string, Exercise> = {}
        for (const ex of allEx) exMap[ex.id] = ex
        setExercises(exMap)

        if (programId && dayId) {
          const p = await programsRepo.get(programId)
          if (p) {
            let foundDay = null
            for (const w of p.weeks) {
              for (const d of w.days) {
                if (d.id === dayId) foundDay = d
              }
            }
            if (foundDay) {
              setLog(createSessionLogTemplate(c.id, p, foundDay))
            }
          }
        }

        // Freestyle fallback if no program/day found or passed
        setLog(prev => prev ?? (stamp({
          clientId: c.id,
          date: today(),
          title: 'Freestyle Session',
          entries: [],
          source: 'trainer' as const
        } as Partial<SessionLog>) as SessionLog))
      } catch (e) {
        console.error(e)
        toastError('Failed to load session logger')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [clientId, programId, dayId, navigate])

  const handleSave = async () => {
    if (!log) return
    setSaving(true)
    try {
      await logsRepo.create(log)
      toast('Session saved')
      navigate(`/clients/${log.clientId}?tab=logs`)
    } catch (e) {
      console.error(e)
      toastError('Failed to save session')
      setSaving(false)
    }
  }

  const updateEntry = (index: number, updates: Partial<LogEntry>) => {
    if (!log) return
    const newEntries = [...log.entries]
    newEntries[index] = { ...newEntries[index], ...updates }
    setLog({ ...log, entries: newEntries })
  }

  const removeEntry = (index: number) => {
    if (!log) return
    const newEntries = [...log.entries]
    newEntries.splice(index, 1)
    setLog({ ...log, entries: newEntries })
  }

  const handleAddExercise = (exerciseId: string) => {
    if (!log) return
    const newEntry: LogEntry = {
      exerciseId,
      sets: [{ done: false }]
    }
    setLog({ ...log, entries: [...log.entries, newEntry] })
    setSearchOpen(false)
  }

  if (loading || !client || !log) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-faint" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl h-full pb-32 pt-6 px-4">
      <SectionHeader 
        title={log.title || 'Session'}
        action={
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(-1)}><ChevronLeft size={16}/> Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin mr-1.5" /> : <Check size={16} className="mr-1.5" />} 
              Save Log
            </Button>
          </div>
        }
      />
      <div className="mb-6 -mt-2 text-sm text-faint font-medium">
        Logging for {client.firstName} {client.lastName} • {log.date}
      </div>

      <div className="space-y-6 mt-6">
        {log.entries.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-line rounded-lg">
            <p className="text-faint mb-4">No exercises added yet.</p>
            <Button variant="secondary" onClick={() => setSearchOpen(true)}>
              <Plus size={16} className="mr-1.5" /> Add Exercise
            </Button>
          </div>
        ) : (
          log.entries.map((entry, eIdx) => {
            const ex = exercises[entry.exerciseId]
            return (
              <Card key={eIdx} className="overflow-hidden">
                <div className="flex items-center justify-between mb-4 border-b border-line pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-ink">{ex?.name || 'Unknown Exercise'}</h3>
                    {ex && exerciseVideos(ex).length > 0 && (
                      <button onClick={() => setVideoFor(ex)} className="text-verde-600 hover:text-verde-700" title="Watch video" aria-label="Watch video">
                        <PlayCircle size={16} />
                      </button>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeEntry(eIdx)} className="text-faint hover:text-signal-600">
                    <Trash2 size={14} />
                  </Button>
                </div>

                <div className="space-y-3">
                  {entry.sets.map((set, sIdx) => {
                    const updateSet = (updates: Partial<typeof set>) => {
                      const newSets = [...entry.sets]
                      newSets[sIdx] = { ...set, ...updates }
                      updateEntry(eIdx, { sets: newSets })
                    }
                    return (
                      <div key={sIdx} className={`flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg border ${set.done ? 'border-verde-600/30 bg-verde-100/60' : 'border-line bg-surface'}`}>
                        {/* Status Toggle (Big touch target) */}
                        <button
                          onClick={() => {
                            const nowDone = !set.done
                            updateSet({ done: nowDone })
                            if (nowDone) {
                              setRestSeconds(entry.restSeconds ?? trainer?.defaultRestSeconds ?? 90)
                              setRestKey(k => k + 1)
                            }
                          }}
                          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${set.done ? 'bg-verde-600 text-white' : 'bg-surface2 text-faint hover:bg-line'}`}
                        >
                          <Check size={20} strokeWidth={set.done ? 3 : 2} />
                        </button>
                        
                        <div className="flex-1 grid grid-cols-2 gap-4">
                          {/* Load Input */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-medium text-faint">Load {trainer?.units === 'kg' ? '(kg)' : '(lb)'}</label>
                              {set.targetLoad != null && <span className="text-[10px] text-muted">Target: {set.targetLoad} {set.targetLoadMode === 'rpe' ? 'RPE' : ''}</span>}
                            </div>
                            <Stepper 
                              value={set.actualLoad ?? set.targetLoad} 
                              onChange={(v) => updateSet({ actualLoad: v })}
                              step={2.5}
                              min={0}
                              className="w-full"
                            />
                          </div>

                          {/* Reps Input */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-medium text-faint">Reps</label>
                              {set.targetReps != null && <span className="text-[10px] text-muted">Target: {set.targetReps}</span>}
                            </div>
                            <Stepper 
                              value={set.actualReps} 
                              onChange={(v) => updateSet({ actualReps: v })}
                              step={1}
                              min={0}
                              placeholder="-"
                              className="w-full"
                            />
                          </div>
                        </div>

                        {/* RPE (Optional, fits on same row on wide screens, wraps on small) */}
                        <div className="sm:w-24">
                           <label className="text-xs font-medium text-faint mb-1 block">RPE</label>
                           <Stepper 
                             value={set.rpe} 
                             onChange={(v) => updateSet({ rpe: v })}
                             step={0.5}
                             min={1}
                             max={10}
                             placeholder="-"
                             className="w-full"
                           />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => {
                    const newSets = [...entry.sets, { done: false }]
                    updateEntry(eIdx, { sets: newSets })
                  }}>
                    <Plus size={14} className="mr-1.5" /> Add Set
                  </Button>

                  <input
                    type="text"
                    placeholder="Note for this exercise..."
                    className="flex-1 ml-4 bg-transparent border-b border-dashed border-line text-sm focus:outline-none focus:border-verde-600"
                    value={entry.notes || ''}
                    onChange={e => updateEntry(eIdx, { notes: e.target.value })}
                  />
                </div>
              </Card>
            )
          })
        )}

        {log.entries.length > 0 && (
          <div className="flex justify-center pt-4">
            <Button variant="secondary" onClick={() => setSearchOpen(true)}>
              <Plus size={16} className="mr-1.5" /> Add Another Exercise
            </Button>
          </div>
        )}
      </div>

      <ExerciseSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(ex) => handleAddExercise(ex.id)}
      />

      {restSeconds != null && (
        <RestTimer key={restKey} seconds={restSeconds} onDismiss={() => setRestSeconds(null)} />
      )}

      <VideoViewerDialog
        title={videoFor?.name ?? 'Video'}
        links={videoFor ? exerciseVideos(videoFor) : []}
        open={!!videoFor}
        onClose={() => setVideoFor(null)}
      />
    </div>
  )
}
