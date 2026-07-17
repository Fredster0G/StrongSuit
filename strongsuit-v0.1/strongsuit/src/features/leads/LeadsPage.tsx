import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { UserPlus, Plus, ArrowRight, Trash2, CheckCircle2 } from 'lucide-react'
import { Card, SectionHeader, Button, EmptyState, Dialog, Field, Input, Textarea, toast } from '@/design'
import { leadsRepo, clientsRepo } from '@/db/repo'
import type { Lead, LeadStage } from '@/db/types'
import { today } from '@/lib/core'

const STAGES: { id: LeadStage; label: string }[] = [
  { id: 'new', label: 'New inquiry' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'trial', label: 'Trial / consult' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
]

function AddLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: '', notes: '' })
  async function save() {
    if (!form.name.trim()) return
    await leadsRepo.create({
      name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined,
      source: form.source.trim() || undefined, notes: form.notes.trim() || undefined, stage: 'new',
    })
    toast(`${form.name} added as a new lead.`)
    setForm({ name: '', email: '', phone: '', source: '', notes: '' })
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add lead" width={460}>
      <div className="space-y-3">
        <Field label="Name"><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" hint="optional"><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Phone" hint="optional"><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Field>
        </div>
        <Field label="Source" hint="e.g. referral, Instagram, walk-in"><Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} /></Field>
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

  const byStage = (stage: LeadStage) => leads.filter(l => l.stage === stage).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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

      {leads.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={28} strokeWidth={1.5} />}
          title="No leads yet"
          body="Log every inquiry here — walk-ins, referrals, trial requests — and move them through the pipeline until they convert to a client."
          action={<Button variant="primary" onClick={() => setAddOpen(true)}><Plus size={14} /> Add your first lead</Button>}
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

      <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ConvertDialog lead={converting} onClose={() => setConverting(null)} />
    </div>
  )
}
