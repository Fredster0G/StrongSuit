import { describe, it, expect } from 'vitest'
import { isInvoiceOverdue, outstandingTotal } from './invoiceStatus'
import type { Invoice } from '@/db/types'

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'i1', createdAt: '', updatedAt: '',
    clientId: 'c1', number: 1, date: '2026-08-01', lineItems: [],
    subtotal: 100, total: 100, status: 'sent', ...overrides,
  }
}

describe('isInvoiceOverdue', () => {
  it('is overdue when sent and past its due date', () => {
    expect(isInvoiceOverdue(invoice({ status: 'sent', dueDate: '2026-08-01' }), '2026-08-10')).toBe(true)
  })

  it('is not overdue when the due date has not passed', () => {
    expect(isInvoiceOverdue(invoice({ status: 'sent', dueDate: '2026-08-20' }), '2026-08-10')).toBe(false)
  })

  it('is not overdue without a due date at all', () => {
    expect(isInvoiceOverdue(invoice({ status: 'sent', dueDate: undefined }), '2026-08-10')).toBe(false)
  })

  it('is never overdue once paid, regardless of due date', () => {
    expect(isInvoiceOverdue(invoice({ status: 'paid', dueDate: '2026-01-01' }), '2026-08-10')).toBe(false)
  })

  it('is never overdue while still a draft', () => {
    expect(isInvoiceOverdue(invoice({ status: 'draft', dueDate: '2026-01-01' }), '2026-08-10')).toBe(false)
  })

  it('is never overdue once voided', () => {
    expect(isInvoiceOverdue(invoice({ status: 'void', dueDate: '2026-01-01' }), '2026-08-10')).toBe(false)
  })
})

describe('outstandingTotal', () => {
  it('sums only sent invoices', () => {
    const invoices = [
      invoice({ status: 'sent', total: 100 }),
      invoice({ status: 'paid', total: 50 }),
      invoice({ status: 'draft', total: 25 }),
      invoice({ status: 'void', total: 10 }),
      invoice({ status: 'sent', total: 200 }),
    ]
    expect(outstandingTotal(invoices)).toBe(300)
  })

  it('is zero for no invoices', () => {
    expect(outstandingTotal([])).toBe(0)
  })
})
