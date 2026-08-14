import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, MapPin, Users, UserCog, CalendarClock, Lock } from 'lucide-react'
import { Card, SectionHeader, Button, EmptyState, Field, Input, Avatar, toast } from '@/design'
import { staffRepo, locationsRepo, clientsRepo, appointmentsRepo, trainerRepo } from '@/db/repo'
import { fullName } from '@/lib/core'
import { editionCapabilities, EDITION_NAMES } from '@/lib/edition'
import { expandAll } from '@/lib/schedule'
import { format, addDays } from 'date-fns'

export default function LocationDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const trainer = useLiveQuery(() => trainerRepo.get())
  const location = useLiveQuery(() => locationsRepo.get(id), [id])
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const masters = useLiveQuery(() => appointmentsRepo.masters(), [], [])
  const cap = editionCapabilities(trainer?.edition)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: '', address: '' })

  if (trainer === undefined || location === undefined) {
    return (
      <div className="mx-auto max-w-3xl">
        <SectionHeader title="Location" />
        <Card className="animate-pulse text-sm text-faint">Loading…</Card>
      </div>
    )
  }

  if (!cap.multiSeat) {
    return (
      <div className="mx-auto max-w-3xl">
        <SectionHeader title="Location" />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Lock size={28} className="text-faint" strokeWidth={1.5} />
          <p className="max-w-md text-sm text-muted">{cap.upgradeReason}</p>
          <p className="text-2xs text-faint">Currently on {EDITION_NAMES[cap.edition]}.</p>
        </Card>
      </div>
    )
  }

  if (!location) {
    return (
      <EmptyState
        title="Location not found"
        body="This location may have been removed."
        action={<Link to="/team"><Button>Back to Team</Button></Link>}
      />
    )
  }

  const locStaff = staff.filter(s => s.locationId === id)
  const locClients = clients.filter(c => c.locationId === id)

  const rangeStart = format(new Date(), 'yyyy-MM-dd')
  const rangeEnd = format(addDays(new Date(), 14), 'yyyy-MM-dd')
  const upcoming = expandAll(masters.filter(a => a.locationId === id), rangeStart, rangeEnd)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 10)
  const clientMap = new Map(clients.map(c => [c.id, c]))

  function startEdit() {
    setDraft({ name: location!.name, address: location!.address ?? '' })
    setEditing(true)
  }
  async function saveEdit() {
    if (!draft.name.trim()) return
    await locationsRepo.update(id, { name: draft.name.trim(), address: draft.address.trim() || undefined })
    toast('Location updated.')
    setEditing(false)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/team" className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={13} /> Team & locations
      </Link>

      <Card>
        {editing ? (
          <div className="space-y-3">
            <Field label="Name"><Input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></Field>
            <Field label="Address" hint="optional"><Input value={draft.address} onChange={e => setDraft(d => ({ ...d, address: e.target.value }))} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" onClick={saveEdit} disabled={!draft.name.trim()}>Save</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-ctl bg-verde-100 text-verde-700"><MapPin size={20} strokeWidth={1.5} /></div>
              <div>
                <h1 className="font-display text-xl font-bold text-ink">{location.name}</h1>
                <p className="text-xs text-faint">{location.address || 'No address on file'}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={startEdit}>Edit</Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="text-center"><div className="text-2xl font-semibold tabular-nums text-ink">{locStaff.length}</div><div className="text-2xs text-faint">Staff</div></Card>
        <Card className="text-center"><div className="text-2xl font-semibold tabular-nums text-ink">{locClients.length}</div><div className="text-2xs text-faint">Clients</div></Card>
        <Card className="text-center"><div className="text-2xl font-semibold tabular-nums text-ink">{upcoming.length}</div><div className="text-2xs text-faint">Upcoming (14d)</div></Card>
      </div>

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted"><UserCog size={14} /> Staff at this location</p>
        {locStaff.length === 0 ? (
          <p className="text-xs text-faint">No staff assigned here yet — set a staff member's location from Team.</p>
        ) : (
          <div className="space-y-2">
            {locStaff.map(s => (
              <Card key={s.id} pad={false} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm font-medium text-ink">{s.name}</span>
                <span className="text-2xs text-faint capitalize">{s.role}</span>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted"><Users size={14} /> Clients at this location</p>
        {locClients.length === 0 ? (
          <p className="text-xs text-faint">No clients assigned here yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {locClients.map(c => (
              <Link key={c.id} to={`/clients/${c.id}`}>
                <Card className="flex items-center gap-2.5 transition-colors hover:border-verde-600/40">
                  <Avatar person={c} size={24} />
                  <span className="text-sm text-ink">{fullName(c)}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted"><CalendarClock size={14} /> Upcoming (next 14 days)</p>
        {upcoming.length === 0 ? (
          <p className="text-xs text-faint">Nothing scheduled at this location in the next two weeks.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((o, i) => {
              const c = o.appointment.clientId ? clientMap.get(o.appointment.clientId) : undefined
              return (
                <Card key={o.appointment.id + i} pad={false} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-ink">{o.appointment.title}</span>
                    {c && <span className="ms-2 text-2xs text-faint">{fullName(c)}</span>}
                  </div>
                  <span className="font-mono tabular-nums text-2xs text-faint">{format(new Date(o.start), 'MMM d, h:mm a')}</span>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div className="pt-2">
        <Button variant="ghost" className="text-ember-600" onClick={async () => {
          await locationsRepo.remove(id)
          toast(`${location.name} removed.`)
          navigate('/team')
        }}>Delete location</Button>
      </div>
    </div>
  )
}
