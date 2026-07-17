import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trophy, Plus, Medal } from 'lucide-react'
import { Card, SectionHeader, Button, EmptyState, Dialog, Field, Input, Select, Tag, toast } from '@/design'
import { clientsRepo, challengesRepo, logsRepo, metricsRepo } from '@/db/repo'
import type { ChallengeMetric } from '@/db/types'
import { leaderboard, METRIC_LABELS } from '@/lib/leaderboard'
import { fullName, today } from '@/lib/core'
import { format, subDays, addDays } from 'date-fns'

function NewChallengeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const [form, setForm] = useState({
    name: '', metric: 'volume' as ChallengeMetric,
    startDate: today(), endDate: format(addDays(new Date(), 28), 'yyyy-MM-dd'),
    participants: [] as string[],
  })
  async function save() {
    if (!form.name.trim() || form.participants.length === 0) return
    await challengesRepo.create({
      name: form.name.trim(), metric: form.metric, startDate: form.startDate, endDate: form.endDate,
      participantClientIds: form.participants,
    })
    toast(`${form.name} started.`)
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title="New challenge" width={480}>
      <div className="space-y-3">
        <Field label="Name"><Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. August Volume Challenge" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Metric">
            <Select value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value as ChallengeMetric }))}>
              {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Start"><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></Field>
          <Field label="End"><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></Field>
        </div>
        <Field label="Participants" hint="only opted-in clients can be ranked">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-ctl border border-line p-2">
            {clients.filter(c => c.leaderboardOptIn).length === 0 && (
              <p className="p-2 text-xs text-muted">No clients are opted into leaderboards yet — check "Include in cross-client leaderboards" on a client's Edit dialog.</p>
            )}
            {clients.filter(c => c.leaderboardOptIn).map(c => (
              <label key={c.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface2">
                <input
                  type="checkbox" checked={form.participants.includes(c.id)}
                  onChange={e => setForm(f => ({ ...f, participants: e.target.checked ? [...f.participants, c.id] : f.participants.filter(id => id !== c.id) }))}
                  className="accent-[var(--verde-600)]"
                />
                {fullName(c)}
              </label>
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim() || form.participants.length === 0}>Start challenge</Button>
        </div>
      </div>
    </Dialog>
  )
}

function Board({ metric, start, end, participantIds, clientMap }: {
  metric: ChallengeMetric; start: string; end: string; participantIds?: string[]
  clientMap: Map<string, { firstName: string; lastName: string }>
}) {
  const sessionLogs = useLiveQuery(() => logsRepo.all(), [], [])
  const metrics = useLiveQuery(() => metricsRepo.all(), [], [])
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const board = leaderboard({ metric, clients, sessionLogs, metrics, start, end, participantIds })
  const unit = METRIC_LABELS[metric].unit

  if (board.length === 0) {
    return <p className="px-1 py-3 text-xs text-muted">No qualifying activity yet in this window.</p>
  }

  return (
    <div className="space-y-1.5">
      {board.slice(0, 20).map(entry => {
        const c = clientMap.get(entry.clientId)
        return (
          <div key={entry.clientId} className="flex items-center justify-between rounded-ctl border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-2xs font-semibold ${entry.rank === 1 ? 'bg-ember-500 text-white' : 'bg-surface2 text-muted'}`}>
                {entry.rank}
              </span>
              <span className="text-sm text-ink">{c ? `${c.firstName} ${c.lastName}`.trim() : 'Unknown'}</span>
              {entry.rank === 1 && <Medal size={14} className="text-ember-600" />}
            </div>
            <span className="font-mono tnum text-sm font-semibold text-ink">{entry.value.toLocaleString()} <span className="text-2xs font-normal text-faint">{unit}</span></span>
          </div>
        )
      })}
    </div>
  )
}

export default function LeaderboardPage() {
  const [newOpen, setNewOpen] = useState(false)
  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const challenges = useLiveQuery(() => challengesRepo.all(), [], [])
  const clientMap = new Map(clients.map(c => [c.id, c]))
  const optedIn = clients.filter(c => c.leaderboardOptIn && c.status === 'active')

  const thisMonthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
  const last30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <SectionHeader title="Leaderboards" action={<Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} /> New challenge</Button>} />

      {optedIn.length === 0 ? (
        <EmptyState
          icon={<Trophy size={28} strokeWidth={1.5} />}
          title="No clients opted in yet"
          body="Leaderboards are opt-in — check &quot;Include in cross-client leaderboards&quot; on a client's Edit dialog, then this month's volume and session leaders show up here automatically."
        />
      ) : (
        <>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">This month — total volume</h3>
            <Board metric="volume" start={thisMonthStart} end={today()} clientMap={clientMap} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">Last 30 days — sessions logged</h3>
            <Board metric="sessions" start={last30} end={today()} clientMap={clientMap} />
          </div>
        </>
      )}

      {challenges.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted">Challenges</h3>
          <div className="space-y-6">
            {challenges.map(ch => (
              <Card key={ch.id}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-display text-base font-semibold text-ink">{ch.name}</p>
                    <p className="text-2xs text-faint">{ch.startDate} → {ch.endDate} · {METRIC_LABELS[ch.metric].label}</p>
                  </div>
                  <Tag tone={ch.endDate >= today() ? 'verde' : 'neutral'}>{ch.endDate >= today() ? 'active' : 'ended'}</Tag>
                </div>
                <Board metric={ch.metric} start={ch.startDate} end={ch.endDate} participantIds={ch.participantClientIds} clientMap={clientMap} />
              </Card>
            ))}
          </div>
        </div>
      )}

      <NewChallengeDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}
