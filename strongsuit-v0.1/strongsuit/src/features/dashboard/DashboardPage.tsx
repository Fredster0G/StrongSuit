import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, ClipboardList, FileDown, CheckCircle2, Circle, PenLine, ChevronRight } from 'lucide-react'
import { clientsRepo, trainerRepo } from '@/db/repo'
import { db } from '@/db/schema'
import { daysSince, fullName } from '@/lib/core'
import { Card, SectionHeader, Button, EmptyState, Tag } from '@/design'

function ChecklistItem({ done, label, to }: { done: boolean; label: string; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-ctl px-2 py-1.5 text-sm hover:bg-surface2">
      {done
        ? <CheckCircle2 size={16} className="text-verde-600" />
        : <Circle size={16} className="text-faint" />}
      <span className={done ? 'text-faint line-through' : 'text-ink'}>{label}</span>
    </Link>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const trainer = useLiveQuery(() => trainerRepo.get())
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const programCount = useLiveQuery(() => db.programs.count(), [], 0)
  const logs = useLiveQuery(() => db.sessionLogs.toArray(), [], [])
  const [selectClientOpen, setSelectClientOpen] = useState(false)

  const hasBrand = !!trainer?.businessName
  const hasClient = (clients?.length ?? 0) > 0
  const hasProgram = (programCount ?? 0) > 0
  const setupDone = hasBrand && hasClient && hasProgram

  // Needs-attention: active clients with no session in 7+ days
  const staleClients = (clients ?? [])
    .map(c => {
      const last = (logs ?? []).filter(l => l.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
      return { c, days: daysSince(last ? `${last.date}T00:00:00` : undefined) }
    })
    .filter(x => x.days === null || x.days >= 7)

  return (
    <div className="space-y-8">
      <div>
        <SectionHeader title="Today" />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => setSelectClientOpen(true)}>
            <PenLine size={14} /> Log a session
          </Button>
          <Link to="/clients"><Button size="sm"><Plus size={14} /> New client</Button></Link>
          <Link to="/programs"><Button size="sm"><ClipboardList size={14} /> Build program</Button></Link>
          <Link to="/settings"><Button size="sm"><FileDown size={14} /> Back up now</Button></Link>
        </div>
      </div>

      {!setupDone && (
        <Card>
          <p className="mb-1 font-display text-base font-semibold">Get set up</p>
          <p className="mb-3 text-xs text-muted">Three steps and Strongsuit is fully yours. No account needed — there isn't one.</p>
          <div className="space-y-0.5">
            <ChecklistItem done={hasBrand} label="Add your business name & brand" to="/settings" />
            <ChecklistItem done={hasClient} label="Add your first client" to="/clients" />
            <ChecklistItem done={hasProgram} label="Build your first program" to="/programs" />
          </div>
        </Card>
      )}

      <div>
        <SectionHeader title="Needs attention" />
        {!hasClient ? (
          <EmptyState
            title="Nothing needs you yet"
            body="Once you have active clients, anyone who hasn't trained in a week shows up here."
          />
        ) : staleClients.length === 0 ? (
          <Card className="text-sm text-muted">Everyone's current. Nothing needs you right now.</Card>
        ) : (
          <div className="space-y-2">
            {staleClients.map(({ c, days }) => (
              <Link key={c.id} to={`/clients/${c.id}`} className="block">
                <Card className="flex items-center justify-between transition-colors hover:border-verde-600/40">
                  <span className="text-sm font-medium">{fullName(c)}</span>
                  <Tag tone="ember">{days === null ? 'No sessions yet' : `${days}d since last session`}</Tag>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <dialog 
        open={selectClientOpen}
        onCancel={() => setSelectClientOpen(false)}
        className="m-0 h-full max-h-none w-full max-w-sm ml-auto bg-surface shadow-sheet backdrop:bg-iron-950/20 backdrop:backdrop-blur-sm open:animate-slide-left p-0 z-50"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-4">
            <h2 className="text-lg font-bold text-ink">Select Client</h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectClientOpen(false)}>Cancel</Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!hasClient ? (
               <p className="text-faint text-sm">You have no active clients to log for.</p>
            ) : (
              clients?.map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/log?clientId=${c.id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-line bg-surface hover:border-brand-500/50 hover:bg-brand-50 dark:hover:bg-brand-950/20 transition-colors text-left"
                >
                  <span className="font-semibold text-ink">{fullName(c)}</span>
                  <ChevronRight size={16} className="text-faint" />
                </button>
              ))
            )}
          </div>
        </div>
      </dialog>
    </div>
  )
}
