import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, ClipboardList, FileDown, CheckCircle2, Circle, PenLine, ChevronRight } from 'lucide-react'
import { clientsRepo, trainerRepo, programsRepo, logsRepo, checkInsRepo, paymentsRepo, automationRulesRepo } from '@/db/repo'
import { fullName } from '@/lib/core'
import { APP_NAME } from '@/lib/brand'
import { Card, SectionHeader, Button, EmptyState, Tag } from '@/design'
import { evaluateAutomations, DEFAULT_RULES, type ClientFacts } from '@/lib/automations'
import { today } from '@/lib/core'

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
  const programs = useLiveQuery(() => programsRepo.all(), [], [])
  const logs = useLiveQuery(() => logsRepo.all(), [], [])
  const checkIns = useLiveQuery(() => checkInsRepo.all(), [], [])
  const payments = useLiveQuery(() => paymentsRepo.all(), [], [])
  const customRules = useLiveQuery(() => automationRulesRepo.active(), [], [])
  const [selectClientOpen, setSelectClientOpen] = useState(false)

  const hasBrand = !!trainer?.businessName
  const hasClient = clients.length > 0
  const hasProgram = programs.length > 0
  const setupDone = hasBrand && hasClient && hasProgram

  // Build per-client facts once, then let the automation engine (custom
  // rules + always-on defaults) decide what needs attention — spec §4.29.
  const facts = new Map<string, ClientFacts>()
  for (const c of clients) {
    const clientLogs = logs.filter(l => l.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    const clientCheckIns = checkIns.filter(ci => ci.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    const clientPayments = payments.filter(p => p.clientId === c.id)
    const purchasedSessions = clientPayments.filter(p => p.type === 'session-credit').reduce((a, p) => a + (p.sessions ?? 0), 0)
    const lastPayment = clientPayments.filter(p => p.type !== 'refund').sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    facts.set(c.id, {
      clientId: c.id,
      lastSessionDate: clientLogs.at(-1)?.date,
      lastCheckInDate: clientCheckIns.at(-1)?.date,
      // estimate only — there's no first-class "pack" decrement ledger yet
      sessionsRemaining: purchasedSessions > 0 ? Math.max(0, purchasedSessions - clientLogs.length) : undefined,
      lastPaymentDate: lastPayment?.date,
      hasScreening: !!c.screening,
      screeningCleared: c.screening?.cleared ?? false,
    })
  }
  const attention = evaluateAutomations({ clients, facts, rules: [...DEFAULT_RULES, ...customRules], today: today() })
  const clientMap = new Map(clients.map(c => [c.id, c]))

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
          <p className="mb-3 text-xs text-muted">Three steps and {APP_NAME} is fully yours. No account needed — there isn't one.</p>
          <div className="space-y-0.5">
            <ChecklistItem done={hasBrand} label="Add your business name & brand" to="/settings" />
            <ChecklistItem done={hasClient} label="Add your first client" to="/clients" />
            <ChecklistItem done={hasProgram} label="Build your first program" to="/programs" />
          </div>
        </Card>
      )}

      <div>
        <SectionHeader title="Needs attention" action={<Link to="/settings" className="text-2xs text-faint hover:text-ink">Customize rules</Link>} />
        {!hasClient ? (
          <EmptyState
            title="Nothing needs you yet"
            body="Once you have active clients, anyone who hasn't trained in a week — or trips a rule you set — shows up here."
          />
        ) : attention.length === 0 ? (
          <Card className="text-sm text-muted">Everyone's current. Nothing needs you right now.</Card>
        ) : (
          <div className="space-y-2">
            {attention.map((item, i) => {
              const c = clientMap.get(item.clientId)
              if (!c) return null
              return (
                <Link key={`${item.clientId}-${item.ruleId}-${i}`} to={`/clients/${c.id}`} className="block">
                  <Card className="flex items-center justify-between transition-colors hover:border-verde-600/40">
                    <span className="text-sm font-medium">{fullName(c)}</span>
                    <Tag tone={item.severity === 'warning' ? 'ember' : 'neutral'}>{item.message}</Tag>
                  </Card>
                </Link>
              )
            })}
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
              clients.map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/log?clientId=${c.id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-line bg-surface hover:border-verde-600/50 hover:bg-verde-100/60 transition-colors text-left"
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
