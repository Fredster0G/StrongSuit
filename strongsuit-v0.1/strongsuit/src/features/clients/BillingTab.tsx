import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, CreditCard, ArrowDownLeft, ArrowUpRight, Scissors } from 'lucide-react'
import { Card, Button, Input, EmptyState, Dialog, Label, Select, Field } from '@/design'
import { paymentsRepo, clientsRepo } from '@/db/repo'
import type { Client, Payment, PaymentType } from '@/db/types'
import { nowIso, newId } from '@/lib/core'
import { gymCutForClient } from '@/lib/business'
import { format } from 'date-fns'

interface BillingTabProps {
  clientId: string
  client?: Client
}

/** What the facility takes from this client — percent of income or flat/month. */
function GymCutCard({ client, payments }: { client: Client; payments: Payment[] }) {
  const kind = client.gymCut?.kind ?? 'none'
  const value = client.gymCut?.value ?? 0
  const month = format(new Date(), 'yyyy-MM')
  const cutThisMonth = gymCutForClient(client, payments, month)

  const save = (nextKind: string, nextValue: number) => {
    if (nextKind === 'none' || nextValue <= 0) {
      return clientsRepo.update(client.id, { gymCut: undefined })
    }
    return clientsRepo.update(client.id, { gymCut: { kind: nextKind as 'percent' | 'flat-monthly', value: nextValue } })
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Scissors size={14} /> Gym's cut
        </div>
        {client.gymCut && (
          <span className="text-2xs text-faint">
            This month: <span className="font-mono tnum text-ember-600">−${cutThisMonth.toFixed(2)}</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="How the facility charges">
          <Select value={kind} onChange={e => save(e.target.value, value || (e.target.value === 'percent' ? 20 : 0))}>
            <option value="none">No cut — independent</option>
            <option value="percent">Percent of this client's income</option>
            <option value="flat-monthly">Flat fee per month</option>
          </Select>
        </Field>
        {kind !== 'none' && (
          <Field label={kind === 'percent' ? 'Percent (%)' : 'Fee ($/month)'}>
            <Input
              type="number" min="0" step={kind === 'percent' ? 1 : 5}
              max={kind === 'percent' ? 100 : undefined}
              defaultValue={value || ''}
              onBlur={e => save(kind, Number(e.target.value) || 0)}
              className="font-mono tnum"
            />
          </Field>
        )}
      </div>
      <p className="mt-2 text-2xs text-faint">
        Counted against your real profit on the Business page — income from this client is shown before the cut, your Profit Planner sees it after.
      </p>
    </Card>
  )
}

function RecordPaymentDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    type: 'payment' as PaymentType,
    method: 'transfer',
    memo: '',
    sessions: ''
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    
    const payment: Payment = {
      id: newId(),
      clientId,
      date: form.date,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      amount: parseFloat(form.amount) || 0,
      type: form.type,
      method: form.method,
      memo: form.memo,
      sessions: form.type === 'session-credit' ? parseInt(form.sessions) || 0 : undefined
    }

    await paymentsRepo.create(payment)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Record Transaction">
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Date *</Label><Input 
            type="date" required
            value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} 
          /></div>
          <div>
            <Label>Type</Label>
            <select 
              className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
              value={form.type} onChange={e => setForm({ ...form, type: e.target.value as PaymentType })}
            >
              <option value="payment">Payment</option>
              <option value="session-credit">Session Pack</option>
              <option value="refund">Refund</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><Label>Amount ($) *</Label><Input 
            type="number" step="0.01" required
            value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} 
          /></div>
          <div>
            <Label>Method</Label>
            <select 
              className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
              value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}
            >
              <option value="transfer">Bank Transfer / ACH</option>
              <option value="credit">Credit Card</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {form.type === 'session-credit' && (
          <div><Label>Sessions included *</Label><Input 
            type="number" required
            value={form.sessions} onChange={e => setForm({ ...form, sessions: e.target.value })} 
          /></div>
        )}

        <div><Label>Memo (optional)</Label><Input 
          value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} 
        /></div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Save Transaction</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function BillingTab({ clientId, client }: BillingTabProps) {
  const payments = useLiveQuery(
    async () => {
      const all = await paymentsRepo.table.where('clientId').equals(clientId).sortBy('date')
      return all.reverse()
    },
    [clientId],
    []
  )

  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="max-w-3xl">
      {client && <div className="mb-4"><GymCutCard client={client} payments={payments} /></div>}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Ledger</h3>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="mr-1.5" /> Record Transaction
        </Button>
      </div>

      {payments.length === 0 ? (
        <EmptyState 
          icon={<CreditCard size={28} strokeWidth={1.5} />}
          title="No transactions yet" 
          body="Record payments and session packs to keep your ledger accurate." 
        />
      ) : (
        <div className="space-y-4">
          {payments.map(p => (
            <Card key={p.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${p.type === 'refund' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                    {p.type === 'refund' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div>
                    <div className="font-medium text-ink">
                      {p.type === 'session-credit' ? 'Session Pack' : p.type === 'refund' ? 'Refund' : 'Payment'}
                    </div>
                    <div className="text-sm text-faint">
                      {p.date} • {p.method} {p.sessions ? `• ${p.sessions} sessions` : ''}
                    </div>
                    {p.memo && <div className="text-sm text-muted mt-1">{p.memo}</div>}
                  </div>
                </div>
                <div className={`font-semibold text-lg ${p.type === 'refund' ? 'text-red-500' : 'text-ink'}`}>
                  {p.type === 'refund' ? '-' : ''}${p.amount.toFixed(2)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <RecordPaymentDialog clientId={clientId} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
