import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Users, MapPin, Plus, Trash2 } from 'lucide-react'
import {
  Card, SectionHeader, Button, EmptyState, Dialog, Field, Input, Select, Tag, Stat, toast,
} from '@/design'
import { staffRepo, locationsRepo, clientsRepo, paymentsRepo } from '@/db/repo'
import type { StaffRole, Location } from '@/db/types'
import { staffCommissionForMonth } from '@/lib/business'
import { format } from 'date-fns'

const ROLE_LABEL: Record<StaffRole, string> = { owner: 'Owner', coach: 'Coach', 'front-desk': 'Front desk' }

function AddStaffDialog({ open, onClose, locations }: { open: boolean; onClose: () => void; locations: Location[] }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'coach' as StaffRole, commissionPercent: '', locationId: '' })

  async function save() {
    if (!form.name.trim()) return
    await staffRepo.create({
      name: form.name.trim(), email: form.email.trim() || undefined, role: form.role,
      commissionPercent: form.commissionPercent ? Number(form.commissionPercent) : undefined,
      locationId: form.locationId || undefined, active: true,
    })
    toast(`${form.name} added to the team.`)
    setForm({ name: '', email: '', role: 'coach', commissionPercent: '', locationId: '' })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add staff member">
      <div className="space-y-3">
        <Field label="Name"><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" hint="optional"><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Role">
            <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as StaffRole }))}>
              <option value="owner">Owner</option>
              <option value="coach">Coach</option>
              <option value="front-desk">Front desk</option>
            </Select>
          </Field>
          <Field label="Commission %" hint="of their clients' income">
            <Input type="number" min="0" max="100" value={form.commissionPercent} onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))} />
          </Field>
          <Field label="Location" hint="optional">
            <Select value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}>
              <option value="">— unassigned —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>Add to team</Button>
        </div>
      </div>
    </Dialog>
  )
}

function AddLocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', address: '' })
  async function save() {
    if (!form.name.trim()) return
    await locationsRepo.create({ name: form.name.trim(), address: form.address.trim() || undefined })
    toast(`${form.name} added.`)
    setForm({ name: '', address: '' })
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add location">
      <div className="space-y-3">
        <Field label="Name"><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Downtown studio" /></Field>
        <Field label="Address" hint="optional"><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>Add location</Button>
        </div>
      </div>
    </Dialog>
  )
}

export default function TeamPage() {
  const [staffOpen, setStaffOpen] = useState(false)
  const [locOpen, setLocOpen] = useState(false)
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const payments = useLiveQuery(() => paymentsRepo.all(), [], [])
  const thisMonth = format(new Date(), 'yyyy-MM')

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <SectionHeader title="Team & locations" action={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setLocOpen(true)}><MapPin size={14} /> Add location</Button><Button size="sm" variant="primary" onClick={() => setStaffOpen(true)}><Plus size={14} /> Add staff</Button></div>} />

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted">Staff — {format(new Date(), 'MMMM')} commissions</h3>
        {staff.length === 0 ? (
          <EmptyState
            icon={<Users size={28} strokeWidth={1.5} />}
            title="Solo for now"
            body="Add a coach or front-desk teammate. Assign clients to them on the client's Overview and Coachwright tracks their commission automatically."
            action={<Button variant="primary" onClick={() => setStaffOpen(true)}><Plus size={14} /> Add staff</Button>}
          />
        ) : (
          <div className="space-y-2">
            {staff.map(s => {
              const assigned = clients.filter(c => c.staffId === s.id)
              const commission = staffCommissionForMonth(s, clients, payments, thisMonth)
              const loc = locations.find(l => l.id === s.locationId)
              return (
                <Card key={s.id} pad={false} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{s.name}</span>
                      <Tag tone={s.role === 'owner' ? 'verde' : 'neutral'}>{ROLE_LABEL[s.role]}</Tag>
                      {!s.active && <Tag tone="ember">inactive</Tag>}
                    </div>
                    <div className="mt-0.5 text-2xs text-faint">
                      {assigned.length} client{assigned.length === 1 ? '' : 's'}{loc ? ` · ${loc.name}` : ''}{s.commissionPercent ? ` · ${s.commissionPercent}% commission` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.commissionPercent ? <Stat label="Owed this month" value={`$${commission.toFixed(2)}`} tone="verde" /> : null}
                    <Button size="sm" variant="ghost" className="text-ember-600" onClick={async () => { await staffRepo.remove(s.id); toast(`${s.name} removed.`) }}><Trash2 size={14} /></Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted">Locations</h3>
        {locations.length === 0 ? (
          <EmptyState
            icon={<MapPin size={28} strokeWidth={1.5} />}
            title="Single location"
            body="Running more than one studio? Add locations and assign clients and appointments to each — reports and the calendar can filter by location."
            action={<Button variant="primary" onClick={() => setLocOpen(true)}><Plus size={14} /> Add location</Button>}
          />
        ) : (
          <div className="space-y-2">
            {locations.map(l => {
              const count = clients.filter(c => c.locationId === l.id).length
              return (
                <Card key={l.id} pad={false} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-ink">{l.name}</div>
                    <div className="text-2xs text-faint">{l.address || 'No address on file'} · {count} client{count === 1 ? '' : 's'}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-ember-600" onClick={async () => { await locationsRepo.remove(l.id); toast(`${l.name} removed.`) }}><Trash2 size={14} /></Button>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <AddStaffDialog open={staffOpen} onClose={() => setStaffOpen(false)} locations={locations} />
      <AddLocationDialog open={locOpen} onClose={() => setLocOpen(false)} />
    </div>
  )
}
