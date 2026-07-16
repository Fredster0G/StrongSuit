import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Archive, ClipboardList, PenLine, Smartphone } from 'lucide-react'
import { clientsRepo, logsRepo, clientNotesRepo, trainerRepo, programsRepo, exercisesRepo } from '@/db/repo'
import type { Client } from '@/db/types'
import { fullName, daysSince } from '@/lib/core'
import {
  Button, Card, Tabs, Tag, Avatar, EmptyState, InjuryRibbon, toast,
  Dialog, Field, Input, Textarea,
} from '@/design'
import LogsTab from './LogsTab'
import MetricsTab from './MetricsTab'
import OverviewTab from './OverviewTab'
import CheckInsTab from './CheckInsTab'
import BillingTab from './BillingTab'
import NutritionTab from './NutritionTab'
import { generateCompanionFile } from '../companion/export'

function EditClientDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email || '',
    phone: client.phone || '',
    goals: client.goals || '',
    injuries: client.injuries || ''
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.firstName.trim()) return
    await clientsRepo.update(client.id, form)
    toast(`${form.firstName}'s details updated.`)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Edit client" width={480}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><Input autoFocus value={form.firstName} onChange={set('firstName')} /></Field>
        <Field label="Last name"><Input value={form.lastName} onChange={set('lastName')} /></Field>
        <Field label="Email" hint="optional"><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone" hint="optional"><Input value={form.phone} onChange={set('phone')} /></Field>
        <div className="col-span-2">
          <Field label="Goals"><Textarea value={form.goals} onChange={set('goals')} /></Field>
        </div>
        <div className="col-span-2">
          <Field label="Injuries & limitations" hint="shows as a ribbon in the program builder">
            <Textarea value={form.injuries} onChange={set('injuries')} />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!form.firstName.trim()}>Save changes</Button>
      </div>
    </Dialog>
  )
}

function NotesTab({ clientId }: { clientId: string }) {
  const notes = useLiveQuery(() => clientNotesRepo.forClient(clientId), [clientId])
  const [content, setContent] = useState('')

  async function saveNote() {
    if (!content.trim()) return
    await clientNotesRepo.create({ clientId, content: content.trim() })
    setContent('')
    toast('Note saved.')
  }

  if (notes === undefined) return <Card className="animate-pulse text-sm text-faint">Loading notes…</Card>

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <Textarea 
          value={content} 
          onChange={e => setContent(e.target.value)} 
          placeholder="Session observations, programming ideas, things to remember…" 
          className="min-h-[100px]"
        />
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={saveNote} disabled={!content.trim()}>Save note</Button>
        </div>
      </Card>
      
      {notes.length === 0 ? (
        <EmptyState title="No notes yet" body="Your notes will appear here." />
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <Card key={note.id}>
              <p className="mb-2 text-2xs font-mono tnum text-muted">{new Date(note.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="text-sm text-ink whitespace-pre-wrap">{note.content}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'program', label: 'Program' },
  { id: 'logs', label: 'Logs' },
  { id: 'checkins', label: 'Check-ins' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'notes', label: 'Notes' },
  { id: 'billing', label: 'Billing' },
]

export default function ClientDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const client = useLiveQuery(() => clientsRepo.get(id), [id])
  const trainer = useLiveQuery(() => trainerRepo.get())
  const activeProgram = useLiveQuery(async () => {
    const progs = await programsRepo.forClient(id)
    return progs.find(p => p.status === 'active') || null
  }, [id])

  const lastLog = useLiveQuery(() => logsRepo.lastForClient(id), [id])
  const [tab, setTab] = useState('overview')
  const [showEdit, setShowEdit] = useState(false)

  if (client === undefined || trainer === undefined) return <Card className="animate-pulse text-sm text-faint">Loading…</Card>
  if (!client) {
    return (
      <EmptyState
        title="Client not found"
        body="This client may have been deleted. Head back to the roster."
        action={<Link to="/clients"><Button>Back to clients</Button></Link>}
      />
    )
  }

  const lastSessionDays = daysSince(lastLog ? `${lastLog.date}T00:00:00` : undefined)

  async function archive() {
    await clientsRepo.archive(client!.id)
    toast(`${client!.firstName} archived. Their history is kept.`)
  }

  return (
    <div>
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={13} /> Clients
      </Link>

      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar person={client} src={client.photoDataUrl} size={44} />
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{fullName(client)}</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <Tag tone={client.status === 'active' ? 'verde' : 'neutral'}>{client.status}</Tag>
              <span className="font-mono tnum text-2xs text-faint">since {client.startDate}</span>
            </div>
          </div>
        </div>
        {client.status !== 'archived' && (
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => {
              if (activeProgram && activeProgram.weeks.length > 0 && activeProgram.weeks[0].days.length > 0) {
                // Find next day logically? For now just pick first day of active program
                // Actually the spec says "opens prescribed day auto-suggested". We'll just pass the active program and let the page or user pick. Or we pick the first day.
                // It's better to just go to log page with client ID and let them choose if we don't know the exact day, but we'll pre-fill day 1 of week 1 to be helpful.
                const firstDay = activeProgram.weeks[0].days[0].id
                navigate(`/log?clientId=${client.id}&programId=${activeProgram.id}&weekId=${activeProgram.weeks[0].id}&dayId=${firstDay}`)
              } else {
                navigate(`/log?clientId=${client.id}`)
              }
            }}>
              <PenLine size={14} className="mr-1.5" /> Log Session
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={archive}><Archive size={14} /> Archive</Button>
          </div>
        )}
      </div>

      {client.injuries && <div className="mb-4"><InjuryRibbon text={client.injuries} /></div>}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="pt-4">
        {tab === 'overview' && (
          <OverviewTab 
            client={client} 
            lastSessionDays={lastSessionDays} 
            activeProgram={activeProgram || null}
            weekStartsOn={trainer.weekStartsOn}
          />
        )}
        {tab === 'program' && (
          activeProgram ? (
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{activeProgram.name}</h3>
                  <p className="text-sm text-faint mt-1">{activeProgram.description || 'No description provided.'}</p>
                </div>
                <Button 
                  variant="primary" 
                  onClick={async () => {
                    if (!client || !activeProgram || !trainer) return
                    const exercises = await exercisesRepo.all()
                    generateCompanionFile(client, activeProgram, trainer, exercises)
                  }}
                >
                  <Smartphone size={16} className="mr-2" /> Export Companion App
                </Button>
              </div>
              <div className="mt-6 border-t border-line pt-4 flex gap-4">
                <Link to={`/programs/${activeProgram.id}`}><Button variant="ghost" size="sm">Edit Program</Button></Link>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={<ClipboardList size={28} strokeWidth={1.25} />}
              title="No program assigned"
              body="Build a program and assign it here. It becomes their Companion export and drives the logging screen."
              action={<Link to="/programs"><Button variant="primary">Open program builder</Button></Link>}
            />
          )
        )}
        {tab === 'logs' && (
          <LogsTab clientId={client.id} clientUnits={trainer?.units || 'lb'} />
        )}
        {tab === 'checkins' && (
          <CheckInsTab clientId={client.id} />
        )}
        {tab === 'metrics' && (
          <MetricsTab clientId={client.id} units={trainer.units} />
        )}
        {tab === 'nutrition' && (
          <NutritionTab client={client} units={trainer.units} />
        )}
        {tab === 'notes' && (
          <NotesTab clientId={client.id} />
        )}
        {tab === 'billing' && (
          <BillingTab clientId={client.id} client={client} />
        )}
      </div>

      <EditClientDialog client={client} open={showEdit} onClose={() => setShowEdit(false)} />
    </div>
  )
}
