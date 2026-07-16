import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Users, Plus, Search } from 'lucide-react'
import { clientsRepo } from '@/db/repo'
import type { Client, ClientStatus } from '@/db/types'
import { fullName, today } from '@/lib/core'
import {
  Button, Input, Select, Field, Textarea, Card, SectionHeader,
  EmptyState, Tag, Avatar, Dialog, Table, toast,
} from '@/design'

const STATUS_TONE: Record<ClientStatus, 'verde' | 'neutral' | 'red'> = {
  active: 'verde', paused: 'neutral', archived: 'red',
}

function NewClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', goals: '', injuries: '' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.firstName.trim()) return
    await clientsRepo.create({
      ...form,
      status: 'active', parqNotes: '', tags: [], startDate: today(),
    } as Omit<Client, 'id' | 'createdAt' | 'updatedAt'>)
    toast(`${form.firstName} added to your roster.`)
    setForm({ firstName: '', lastName: '', email: '', phone: '', goals: '', injuries: '' })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="New client" width={480}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><Input autoFocus value={form.firstName} onChange={set('firstName')} /></Field>
        <Field label="Last name"><Input value={form.lastName} onChange={set('lastName')} /></Field>
        <Field label="Email" hint="optional"><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone" hint="optional"><Input value={form.phone} onChange={set('phone')} /></Field>
        <div className="col-span-2">
          <Field label="Goals"><Textarea value={form.goals} onChange={set('goals')} placeholder="What are they training for?" /></Field>
        </div>
        <div className="col-span-2">
          <Field label="Injuries & limitations" hint="shows as a ribbon in the program builder">
            <Textarea value={form.injuries} onChange={set('injuries')} />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!form.firstName.trim()}>Add client</Button>
      </div>
    </Dialog>
  )
}

export default function ClientsPage() {
  const clients = useLiveQuery(() => clientsRepo.all(), [], undefined)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all')
  const [showNew, setShowNew] = useState(false)

  const filtered = useMemo(() => {
    if (!clients) return []
    const q = query.trim().toLowerCase()
    return clients
      .filter(c => (statusFilter === 'all' ? c.status !== 'archived' : c.status === statusFilter))
      .filter(c => !q || fullName(c).toLowerCase().includes(q) || c.tags.some(t => t.toLowerCase().includes(q)))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
  }, [clients, query, statusFilter])

  const loading = clients === undefined

  return (
    <div>
      <SectionHeader
        title="Clients"
        action={
          <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
            <Plus size={14} /> New client
          </Button>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <Input className="pl-8" placeholder="Search clients…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <Select className="w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value as never)}>
          <option value="all">All active</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {loading ? (
        <Card className="animate-pulse text-sm text-faint">Loading roster…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={28} strokeWidth={1.25} />}
          title={query ? 'No clients match that search' : 'No clients yet'}
          body={query ? 'Try a different name or tag.' : 'Add your first client and everything else — programs, logs, charts — builds from there.'}
          action={!query && <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={14} /> Add your first client</Button>}
        />
      ) : (
        <Table head={<><th>Client</th><th>Status</th><th>Goals</th><th className="w-24">Started</th></>}>
          {filtered.map(c => (
            <tr key={c.id}>
              <td>
                <Link to={`/clients/${c.id}`} className="flex items-center gap-2.5 font-medium text-ink hover:text-verde-600">
                  <Avatar person={c} src={c.photoDataUrl} size={28} />
                  {fullName(c)}
                </Link>
              </td>
              <td><Tag tone={STATUS_TONE[c.status]}>{c.status}</Tag></td>
              <td className="max-w-[280px] truncate text-muted">{c.goals || '—'}</td>
              <td className="font-mono tnum text-xs text-muted">{c.startDate}</td>
            </tr>
          ))}
        </Table>
      )}

      <NewClientDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  )
}
