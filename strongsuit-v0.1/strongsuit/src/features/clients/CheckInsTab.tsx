import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Inbox, Gauge, Flame, Trash2 } from 'lucide-react'
import { Card, Button, Input, EmptyState, Dialog, Label, toast } from '@/design'
import { checkInsRepo, habitsRepo, habitEntriesRepo } from '@/db/repo'
import type { CheckIn } from '@/db/types'
import { nowIso, newId, today as todayStr } from '@/lib/core'
import { readinessFromCheckIn, READINESS_COPY } from '@/lib/readiness'
import { currentStreak } from '@/lib/habits'

/** Daily habit checklist with streaks (spec §4.26b). */
function HabitsCard({ clientId }: { clientId: string }) {
  const habits = useLiveQuery(() => habitsRepo.forClient(clientId), [clientId], [])
  const entries = useLiveQuery(() => habitEntriesRepo.forClient(clientId), [clientId], [])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const today = todayStr()

  async function addHabit() {
    if (!name.trim()) return
    await habitsRepo.create({ clientId, name: name.trim(), active: true })
    setName(''); setAdding(false)
    toast('Habit added.')
  }

  const active = habits.filter(h => h.active)

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Flame size={14} /> Habits</div>
        <Button size="sm" variant="ghost" onClick={() => setAdding(a => !a)}><Plus size={13} /> Add habit</Button>
      </div>
      {adding && (
        <div className="mb-2 flex gap-2">
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 8,000 steps" onKeyDown={e => e.key === 'Enter' && addHabit()} />
          <Button size="sm" variant="primary" onClick={addHabit}>Add</Button>
        </div>
      )}
      {active.length === 0 ? (
        <p className="text-xs text-muted">No habits tracked yet — small daily targets (steps, water, protein, sleep) that build the readiness score over time.</p>
      ) : (
        <div className="space-y-1.5">
          {active.map(h => {
            const habitEntries = entries.filter(e => e.habitId === h.id)
            const doneToday = habitEntries.find(e => e.date === today)?.done ?? false
            const streak = currentStreak(habitEntries, today)
            return (
              <div key={h.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={doneToday} onChange={() => habitEntriesRepo.toggle(h.id, clientId, today)} className="accent-[var(--verde-600)]" />
                  {h.name}
                </label>
                <div className="flex items-center gap-2">
                  {streak > 0 && <span className="flex items-center gap-1 font-mono tnum text-2xs text-ember-600"><Flame size={11} /> {streak}d</span>}
                  <button onClick={async () => { await habitsRepo.update(h.id, { active: false }); toast(`${h.name} archived.`) }} className="text-faint hover:text-signal-600"><Trash2 size={12} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/** Today's-readiness card computed from the latest check-in (spec §4.18b). */
function ReadinessCard({ latest }: { latest: CheckIn }) {
  const r = readinessFromCheckIn(latest)
  if (!r) return null
  const tone = r.band === 'go' ? 'text-verde-600' : r.band === 'moderate' ? 'text-ember-600' : 'text-signal-600'
  const bar = r.band === 'go' ? 'bg-verde-600' : r.band === 'moderate' ? 'bg-ember-500' : 'bg-signal-600'
  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Gauge size={14} /> Readiness — from {latest.date}
        </div>
        <span className={`font-mono tnum text-xl font-semibold ${tone}`}>{r.score}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${r.score}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink">{READINESS_COPY[r.band]}</p>
      <p className="mt-1 text-2xs text-faint">
        Driven by: {r.drivers.join(', ')} · {r.source}
      </p>
    </Card>
  )
}

interface CheckInsTabProps {
  clientId: string
}

function LogCheckInDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    sleepHours: '',
    bodyweight: '',
    mood: '',
    energy: '',
    adherence: '',
    wins: '',
    blockers: ''
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    
    const checkin: CheckIn = {
      id: newId(),
      clientId,
      date: form.date,
      source: 'trainer',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      sleepHours: form.sleepHours ? parseFloat(form.sleepHours) : undefined,
      bodyweight: form.bodyweight ? parseFloat(form.bodyweight) : undefined,
      mood: form.mood ? parseInt(form.mood) : undefined,
      energy: form.energy ? parseInt(form.energy) : undefined,
      adherence: form.adherence ? parseInt(form.adherence) : undefined,
      answers: [
        { question: 'Wins', answer: form.wins },
        { question: 'Blockers', answer: form.blockers }
      ].filter(a => !!a.answer)
    }

    await checkInsRepo.create(checkin)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log Check-in">
      <form onSubmit={save} className="space-y-4">
        <div><Label>Date *</Label><Input 
          type="date" required
          value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} 
        /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Sleep (hrs)</Label><Input 
            type="number" step="0.5" 
            value={form.sleepHours} onChange={e => setForm({ ...form, sleepHours: e.target.value })} 
          /></div>
          <div><Label>Bodyweight</Label><Input 
            type="number" step="0.1" 
            value={form.bodyweight} onChange={e => setForm({ ...form, bodyweight: e.target.value })} 
          /></div>
          <div><Label>Mood (1-10)</Label><Input 
            type="number" min="1" max="10" 
            value={form.mood} onChange={e => setForm({ ...form, mood: e.target.value })} 
          /></div>
          <div><Label>Energy (1-10)</Label><Input 
            type="number" min="1" max="10" 
            value={form.energy} onChange={e => setForm({ ...form, energy: e.target.value })} 
          /></div>
          <div><Label>Adherence (%)</Label><Input 
            type="number" min="0" max="100" 
            value={form.adherence} onChange={e => setForm({ ...form, adherence: e.target.value })} 
          /></div>
        </div>
        
        <div>
          <Label>Wins</Label>
          <textarea 
            className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1" 
            rows={2} 
            value={form.wins} onChange={e => setForm({ ...form, wins: e.target.value })} 
          />
        </div>
        <div>
          <Label>Blockers</Label>
          <textarea 
            className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1" 
            rows={2} 
            value={form.blockers} onChange={e => setForm({ ...form, blockers: e.target.value })} 
          />
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Save Check-in</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function CheckInsTab({ clientId }: CheckInsTabProps) {
  const checkins = useLiveQuery(
    async () => {
      const all = await checkInsRepo.table.where('clientId').equals(clientId).sortBy('date')
      return all.reverse()
    },
    [clientId],
    []
  )

  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Check-ins</h3>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="mr-1.5" /> Log Check-in
        </Button>
      </div>

      <HabitsCard clientId={clientId} />

      {checkins.length === 0 ? (
        <EmptyState
          icon={<Inbox size={28} strokeWidth={1.5} />}
          title="No check-ins yet"
          body="Log a check-in manually or import data from a Companion App."
        />
      ) : (
        <div className="space-y-4">
          <ReadinessCard latest={checkins[0]} />
          {checkins.map(c => (
            <Card key={c.id}>
              <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
                <div className="font-medium">{c.date}</div>
                <div className="text-xs text-faint uppercase px-2 py-0.5 bg-line rounded">{c.source}</div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {c.sleepHours !== undefined && <div><div className="text-xs text-faint">Sleep</div><div className="font-medium">{c.sleepHours} hrs</div></div>}
                {c.bodyweight !== undefined && <div><div className="text-xs text-faint">Weight</div><div className="font-medium">{c.bodyweight}</div></div>}
                {c.mood !== undefined && <div><div className="text-xs text-faint">Mood</div><div className="font-medium">{c.mood}/10</div></div>}
                {c.energy !== undefined && <div><div className="text-xs text-faint">Energy</div><div className="font-medium">{c.energy}/10</div></div>}
                {c.adherence !== undefined && <div><div className="text-xs text-faint">Adherence</div><div className="font-medium">{c.adherence}%</div></div>}
              </div>

              {c.answers && c.answers.length > 0 && (
                <div className="space-y-3 bg-bg p-3 rounded border border-line">
                  {c.answers.map((ans, i) => (
                    <div key={i}>
                      <div className="text-xs font-semibold text-faint uppercase">{ans.question}</div>
                      <div className="text-sm mt-0.5 whitespace-pre-wrap">{ans.answer}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <LogCheckInDialog clientId={clientId} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
