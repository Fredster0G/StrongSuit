import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Wallet, Plus, Trash2, Target } from 'lucide-react'
import { format, subMonths } from 'date-fns'
import {
  Card, SectionHeader, Stat, EmptyState, Avatar, Button, IconButton,
  Dialog, Field, Input, Select, Tag, toast,
} from '@/design'
import { paymentsRepo, clientsRepo, expensesRepo, trainerRepo } from '@/db/repo'
import type { Expense, ExpenseCategory, ExpenseRecurrence } from '@/db/types'
import { fullName, today } from '@/lib/core'
import { profitPlan, expenseAppliesTo, gymCutForMonth } from '@/lib/business'

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'rent', label: 'Rent / gym fees' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'software', label: 'Software' },
  { value: 'education', label: 'Education / certs' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
]

const money = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function AddExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    date: today(), amount: '', category: 'rent' as ExpenseCategory,
    recurrence: 'monthly' as ExpenseRecurrence, memo: '',
  })
  const set = <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    const amount = Number(form.amount)
    if (!amount || amount <= 0) return
    await expensesRepo.create({
      date: form.date, amount, category: form.category,
      recurrence: form.recurrence, memo: form.memo.trim() || undefined,
    })
    toast('Expense added.')
    setForm(f => ({ ...f, amount: '', memo: '' }))
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add expense">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={set('amount')} autoFocus />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={set('date')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={form.category} onChange={set('category')}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Repeats" hint="Monthly counts every month">
            <Select value={form.recurrence} onChange={set('recurrence')}>
              <option value="monthly">Every month</option>
              <option value="one-time">One time</option>
            </Select>
          </Field>
        </div>
        <Field label="Memo" hint="Optional">
          <Input placeholder="e.g. Turf rental at Iron Works" value={form.memo} onChange={set('memo')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!Number(form.amount)}>Add expense</Button>
        </div>
      </div>
    </Dialog>
  )
}

export default function BusinessPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [targetDraft, setTargetDraft] = useState<string | null>(null)

  const trainer = useLiveQuery(() => trainerRepo.get())
  const payments = useLiveQuery(async () => {
    const all = await paymentsRepo.all()
    return all.sort((a, b) => b.date.localeCompare(a.date))
  }, [], [])
  const expenses = useLiveQuery(() => expensesRepo.all(), [], [])
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const allClients = useLiveQuery(() => clientsRepo.all(), [], [])
  const clientMap = new Map(clients.map(c => [c.id, c]))

  const thisMonth = format(new Date(), 'yyyy-MM')
  const rates = clients.map(c => c.sessionRate).filter((r): r is number => !!r && r > 0)
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : undefined

  const target = trainer?.monthlyProfitTarget ?? 0
  const gymCut = gymCutForMonth(allClients, payments, thisMonth)
  const plan = profitPlan({
    payments, expenses, target, month: thisMonth, today: today(), avgSessionRate: avgRate, gymCut,
  })

  const saveTarget = async () => {
    if (targetDraft === null) return
    const v = Math.max(0, Number(targetDraft) || 0)
    await trainerRepo.patch({ monthlyProfitTarget: v })
    setTargetDraft(null)
    toast(v ? `Profit goal set: ${money(v)}/month.` : 'Profit goal cleared.')
  }

  const monthExpenses = expenses
    .filter(e => expenseAppliesTo(e, thisMonth))
    .sort((a, b) => b.amount - a.amount)

  // last-month comparison + monthly chart (income only)
  const lastMonthStr = format(subMonths(new Date(), 1), 'yyyy-MM')
  const lastMonthIncome = payments
    .filter(p => p.date.startsWith(lastMonthStr) && p.type !== 'refund')
    .reduce((sum, p) => sum + p.amount, 0)

  const monthlyMap = new Map<string, number>()
  for (const p of payments) {
    if (p.type === 'refund') continue
    const month = p.date.substring(0, 7)
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + p.amount)
  }
  const months = Array.from(monthlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
  const maxMonthly = Math.max(...months.map(([, v]) => v), 1)

  return (
    <div className="max-w-5xl mx-auto">
      <SectionHeader title="Business" />

      <div className="space-y-8">
        {/* ===== Profit Planner ===== */}
        <Card>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Target size={16} strokeWidth={1.5} className="text-verde-600" />
                Profit planner — {format(new Date(), 'MMMM')}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Set what you need to clear this month. Income minus expenses does the rest.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              Monthly profit goal
              <Input
                type="number" min="0" step="50"
                className="!h-8 !w-32 font-mono tnum"
                placeholder="0"
                value={targetDraft ?? (target || '')}
                onChange={e => setTargetDraft(e.target.value)}
                onBlur={saveTarget}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </label>
          </div>

          <div className={`grid grid-cols-2 gap-4 ${plan.gymCut > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
            <Stat label="Income this month" value={money(plan.income)} />
            {plan.gymCut > 0 && (
              <Stat label="Gym's cut" value={`−${money(plan.gymCut)}`} tone="ember" />
            )}
            <Stat label="Expenses this month" value={money(plan.expenses)} tone={plan.expenses > 0 ? 'ember' : 'ink'} />
            <Stat label="Net profit" value={money(plan.net)} tone={plan.net >= 0 ? 'verde' : 'ember'} />
            {target > 0 ? (
              <Stat
                label={plan.gap > 0 ? 'Still to earn' : 'Past your goal'}
                value={money(Math.abs(plan.gap))}
                tone={plan.gap > 0 ? 'ember' : 'verde'}
              />
            ) : (
              <Stat label="Goal" value="—" />
            )}
          </div>

          {target > 0 && (
            <div className="mt-4 space-y-2">
              {/* progress toward goal */}
              <div className="h-2 overflow-hidden rounded-full bg-surface2">
                <div
                  className={`h-full rounded-full ${plan.net >= target ? 'bg-verde-600' : 'bg-ember-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, (plan.net / target) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-muted">
                {plan.gap <= 0
                  ? `Goal hit with ${plan.daysInMonth - plan.daysElapsed} days to spare.`
                  : plan.sessionsToClose !== null
                    ? `${money(plan.gap)} to go — about ${plan.sessionsToClose} more sessions at your average rate of ${money(avgRate!)} — and ${plan.daysInMonth - plan.daysElapsed} days left. At your current pace you'll finish the month around ${money(plan.projectedNet)} net${plan.onTrack ? ', on track.' : ', short of the goal.'}`
                    : `${money(plan.gap)} to go with ${plan.daysInMonth - plan.daysElapsed} days left. At your current pace you'll finish around ${money(plan.projectedNet)} net. Set session rates on your clients and this turns into "N sessions to go."`}
              </p>
            </div>
          )}
        </Card>

        {/* ===== Expenses ===== */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted">Expenses — {format(new Date(), 'MMMM')}</h3>
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Add expense</Button>
          </div>
          {monthExpenses.length === 0 ? (
            <EmptyState
              title="No expenses recorded"
              body="Add rent, insurance, software — anything you pay to coach. Monthly expenses carry forward automatically, and your real profit shows above."
              action={<Button size="sm" variant="primary" onClick={() => setAddOpen(true)}><Plus size={14} /> Add your first expense</Button>}
            />
          ) : (
            <div className="space-y-2">
              {monthExpenses.map((e: Expense) => (
                <Card key={e.id} pad={false} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {CATEGORIES.find(c => c.value === e.category)?.label ?? e.category}
                        {e.memo ? <span className="font-normal text-muted"> — {e.memo}</span> : null}
                      </div>
                      <div className="text-2xs text-faint">
                        {e.recurrence === 'monthly' ? `Since ${e.date}` : e.date}
                      </div>
                    </div>
                    {e.recurrence === 'monthly' && <Tag>Monthly</Tag>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tnum font-semibold text-ember-600">−{money(e.amount)}</span>
                    <IconButton
                      label="Delete expense"
                      onClick={async () => { await expensesRepo.remove(e.id); toast('Expense deleted.') }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ===== Income ===== */}
        {payments.length === 0 ? (
          <EmptyState
            icon={<Wallet size={32} strokeWidth={1.5} />}
            title="Your ledger is empty"
            body="Record payments on individual client profiles. They'll aggregate here with income tracking and outstanding balances."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Card><Stat label="This month" value={money(plan.income)} /></Card>
              <Card><Stat label="Last month" value={money(lastMonthIncome)} /></Card>
              <Card><Stat label="Transactions" value={payments.length} /></Card>
            </div>

            {months.length > 1 && (
              <Card>
                <h3 className="text-sm font-semibold text-muted mb-4">Monthly Income</h3>
                <div className="flex items-end gap-2 h-32">
                  {months.map(([month, amount]) => {
                    const height = (amount / maxMonthly) * 100
                    return (
                      <div key={month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-2xs font-mono text-faint">${Math.round(amount)}</span>
                        <div
                          className="w-full bg-verde-500 rounded-t transition-all"
                          style={{ height: `${height}%`, minHeight: 4 }}
                        />
                        <span className="text-2xs text-faint">{month.substring(5)}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            <div>
              <h3 className="text-sm font-semibold text-muted mb-3">Recent Transactions</h3>
              <div className="space-y-2">
                {payments.slice(0, 20).map(p => {
                  const c = clientMap.get(p.clientId)
                  return (
                    <Card key={p.id} pad={false} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {c && <Avatar person={c} size={28} />}
                          <div>
                            <div className="text-sm font-medium text-ink">
                              {c ? fullName(c) : 'Unknown client'}
                            </div>
                            <div className="text-2xs text-faint">
                              {p.date} · {p.type === 'session-credit' ? 'Session Pack' : p.type === 'refund' ? 'Refund' : 'Payment'}
                              {p.method ? ` · ${p.method}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className={`font-mono tnum font-semibold ${p.type === 'refund' ? 'text-red-500' : 'text-verde-600'}`}>
                          {p.type === 'refund' ? '-' : '+'}${p.amount.toFixed(2)}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <AddExpenseDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
