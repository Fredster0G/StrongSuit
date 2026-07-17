import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, CreditCard, ArrowDownLeft, ArrowUpRight, Scissors, FileText, Trash2, ExternalLink } from 'lucide-react'
import { Card, Button, Input, EmptyState, Dialog, Label, Select, Field, Stat, Tag, toast, toastError } from '@/design'
import { paymentsRepo, clientsRepo, invoicesRepo, couponsRepo } from '@/db/repo'
import type { Client, Payment, PaymentType, Invoice, InvoiceLineItem, InvoiceStatus } from '@/db/types'
import { nowIso, newId } from '@/lib/core'
import { gymCutForClient, invoiceTotals, clientBalance } from '@/lib/business'
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

function NewInvoiceDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([{ description: '', amount: 0, qty: 1 }])
  const [couponCode, setCouponCode] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [paymentLink, setPaymentLink] = useState('')
  const [applied, setApplied] = useState<{ code: string; discountAmount: number } | null>(null)

  const totals = invoiceTotals(lineItems, applied ? { id: '', createdAt: '', updatedAt: '', code: applied.code, kind: 'flat', value: applied.discountAmount, active: true } : null)

  async function checkCoupon() {
    if (!couponCode.trim()) { setApplied(null); return }
    const coupon = await couponsRepo.byCode(couponCode.trim())
    if (!coupon) { toastError(`No coupon found for "${couponCode}".`); setApplied(null); return }
    const t = invoiceTotals(lineItems, coupon)
    setApplied({ code: coupon.code, discountAmount: t.discountAmount })
  }

  async function save(sendNow: boolean) {
    const clean = lineItems.filter(li => li.description.trim() && li.amount > 0)
    if (!clean.length) return
    const t = invoiceTotals(clean, applied ? { id: '', createdAt: '', updatedAt: '', code: applied.code, kind: 'flat', value: applied.discountAmount, active: true } : null)
    const number = await invoicesRepo.nextNumber()
    await invoicesRepo.create({
      clientId, number, date: new Date().toISOString().slice(0, 10),
      dueDate: dueDate || undefined, lineItems: clean,
      couponCode: applied?.code, discountAmount: t.discountAmount,
      subtotal: t.subtotal, total: t.total, status: sendNow ? 'sent' : 'draft',
      paymentLink: paymentLink.trim() || undefined,
    })
    toast(sendNow ? `Invoice #${number} sent.` : `Invoice #${number} saved as a draft.`)
    setLineItems([{ description: '', amount: 0, qty: 1 }]); setCouponCode(''); setApplied(null); setDueDate(''); setPaymentLink('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="New invoice" width={520}>
      <div className="space-y-3">
        <div className="space-y-2">
          {lineItems.map((li, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_90px_auto] items-end gap-2">
              <Field label={i === 0 ? 'Description' : ''}>
                <Input value={li.description} onChange={e => setLineItems(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} placeholder="e.g. 4-session pack" />
              </Field>
              <Field label={i === 0 ? 'Qty' : ''}>
                <Input type="number" min="1" value={li.qty ?? 1} onChange={e => setLineItems(rows => rows.map((r, j) => j === i ? { ...r, qty: Number(e.target.value) || 1 } : r))} className="font-mono tnum" />
              </Field>
              <Field label={i === 0 ? 'Amount' : ''}>
                <Input type="number" min="0" step="0.01" value={li.amount || ''} onChange={e => setLineItems(rows => rows.map((r, j) => j === i ? { ...r, amount: Number(e.target.value) || 0 } : r))} className="font-mono tnum" />
              </Field>
              <Button variant="ghost" size="sm" onClick={() => setLineItems(rows => rows.filter((_, j) => j !== i))} disabled={lineItems.length === 1}><Trash2 size={13} /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setLineItems(rows => [...rows, { description: '', amount: 0, qty: 1 }])}><Plus size={13} /> Add line</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Coupon code" hint="optional">
            <div className="flex gap-2">
              <Input value={couponCode} onChange={e => setCouponCode(e.target.value)} onBlur={checkCoupon} placeholder="SAVE10" />
            </div>
          </Field>
          <Field label="Due date" hint="optional"><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
        </div>
        <Field label="Payment link" hint="optional — your own Stripe/Square/PayPal link">
          <Input value={paymentLink} onChange={e => setPaymentLink(e.target.value)} placeholder="https://buy.stripe.com/…" />
        </Field>
        <div className="rounded-ctl border border-line bg-surface2 p-3 text-sm">
          <div className="flex justify-between text-muted"><span>Subtotal</span><span className="font-mono tnum">${totals.subtotal.toFixed(2)}</span></div>
          {totals.discountAmount > 0 && <div className="flex justify-between text-ember-600"><span>Discount ({applied?.code})</span><span className="font-mono tnum">−${totals.discountAmount.toFixed(2)}</span></div>}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>Total</span><span className="font-mono tnum">${totals.total.toFixed(2)}</span></div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => save(false)}>Save draft</Button>
          <Button variant="primary" onClick={() => save(true)}>Send invoice</Button>
        </div>
      </div>
    </Dialog>
  )
}

function InvoicesCard({ clientId }: { clientId: string }) {
  const [newOpen, setNewOpen] = useState(false)
  const invoices = useLiveQuery(() => invoicesRepo.forClient(clientId), [clientId], [])
  const balance = clientBalance(invoices)

  async function setStatus(inv: Invoice, status: InvoiceStatus) {
    await invoicesRepo.update(inv.id, { status })
    toast(`Invoice #${inv.number} marked ${status}.`)
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink"><FileText size={16} className="text-verde-600" /> Invoices</div>
        <div className="flex items-center gap-3">
          {balance > 0 && <Stat label="Balance owed" value={`$${balance.toFixed(2)}`} tone="ember" />}
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus size={14} /> New invoice</Button>
        </div>
      </div>
      {invoices.length === 0 ? (
        <p className="text-xs text-muted">No invoices yet. Create one to bill for packages, assessments, or one-off charges — with an optional coupon.</p>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <div key={inv.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2">
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono tnum font-medium text-ink">#{inv.number}</span>
                  <Tag tone={inv.status === 'paid' ? 'verde' : inv.status === 'sent' ? 'ember' : 'neutral'}>{inv.status}</Tag>
                </div>
                <div className="text-2xs text-faint">{inv.date}{inv.dueDate ? ` · due ${inv.dueDate}` : ''} · {inv.lineItems.length} line item{inv.lineItems.length === 1 ? '' : 's'}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono tnum text-sm font-semibold text-ink">${inv.total.toFixed(2)}</span>
                {inv.status === 'sent' && inv.paymentLink && (
                  <Button size="sm" variant="secondary" onClick={() => window.open(inv.paymentLink, '_blank', 'noopener,noreferrer')}>
                    <ExternalLink size={13} /> Pay now
                  </Button>
                )}
                {inv.status === 'sent' && <Button size="sm" variant="secondary" onClick={() => setStatus(inv, 'paid')}>Mark paid</Button>}
                {inv.status === 'draft' && <Button size="sm" variant="secondary" onClick={() => setStatus(inv, 'sent')}>Send</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <NewInvoiceDialog clientId={clientId} open={newOpen} onClose={() => setNewOpen(false)} />
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
      <div className="mb-4"><InvoicesCard clientId={clientId} /></div>
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
