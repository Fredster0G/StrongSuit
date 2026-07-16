import { useState } from 'react'
import { Plus, Copy, Trash2 } from 'lucide-react'
import type { Program, Week, ExercisePrescription } from '@/db/types'
import { newId } from '@/lib/core'
import { Button, Dialog, Field, Select } from '@/design'

interface BuilderOutlineProps {
  draft: Program
  commitChange: (newDraft: Program) => void
  activeDayId: string | null
  setActiveDayId: (id: string | null) => void
}

export default function BuilderOutline({
  draft,
  commitChange,
  activeDayId,
  setActiveDayId
}: BuilderOutlineProps) {
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [weekToDuplicate, setWeekToDuplicate] = useState<Week | null>(null)
  const [progressionMode, setProgressionMode] = useState<'none' | 'load' | 'reps'>('none')

  const addWeek = () => {
    const wId = newId()
    const dId = newId()
    const newWeek: Week = {
      id: wId,
      label: `Week ${draft.weeks.length + 1}`,
      days: [
        {
          id: dId,
          name: 'Day 1',
          blocks: []
        }
      ]
    }
    commitChange({
      ...draft,
      weeks: [...draft.weeks, newWeek]
    })
    setActiveDayId(dId)
  }

  const addDay = (weekId: string) => {
    const dId = newId()
    commitChange({
      ...draft,
      weeks: draft.weeks.map(w => {
        if (w.id === weekId) {
          return {
            ...w,
            days: [
              ...w.days,
              {
                id: dId,
                name: `Day ${w.days.length + 1}`,
                blocks: []
              }
            ]
          }
        }
        return w
      })
    })
    setActiveDayId(dId)
  }

  const openDuplicateDialog = (week: Week) => {
    setWeekToDuplicate(week)
    setDuplicateOpen(true)
  }

  const executeDuplicate = () => {
    if (!weekToDuplicate) return
    const week = weekToDuplicate
    
    const newWeekId = newId()
    const clonedWeek: Week = {
      ...structuredClone(week),
      id: newWeekId,
      label: `${week.label} (Copy)`
    }
    
    // Re-key and optionally progress
    clonedWeek.days = clonedWeek.days.map(d => ({
      ...d, id: newId(),
      blocks: d.blocks.map(b => ({
        ...b, id: newId(),
        exercises: b.exercises.map(e => {
          const newEx: ExercisePrescription = { ...e, id: newId() }
          if (progressionMode === 'load') {
            newEx.sets = newEx.sets.map(s => ({
              ...s,
              load: s.load ? Number((s.load * 1.025).toFixed(1)) : s.load
            }))
          } else if (progressionMode === 'reps') {
            newEx.sets = newEx.sets.map(s => ({
              ...s,
              reps: s.reps ? s.reps + 1 : s.reps
            }))
          }
          return newEx
        })
      }))
    }))

    commitChange({
      ...draft,
      weeks: [...draft.weeks, clonedWeek]
    })
    
    if (clonedWeek.days.length > 0) {
      setActiveDayId(clonedWeek.days[0].id)
    }
    setDuplicateOpen(false)
    setWeekToDuplicate(null)
  }

  const deleteWeek = (weekId: string) => {
    const newWeeks = draft.weeks.filter(w => w.id !== weekId)
    commitChange({ ...draft, weeks: newWeeks })
    
    // If active day was in the deleted week, reset active day
    const activeDayExists = newWeeks.some(w => w.days.some(d => d.id === activeDayId))
    if (!activeDayExists) {
      const firstDay = newWeeks[0]?.days[0]
      setActiveDayId(firstDay ? firstDay.id : null)
    }
  }

  const deleteDay = (weekId: string, dayId: string) => {
    const newWeeks = draft.weeks.map(w => {
      if (w.id === weekId) {
        return { ...w, days: w.days.filter(d => d.id !== dayId) }
      }
      return w
    })
    commitChange({ ...draft, weeks: newWeeks })
    if (activeDayId === dayId) {
      const firstDay = newWeeks[0]?.days[0]
      setActiveDayId(firstDay ? firstDay.id : null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 font-semibold text-sm text-ink border-b border-line flex items-center justify-between">
        <span>Outline</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {draft.weeks.map((week) => (
          <div key={week.id} className="space-y-1">
            <div className="flex items-center justify-between group px-2 py-1 rounded-sm hover:bg-surface-elevated transition-colors">
              <span className="text-sm font-semibold text-ink">{week.label}</span>
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                <button title="Duplicate week" onClick={() => openDuplicateDialog(week)} className="text-muted hover:text-ink">
                  <Copy size={13} />
                </button>
                <button title="Delete week" onClick={() => deleteWeek(week.id)} className="text-muted hover:text-ember-600">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div className="pl-3 border-l-2 border-line/50 ml-2 space-y-0.5">
              {week.days.map((day) => {
                const isActive = day.id === activeDayId
                return (
                  <div 
                    key={day.id} 
                    onClick={() => setActiveDayId(day.id)}
                    className={`group flex items-center justify-between px-2 py-1 rounded-sm cursor-pointer transition-colors text-sm ${
                      isActive 
                        ? 'bg-verde-100 text-verde-800 font-medium' 
                        : 'text-muted hover:bg-surface-elevated hover:text-ink'
                    }`}
                  >
                    <span>{day.name}</span>
                    <button 
                      title="Delete day" 
                      onClick={(e) => { e.stopPropagation(); deleteDay(week.id, day.id) }} 
                      className={`opacity-0 group-hover:opacity-100 text-muted hover:text-ember-600 transition-opacity ${isActive ? 'hover:text-verde-800' : ''}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
              
              <button 
                onClick={() => addDay(week.id)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-faint hover:text-ink transition-colors mt-1"
              >
                <Plus size={12} /> Add Day
              </button>
            </div>
          </div>
        ))}

        <div className="px-2 pt-2">
          <Button variant="ghost" size="sm" onClick={addWeek} className="w-full text-faint hover:text-ink">
            <Plus size={14} className="mr-1.5" /> Add Week
          </Button>
        </div>
      </div>

      <Dialog open={duplicateOpen} onClose={() => setDuplicateOpen(false)} title="Duplicate Week" width={400}>
        <div className="space-y-4">
          <Field label="Auto-Progression">
            <Select value={progressionMode} onChange={e => setProgressionMode(e.target.value as any)}>
              <option value="none">Exact Copy (No changes)</option>
              <option value="load">+2.5% Load on all sets</option>
              <option value="reps">+1 Rep on all sets</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setDuplicateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={executeDuplicate}>Duplicate</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
