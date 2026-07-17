import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Calendar as CalendarIcon, Clock, MapPin, User, Repeat, CalendarClock, X } from 'lucide-react'
import { Card, Button, Input, Select, EmptyState, Dialog, Label, Tag, toast } from '@/design'
import { appointmentsRepo, clientsRepo } from '@/db/repo'
import type { Appointment, RecurrenceFreq } from '@/db/types'
import { nowIso, newId, fullName } from '@/lib/core'
import { expandAll, describeRule, type Occurrence } from '@/lib/schedule'
import { format, parseISO, addDays } from 'date-fns'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function NewAppointmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const [form, setForm] = useState({
    title: '', clientId: '', date: new Date().toISOString().split('T')[0],
    time: '09:00', durationMinutes: '60', location: '', notes: '',
    repeat: 'none' as 'none' | RecurrenceFreq,
    ends: 'never' as 'never' | 'on' | 'after',
    until: '', count: '8',
    weekdays: [] as number[],
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const startObj = new Date(`${form.date}T${form.time}:00`)
    const endObj = new Date(startObj.getTime() + parseInt(form.durationMinutes) * 60000)
    const id = newId()

    const appt: Appointment = {
      id, createdAt: nowIso(), updatedAt: nowIso(),
      title: form.title || 'Session',
      clientId: form.clientId || undefined,
      start: startObj.toISOString(), end: endObj.toISOString(),
      location: form.location, notes: form.notes, status: 'scheduled',
    }
    if (form.repeat !== 'none') {
      appt.seriesId = id
      appt.recurrenceRule = {
        freq: form.repeat,
        byWeekday: form.repeat === 'weekly' && form.weekdays.length ? [...form.weekdays].sort() : undefined,
        until: form.ends === 'on' && form.until ? form.until : undefined,
        count: form.ends === 'after' ? Math.max(1, parseInt(form.count) || 1) : undefined,
      }
    }
    await appointmentsRepo.create(appt)
    toast(form.repeat === 'none' ? 'Appointment scheduled.' : 'Recurring series scheduled.')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="New appointment" width={520}>
      <form onSubmit={save} className="space-y-3">
        <div><Label>Title</Label><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Training session" /></div>
        <div>
          <Label>Client (optional)</Label>
          <Select value={form.clientId} onChange={e => set('clientId', e.target.value)}>
            <option value="">— none —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Label>Date</Label><Input type="date" required value={form.date} onChange={e => set('date', e.target.value)} /></div>
          <div><Label>Time</Label><Input type="time" required value={form.time} onChange={e => set('time', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Duration (min)</Label><Input type="number" required value={form.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={e => set('location', e.target.value)} /></div>
        </div>

        {/* Recurrence */}
        <div className="rounded-card border border-line p-3">
          <div className="flex items-center gap-2">
            <Repeat size={14} className="text-verde-600" />
            <Label>Repeat</Label>
          </div>
          <Select value={form.repeat} onChange={e => set('repeat', e.target.value as typeof form.repeat)} className="mt-1">
            <option value="none">Doesn't repeat</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </Select>

          {form.repeat === 'weekly' && (
            <div className="mt-2">
              <Label>On days (defaults to the start day)</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {WEEKDAYS.map((d, i) => (
                  <button
                    key={i} type="button"
                    onClick={() => set('weekdays', form.weekdays.includes(i) ? form.weekdays.filter(x => x !== i) : [...form.weekdays, i])}
                    className={`h-7 w-9 rounded-ctl border text-2xs font-medium ${form.weekdays.includes(i) ? 'border-transparent bg-verde-600 text-white' : 'border-line text-muted hover:bg-surface2'}`}
                  >{d}</button>
                ))}
              </div>
            </div>
          )}

          {form.repeat !== 'none' && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <Label>Ends</Label>
                <Select value={form.ends} onChange={e => set('ends', e.target.value as typeof form.ends)}>
                  <option value="never">Ongoing</option>
                  <option value="on">On date</option>
                  <option value="after">After N times</option>
                </Select>
              </div>
              {form.ends === 'on' && <div><Label>Until</Label><Input type="date" value={form.until} onChange={e => set('until', e.target.value)} /></div>}
              {form.ends === 'after' && <div><Label>Occurrences</Label><Input type="number" min="1" value={form.count} onChange={e => set('count', e.target.value)} /></div>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Schedule</Button>
        </div>
      </form>
    </Dialog>
  )
}

function RescheduleDialog({ occ, onClose }: { occ: Occurrence | null; onClose: () => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  if (occ && !date) {
    setDate(occ.date)
    setTime(format(parseISO(occ.start), 'HH:mm'))
  }

  async function apply() {
    if (!occ) return
    const master = occ.appointment
    const newStart = new Date(`${date}T${time}:00`)
    const durationMs = new Date(master.end).getTime() - new Date(master.start).getTime()
    const newEnd = new Date(newStart.getTime() + durationMs)

    if (occ.isRecurring) {
      // skip the original date in the series + drop a one-off at the new time
      await appointmentsRepo.update(master.id, { exceptions: [...(master.exceptions ?? []), occ.date] })
      await appointmentsRepo.create({
        title: master.title, clientId: master.clientId, location: master.location, notes: master.notes,
        seriesId: master.seriesId ?? master.id, status: 'scheduled',
        start: newStart.toISOString(), end: newEnd.toISOString(),
      })
    } else {
      await appointmentsRepo.update(master.id, { start: newStart.toISOString(), end: newEnd.toISOString() })
    }
    toast('Rescheduled.')
    setDate(''); setTime('')
    onClose()
  }

  return (
    <Dialog open={!!occ} onClose={() => { setDate(''); setTime(''); onClose() }} title="Reschedule" width={380}>
      <div className="space-y-3">
        <p className="text-xs text-muted">{occ?.appointment.title} — {occ?.date}{occ?.isRecurring ? ' (this occurrence only)' : ''}</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>New date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>New time</Label><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setDate(''); setTime(''); onClose() }}>Cancel</Button>
          <Button variant="primary" onClick={apply}>Move it</Button>
        </div>
      </div>
    </Dialog>
  )
}

export default function CalendarPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reschedule, setReschedule] = useState<Occurrence | null>(null)

  const masters = useLiveQuery(() => appointmentsRepo.masters(), [], [])
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const clientMap = new Map(clients.map(c => [c.id, c]))

  // Show a rolling window: last 7 days → next 60 days
  const rangeStart = format(addDays(new Date(), -7), 'yyyy-MM-dd')
  const rangeEnd = format(addDays(new Date(), 60), 'yyyy-MM-dd')
  const occurrences = expandAll(masters, rangeStart, rangeEnd)

  const grouped = new Map<string, Occurrence[]>()
  for (const o of occurrences) {
    if (!grouped.has(o.date)) grouped.set(o.date, [])
    grouped.get(o.date)!.push(o)
  }
  const days = Array.from(grouped.keys()).sort()

  async function skipOccurrence(o: Occurrence) {
    await appointmentsRepo.update(o.appointment.id, { exceptions: [...(o.appointment.exceptions ?? []), o.date] })
    toast('Occurrence canceled.')
  }
  async function deleteSeriesOrOne(o: Occurrence) {
    const m = o.appointment
    if (m.recurrenceRule) {
      const sid = m.seriesId ?? m.id
      const related = masters.filter(a => a.seriesId === sid || a.id === sid)
      for (const a of related) await appointmentsRepo.remove(a.id)
      toast('Series deleted.')
    } else {
      await appointmentsRepo.remove(m.id)
      toast('Appointment deleted.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Schedule</h1>
          <p className="mt-1 text-sm text-faint">Next 60 days · recurring sessions expand automatically</p>
        </div>
        <Button variant="primary" onClick={() => setDialogOpen(true)}><Plus size={16} className="mr-2" /> New appointment</Button>
      </div>

      {occurrences.length === 0 ? (
        <EmptyState icon={<CalendarIcon size={32} strokeWidth={1.5} />} title="Your schedule is clear" body="Book a session — set it to repeat weekly and it fills the calendar for you." action={<Button variant="primary" onClick={() => setDialogOpen(true)}><Plus size={14} /> New appointment</Button>} />
      ) : (
        <div className="space-y-8">
          {days.map(dayStr => {
            const isToday = dayStr === format(new Date(), 'yyyy-MM-dd')
            const isPast = dayStr < format(new Date(), 'yyyy-MM-dd')
            return (
              <div key={dayStr}>
                <h3 className={`mb-3 font-semibold ${isToday ? 'text-verde-600' : isPast ? 'text-faint' : 'text-muted'}`}>
                  {isToday ? 'Today · ' : ''}{format(parseISO(dayStr), 'EEEE, MMM d')}
                </h3>
                <div className="space-y-3">
                  {grouped.get(dayStr)!.map((o, idx) => {
                    const c = o.appointment.clientId ? clientMap.get(o.appointment.clientId) : undefined
                    return (
                      <Card key={o.appointment.id + idx} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-4">
                          <div className="pt-1 text-verde-600"><Clock size={20} strokeWidth={1.5} /></div>
                          <div>
                            <div className="font-mono tnum text-lg font-semibold text-ink">{format(parseISO(o.start), 'h:mm a')}</div>
                            <div className="text-2xs text-faint">{format(parseISO(o.start), 'h:mm a')} – {format(parseISO(o.end), 'h:mm a')}</div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink">{o.appointment.title}</span>
                            {o.isRecurring && <Tag><Repeat size={10} /> {describeRule(o.appointment.recurrenceRule)}</Tag>}
                          </div>
                          {c && <div className="mt-1 flex items-center text-sm text-muted"><User size={14} className="mr-1.5" /> {fullName(c)}</div>}
                          {o.appointment.location && <div className="mt-1 flex items-center text-sm text-muted"><MapPin size={14} className="mr-1.5" /> {o.appointment.location}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setReschedule(o)} title="Reschedule"><CalendarClock size={15} /></Button>
                          {o.isRecurring && <Button variant="ghost" size="sm" onClick={() => skipOccurrence(o)} title="Cancel this occurrence"><X size={15} /></Button>}
                          <Button variant="ghost" size="sm" className="text-ember-600" onClick={() => deleteSeriesOrOne(o)} title={o.isRecurring ? 'Delete whole series' : 'Delete'}>
                            {o.isRecurring ? 'Series' : <X size={15} />}
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <NewAppointmentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <RescheduleDialog occ={reschedule} onClose={() => setReschedule(null)} />
    </div>
  )
}
