import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Settings } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { programsRepo, clientsRepo } from '@/db/repo'
import type { Program, ProgressionPolicy } from '@/db/types'
import { Button, Dialog, Select, Field, toast, Input, Textarea, SegmentedControl } from '@/design'

import BuilderOutline from './BuilderOutline'
import DayCanvas from './DayCanvas'
import GridView from './GridView'

const VIEW_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'grid', label: 'Grid' },
]

const MAX_HISTORY = 50

export default function ProgramBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()

  // The draft currently being edited
  const [draft, setDraft] = useState<Program | null>(null)
  
  // History stack for undo/redo
  const [history, setHistory] = useState<Program[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  
  // Track active selections
  const [activeDayId, setActiveDayId] = useState<string | null>(null)
  const [view, setView] = useState<'day' | 'grid'>('day')
  
  // Track last saved state to know if we have unsaved changes
  const [lastSaved, setLastSaved] = useState<Program | null>(null)

  // Dialogs
  const [assignOpen, setAssignOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [assignClientId, setAssignClientId] = useState('')
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])

  // Load the initial program
  useEffect(() => {
    if (!id) return
    programsRepo.get(id).then(prog => {
      if (!prog) {
        navigate('/programs')
        return
      }
      setDraft(prog)
      setLastSaved(prog)
      setHistory([prog])
      setHistoryIndex(0)

      // Set initial active day
      if (prog.weeks.length > 0 && prog.weeks[0].days.length > 0) {
        setActiveDayId(prog.weeks[0].days[0].id)
      }
    })
  }, [id, navigate])

  // Save changes automatically (debounced)
  useEffect(() => {
    if (!draft || !lastSaved) return
    
    // Simple deep equality check (could use a faster one, but this is fine for small JSON)
    const isDirty = JSON.stringify(draft) !== JSON.stringify(lastSaved)
    if (!isDirty) return

    const timer = setTimeout(() => {
      programsRepo.update(draft.id, draft).then(() => {
        setLastSaved(draft)
      })
    }, 2000)
    
    return () => clearTimeout(timer)
  }, [draft, lastSaved])

  const commitChange = useCallback((newDraft: Program) => {
    // If we are currently "undone", truncate the future history
    let newHistory = history
    if (historyIndex < history.length - 1) {
      newHistory = history.slice(0, historyIndex + 1)
    }
    
    // Add new state to history, respecting MAX_HISTORY
    newHistory = [...newHistory, newDraft]
    if (newHistory.length > MAX_HISTORY) {
      newHistory = newHistory.slice(newHistory.length - MAX_HISTORY)
    }
    
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setDraft(newDraft)
  }, [history, historyIndex])

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prev = historyIndex - 1
      setHistoryIndex(prev)
      setDraft(history[prev])
    }
  }, [history, historyIndex])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = historyIndex + 1
      setHistoryIndex(next)
      setDraft(history[next])
    }
  }, [history, historyIndex])

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘Z for Undo, ⇧⌘Z or ⌘Y for Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  if (!draft) return <div className="p-8 text-faint animate-pulse">Loading builder…</div>

  const isSaving = lastSaved && JSON.stringify(draft) !== JSON.stringify(lastSaved)
  const activeWeekId = draft.weeks.find(w => w.days.some(d => d.id === activeDayId))?.id ?? draft.weeks[0]?.id ?? null

  return (
    <div className="flex flex-col h-full bg-surface2">
      {/* Builder Header */}
      <div className="flex-none px-4 py-3 border-b border-line bg-surface flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/programs')} className="-ms-2">
            <ArrowLeft size={16} />
          </Button>
          <input 
            type="text" 
            value={draft.name} 
            onChange={(e) => commitChange({ ...draft, name: e.target.value })}
            className="text-lg font-bold text-ink bg-transparent border-none p-0 focus:ring-0 focus:outline-none placeholder:text-muted w-full max-w-[200px] md:max-w-none"
            placeholder="Program Name"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs">
          {/* Status Indicator */}
          {isSaving ? (
            <span className="text-muted flex items-center gap-1.5"><Save size={14} className="animate-pulse" /> Saving...</span>
          ) : (
            <span className="text-verde-600 flex items-center gap-1.5"><Save size={14} /> Saved</span>
          )}
          <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={v => setView(v as 'day' | 'grid')} />
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings size={14} className="me-1.5" /> Settings
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAssignOpen(true)}>
            Assign to client...
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/programs')}>
            Done
          </Button>
        </div>
      </div>

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign to client" width={400}>
        <div className="space-y-4">
          <Field label="Client">
            <Select value={assignClientId} onChange={e => setAssignClientId(e.target.value)}>
              <option value="">Select a client...</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button 
              variant="primary" 
              disabled={!assignClientId}
              onClick={async () => {
                const assigned = { ...draft, clientId: assignClientId, status: 'active' as const }
                commitChange(assigned)
                await programsRepo.update(assigned.id, assigned)
                setLastSaved(assigned)
                setAssignOpen(false)
                toast(`Program assigned to client.`)
                navigate(`/clients/${assignClientId}`)
              }}
            >
              Assign & View
            </Button>
          </div>
        </div>
      </Dialog>

      <ProgramSettingsDialog 
        draft={draft}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        commitChange={commitChange}
      />

      {/* Two Pane Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Pane (Outline) */}
        <div className="w-full md:w-64 flex-none border-b md:border-b-0 md:border-e border-line bg-surface overflow-y-auto md:overflow-y-auto max-h-[30vh] md:max-h-none">
          <BuilderOutline 
            draft={draft}
            commitChange={commitChange}
            activeDayId={activeDayId}
            setActiveDayId={setActiveDayId}
          />
        </div>

        {/* Right Pane (Canvas) */}
        <div className="flex-1 overflow-y-auto bg-surface2 p-6">
          {view === 'grid' ? (
            <GridView
              draft={draft}
              weekId={activeWeekId}
              commitChange={commitChange}
              onSelectDay={dayId => { setActiveDayId(dayId); setView('day') }}
            />
          ) : activeDayId ? (
            <DayCanvas
              draft={draft}
              dayId={activeDayId}
              commitChange={commitChange}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-faint">
              <p>Select a day to edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProgramSettingsDialog({ draft, open, onClose, commitChange }: { draft: Program, open: boolean, onClose: () => void, commitChange: (d: Program) => void }) {
  const [desc, setDesc] = useState(draft.description || '')
  const [goalTag, setGoalTag] = useState(draft.goalTag || '')
  
  const pol = draft.progressionPolicy
  const [polKind, setPolKind] = useState<'none'|'linear-load'|'double-progression'|'rpe-target'>(pol ? pol.kind : 'none')
  
  const [llPercent, setLlPercent] = useState(pol?.kind === 'linear-load' ? pol.percent : 2.5)
  const [dpRepMin, setDpRepMin] = useState(pol?.kind === 'double-progression' ? pol.repRange[0] : 8)
  const [dpRepMax, setDpRepMax] = useState(pol?.kind === 'double-progression' ? pol.repRange[1] : 12)
  const [dpLoadInc, setDpLoadInc] = useState(pol?.kind === 'double-progression' ? pol.loadIncrement : 5)
  const [rpeTarget, setRpeTarget] = useState(pol?.kind === 'rpe-target' ? pol.target : 8)

  function save() {
    let newPol: ProgressionPolicy | undefined = undefined
    if (polKind === 'linear-load') newPol = { kind: 'linear-load', percent: Number(llPercent) }
    else if (polKind === 'double-progression') newPol = { kind: 'double-progression', repRange: [Number(dpRepMin), Number(dpRepMax)], loadIncrement: Number(dpLoadInc) }
    else if (polKind === 'rpe-target') newPol = { kind: 'rpe-target', target: Number(rpeTarget) }
    
    commitChange({
      ...draft,
      description: desc,
      goalTag,
      progressionPolicy: newPol
    })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Program Settings" width={500}>
      <div className="space-y-4">
        <Field label="Description">
          <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} />
        </Field>
        
        <Field label="Goal / Tag" hint="e.g. Hypertrophy, Strength, Peak">
          <Input value={goalTag} onChange={e => setGoalTag(e.target.value)} />
        </Field>
        
        <div className="border-t border-line pt-4">
          <h3 className="font-bold mb-3">Auto-Progression Engine</h3>
          <Field label="Policy">
            <Select value={polKind} onChange={e => setPolKind(e.target.value as any)}>
              <option value="none">None (Manual)</option>
              <option value="linear-load">Linear Load (+%)</option>
              <option value="double-progression">Double Progression</option>
              <option value="rpe-target">RPE Target</option>
            </Select>
          </Field>
          
          {polKind === 'linear-load' && (
            <div className="mt-2">
              <Field label="Increase load by (%)">
                <Input type="number" step="0.5" value={llPercent} onChange={e => setLlPercent(Number(e.target.value))} />
              </Field>
            </div>
          )}
          
          {polKind === 'double-progression' && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Field label="Min Reps">
                <Input type="number" value={dpRepMin} onChange={e => setDpRepMin(Number(e.target.value))} />
              </Field>
              <Field label="Max Reps">
                <Input type="number" value={dpRepMax} onChange={e => setDpRepMax(Number(e.target.value))} />
              </Field>
              <Field label="Load jump">
                <Input type="number" step="1.25" value={dpLoadInc} onChange={e => setDpLoadInc(Number(e.target.value))} />
              </Field>
            </div>
          )}

          {polKind === 'rpe-target' && (
            <div className="mt-2">
              <Field label="Target RPE (1-10)">
                <Input type="number" step="0.5" min="1" max="10" value={rpeTarget} onChange={e => setRpeTarget(Number(e.target.value))} />
              </Field>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save Settings</Button>
      </div>
    </Dialog>
  )
}

