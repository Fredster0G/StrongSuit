import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardList, Plus, FileSignature } from 'lucide-react'
import { programsRepo, clientsRepo } from '@/db/repo'
import type { Program, ProgramStatus } from '@/db/types'
import { stamp, fullName } from '@/lib/core'
import {
  Button, Select, Card, SectionHeader,
  EmptyState, Tag, Table
} from '@/design'

const STATUS_TONE: Record<ProgramStatus, 'neutral' | 'verde' | 'ember' | 'ember'> = {
  draft: 'neutral',
  active: 'verde',
  completed: 'ember', // placeholder tone
  template: 'ember' // placeholder tone
}

export default function ProgramsPage() {
  const navigate = useNavigate()
  const programs = useLiveQuery(() => programsRepo.all(), [], undefined)
  const clients = useLiveQuery(() => clientsRepo.all(), [], undefined)
  const [filter, setFilter] = useState<'all' | ProgramStatus>('all')

  const filtered = useMemo(() => {
    if (!programs) return []
    let list = programs
    if (filter !== 'all') {
      list = list.filter(p => p.status === filter)
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) // newest first
  }, [programs, filter])

  const loading = programs === undefined || clients === undefined

  const createNewProgram = async () => {
    const fresh = stamp({
      name: 'New Program',
      description: '',
      status: 'draft',
      weeks: []
    } as unknown as Program)
    await programsRepo.create(fresh)
    navigate(`/programs/${fresh.id}/edit`)
  }

  const getClientName = (clientId?: string) => {
    if (!clientId) return 'Template'
    const c = clients?.find(c => c.id === clientId)
    return c ? fullName(c) : 'Unknown Client'
  }

  return (
    <div className="max-w-5xl mx-auto">
      <SectionHeader
        title="Programs"
        action={
          <Button variant="primary" size="sm" onClick={createNewProgram}>
            <Plus size={14} /> New program
          </Button>
        }
      />

      <div className="mb-4">
        <Select className="w-40" value={filter} onChange={e => setFilter(e.target.value as any)}>
          <option value="all">All programs</option>
          <option value="draft">Drafts</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="template">Templates</option>
        </Select>
      </div>

      {loading ? (
        <Card className="animate-pulse text-sm text-faint">Loading programs…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} strokeWidth={1.25} />}
          title={filter === 'all' ? "No programs yet" : `No ${filter} programs`}
          body={filter === 'all' ? "Build your first program from scratch, or create a reusable template." : "Try a different filter."}
          action={filter === 'all' && <Button variant="primary" onClick={createNewProgram}><Plus size={14} /> Create your first program</Button>}
        />
      ) : (
        <Table head={<><th>Program Name</th><th>Client / Type</th><th>Status</th><th className="w-32">Last Updated</th></>}>
          {filtered.map(p => (
            <tr key={p.id}>
              <td>
                <Link to={`/programs/${p.id}/edit`} className="flex flex-col group">
                  <span className="font-medium text-ink group-hover:text-verde-600 transition-colors">
                    {p.name}
                  </span>
                  {p.description && <span className="text-xs text-muted truncate max-w-sm mt-0.5">{p.description}</span>}
                </Link>
              </td>
              <td>
                {p.status === 'template' ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted">
                    <FileSignature size={14} /> Template
                  </div>
                ) : (
                  <span className="text-sm text-ink">{getClientName(p.clientId)}</span>
                )}
              </td>
              <td><Tag tone={STATUS_TONE[p.status]}>{p.status}</Tag></td>
              <td className="font-mono tnum text-xs text-muted">
                {new Date(p.updatedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}
