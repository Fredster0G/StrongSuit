import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Calendar as CalendarIcon, Clock, MapPin, User, Trash2 } from 'lucide-react'
import { Card, Button, Input, EmptyState, Dialog, Label } from '@/design'
import { appointmentsRepo, clientsRepo } from '@/db/repo'
import type { Appointment } from '@/db/types'
import { nowIso, newId, fullName } from '@/lib/core'
import { format, parseISO } from 'date-fns'

function NewAppointmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const [form, setForm] = useState({
    title: '',
    clientId: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    durationMinutes: '60',
    location: '',
    notes: ''
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    
    // Combine date and time
    const startObj = new Date(`${form.date}T${form.time}:00`)
    const endObj = new Date(startObj.getTime() + parseInt(form.durationMinutes) * 60000)

    const apt: Appointment = {
      id: newId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      title: form.title || 'Session',
      clientId: form.clientId || undefined,
      start: startObj.toISOString(),
      end: endObj.toISOString(),
      location: form.location,
      notes: form.notes
    }

    await appointmentsRepo.create(apt)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Appointment">
      <form onSubmit={save} className="space-y-4">
        <div><Label>Title *</Label><Input 
          required
          value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} 
          placeholder="e.g. Training Session"
        /></div>

        <div>
          <Label>Client (optional)</Label>
          <select 
            className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
            value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })}
          >
            <option value="">-- None --</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{fullName(c)}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Label>Date *</Label><Input 
              type="date" required
              value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} 
            />
          </div>
          <div><Label>Time *</Label><Input 
            type="time" required
            value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} 
          /></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><Label>Duration (min) *</Label><Input 
            type="number" required
            value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: e.target.value })} 
          /></div>
          <div><Label>Location</Label><Input 
            value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} 
          /></div>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Schedule</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function CalendarPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  
  // Load all appointments and sort by start time
  const appointments = useLiveQuery(
    async () => {
      const all = await appointmentsRepo.all()
      return all.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    },
    [],
    []
  )

  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const clientMap = new Map(clients.map(c => [c.id, c]))

  // Group by day
  const grouped = new Map<string, Appointment[]>()
  for (const apt of appointments) {
    const day = format(parseISO(apt.start), 'yyyy-MM-dd')
    if (!grouped.has(day)) grouped.set(day, [])
    grouped.get(day)!.push(apt)
  }

  const days = Array.from(grouped.keys()).sort()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Schedule</h1>
          <p className="text-faint mt-1 text-sm">Upcoming sessions and events</p>
        </div>
        <Button variant="primary" onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="mr-2" /> New Appointment
        </Button>
      </div>

      {appointments.length === 0 ? (
        <EmptyState 
          icon={<CalendarIcon size={32} strokeWidth={1.5} />}
          title="Your schedule is clear" 
          body="Book a session to see it here."
        />
      ) : (
        <div className="space-y-8">
          {days.map(dayStr => {
            const dayApts = grouped.get(dayStr)!
            const isToday = dayStr === format(new Date(), 'yyyy-MM-dd')

            return (
              <div key={dayStr}>
                <h3 className={`font-semibold mb-3 ${isToday ? 'text-verde-500' : 'text-muted'}`}>
                  {isToday ? 'Today, ' : ''}{format(parseISO(dayStr), 'EEEE, MMM d')}
                </h3>
                <div className="space-y-3">
                  {dayApts.map(apt => {
                    const c = apt.clientId ? clientMap.get(apt.clientId) : undefined
                    return (
                      <Card key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="pt-1 text-verde-600">
                            <Clock size={20} strokeWidth={1.5} />
                          </div>
                          <div>
                            <div className="font-semibold text-lg">{format(parseISO(apt.start), 'h:mm a')}</div>
                            <div className="text-sm text-faint">
                              {format(parseISO(apt.start), 'h:mm a')} - {format(parseISO(apt.end), 'h:mm a')}
                            </div>
                          </div>
                        </div>

                        <div className="flex-1">
                          <div className="font-medium text-ink">{apt.title}</div>
                          {c && (
                            <div className="text-sm flex items-center text-muted mt-1">
                              <User size={14} className="mr-1.5" /> {fullName(c)}
                            </div>
                          )}
                          {apt.location && (
                            <div className="text-sm flex items-center text-muted mt-1">
                              <MapPin size={14} className="mr-1.5" /> {apt.location}
                            </div>
                          )}
                        </div>
                        
                        <div>
                           <Button variant="ghost" size="sm" className="text-ember-600" onClick={() => appointmentsRepo.remove(apt.id)}>
                             <Trash2 size={16} />
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
    </div>
  )
}
