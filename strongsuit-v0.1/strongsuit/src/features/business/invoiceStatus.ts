import type { Invoice } from '@/db/types'

/** A sent invoice past its due date. Drafts and paid/void invoices are never
 *  overdue — an unsent draft has nothing to be late on, and a paid or voided
 *  invoice is settled regardless of what its due date says. */
export function isInvoiceOverdue(invoice: Invoice, todayStr: string): boolean {
  return invoice.status === 'sent' && !!invoice.dueDate && invoice.dueDate < todayStr
}

/** Total still owed — sent invoices only. Drafts aren't real asks yet, and
 *  paid/void invoices don't owe anything. */
export function outstandingTotal(invoices: Invoice[]): number {
  return invoices.filter(i => i.status === 'sent').reduce((sum, i) => sum + i.total, 0)
}
