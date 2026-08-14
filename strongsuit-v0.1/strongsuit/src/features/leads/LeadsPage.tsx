import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { UserPlus, Plus, ArrowRight, Trash2, CheckCircle2 } from 'lucide-react'
import { Card, SectionHeader, Button, EmptyState, Dialog, Field, Input, Textarea, Select, toast } from '@/design'
import { leadsRepo, clientsRepo, staffRepo, locationsRepo } from '@/db/repo'
import type { Lead, LeadStage, Staff, Location } from '@/db/types'
import { today } from '@/lib/core'

const STAGES: { id: LeadStage; label: string }[] = [
  { id: 'new', label: 'New inquiry' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'trial', label: 'Trial / consult' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
]

function AddLeadDialog({ open, onClose, staff, locations }: { open: boolean; onClose: () => void; staff: Staff[]; locations: Location[] }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: '', notes: '', staffId: '', locationId: '' })
  async function save() {
    if (!form.name.trim()) return
    await leadsRepo.create({
      name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined,
      source: form.source.trim() || undefined, notes: form.notes.trim() || undefined, stage: 'new',
      staffId: form.staffId || undefined, locationId: form.locationId || undefined,
    })
    toast(`${form.name} added as a new lead.`)
    setForm({ name: '', email: '', phone: '', source: '', notes: '', staffId: '', locationId: '' })
    onClose()
  }
  const showRouting = staff.length > 0 || locations.length > 0
  return (
    <Dialog open={open} onClose={onClose} title="Add lead" width={460}>
      <div className="space-y-3">
        <Field label="Name"><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" hint="optional"><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Phone" hint="optional"><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Field>
        </div>
        <Field label="Source" hint="e.g. referral, Instagram, walk-in"><Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} /></Field>
        {showRouting && (
          <div className="grid grid-cols-2 gap-3">
            {staff.length > 0 && (
              <Field label="Route to" hint="optional">
                <Select value={form.staffId} onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}>
                  <option value="">— unassigned —</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            {locations.length > 0 && (
              <Field label="Location" hint="optional">
                <Select value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}>
                  <option value="">— unassigned —</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}
        <Field label="Notes"><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>Add lead</Button>
        </div>
      </div>
    </Dialog>
  )
}

function ConvertDialog({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const [rate, setRate] = useState('')
  async function convert() {
    if (!lead) return
    const client = await clientsRepo.create({
      firstName: lead.name.split(' ')[0] || lead.name,
      lastName: lead.name.split(' ').slice(1).join(' ') || '',
      email: lead.email, phone: lead.phone, status: 'active',
      goals: lead.notes || '', injuries: '', parqNotes: '', tags: [],
      startDate: today(), sessionRate: rate ? Number(rate) : undefined,
      // Whichever coach/location was already working this lead keeps the
      // client — the routing shouldn't reset itself just because the lead
      // converted.
      staffId: lead.staffId, locationId: lead.locationId,
    })
    await leadsRepo.update(lead.id, { stage: 'won', convertedClientId: client.id })
    toast(`${lead.name} converted to a client.`)
    setRate('')
    onClose()
  }
  return (
    <Dialog open={!!lead} onClose={onClose} title="Convert to client" width={380}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Create a client record for <span className="font-medium text-ink">{lead?.name}</span>.</p>
        <Field label="Session rate" hint="optional, can set later"><Input type="number" min="0" value={rate} onChange={e => setRate(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={convert}><CheckCircle2 size={14} /> Convert</Button>
        </div>
      </div>
    </Dialog>
  )
}

export default function LeadsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [converting, setConverting] = useState<Lead | null>(null)
  const leads = useLiveQuery(() => leadsRepo.all(), [], [])
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const [staffFilter, setStaffFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const staffMap = new Map(staff.map(s => [s.id, s]))
  const locationMap = new Map(locations.map(l => [l.id, l]))

  const showScope = staff.length > 0 || locations.length > 0
  const scoped = leads.filter(l =>
    (!staffFilter || l.staffId === staffFilter) && (!locationFilter || l.locationId === locationFilter),
  )

  const byStage = (stage: LeadStage) => scoped.filter(l => l.stage === stage).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const advance = async (lead: Lead) => {
    const order: LeadStage[] = ['new', 'contacted', 'trial', 'won']
    const idx = order.indexOf(lead.stage)
    if (lead.stage === 'trial') { setConverting(lead); return }
    if (idx >= 0 && idx < order.length - 1) {
      await leadsRepo.update(lead.id, { stage: order[idx + 1] })
      toast(`${lead.name} moved to ${STAGES.find(s => s.id === order[idx + 1])?.label}.`)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader title="Leads" action={<Button variant="primary" onClick={() => setAddOpen(true)}><Plus size={14} /> Add lead</Button>} />

      {showScope && leads.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {staff.length > 0 && (
            <Field label="Coach">
              <Select className="!h-8 w-44" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
                <option value="">All coaches</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          {locations.length > 0 && (
            <Field label="Location">
              <Select className="!h-8 w-44" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
                <option value="">All locations</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      {leads.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={28} strokeWidth={1.5} />}
          title="No leads yet"
          body="Log every inquiry here — walk-ins, referrals, trial requests — and move them through the pipeline until they convert to a client."
          action={<Button variant="primary" onClick={() => setAddOpen(true)}><Plus size={14} /> Add your first lead</Button>}
        />
      ) : scoped.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={28} strokeWidth={1.5} />}
          title="No leads match this scope"
          body="Try a different coach or location."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {STAGES.map(stage => (
            <div key={stage.id}>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-faint">{stage.label} · {byStage(stage.id).length}</h3>
              <div className="space-y-2">
                {byStage(stage.id).map(lead => (
                  <Card key={lead.id} pad={false} className="p-3">
                    <div className="text-sm font-medium text-ink">{lead.name}</div>
                    {lead.source && <div className="text-2xs text-faint">via {lead.source}</div>}
                    {lead.notes && <div className="mt-1 line-clamp-2 text-2xs text-muted">{lead.notes}</div>}
                    {(lead.staffId || lead.locationId) && (
                      <div className="mt-1 text-2xs text-faint">
                        {lead.staffId && (staffMap.get(lead.staffId)?.name ?? 'Unassigned coach')}
                        {lead.staffId && lead.locationId && ' · '}
                        {lead.locationId && (locationMap.get(lead.locationId)?.name ?? 'Unassigned location')}
                      </div>
                    )}
                    {showScope && (
                      <div className="mt-1.5 flex gap-1">
                        {staff.length > 0 && (
                          <Select
                            value={lead.staffId ?? ''}
                            onChange={e => leadsRepo.update(lead.id, { staffId: e.target.value || undefined })}
                            className="!h-6 min-w-0 flex-1 !px-1.5 !pe-5 text-2xs text-muted"
                            title="Route to a coach"
                          >
                            <option value="">— coach —</option>
                            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </Select>
                        )}
                        {locations.length > 0 && (
                          <Select
                            value={lead.locationId ?? ''}
                            onChange={e => leadsRepo.update(lead.id, { locationId: e.target.value || undefined })}
                            className="!h-6 min-w-0 flex-1 !px-1.5 !pe-5 text-2xs text-muted"
                            title="Assign a location"
                          >
                            <option value="">— location —</option>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </Select>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      {stage.id !== 'won' && stage.id !== 'lost' ? (
                        <button onClick={() => advance(lead)} className="flex items-center gap-1 text-2xs font-medium text-verde-600 hover:underline">
                          {lead.stage === 'trial' ? 'Convert' : 'Advance'} <ArrowRight size={11} />
                        </button>
                      ) : <span />}
                      <div className="flex items-center gap-1">
                        {stage.id !== 'lost' && stage.id !== 'won' && (
                          <button onClick={() => leadsRepo.update(lead.id, { stage: 'lost' })} className="text-2xs text-faint hover:text-ember-600">Mark lost</button>
                        )}
                        <button onClick={async () => { await leadsRepo.remove(lead.id); toast('Lead removed.') }} className="text-faint hover:text-signal-600"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} staff={staff} locations={locations} />
      <ConvertDialog lead={converting} onClose={() => setConverting(null)} />
    </div>
  )
}
