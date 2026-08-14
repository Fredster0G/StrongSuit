import { describe, it, expect } from 'vitest'
import { evalCalculator, parseNlQuery, clientsWithNoSessionSince, clientsWhoOwe } from './paletteQuery'
import type { Client, SessionLog, Invoice } from '@/db/types'

function client(id: string, overrides: Partial<Client> = {}): Client {
  return {
    id, createdAt: '', updatedAt: '', firstName: id, lastName: 'Test',
    status: 'active', goals: '', injuries: '', parqNotes: '', tags: [], startDate: '2026-01-01',
    ...overrides,
  }
}

function log(clientId: string, date: string): SessionLog {
  return { id: `${clientId}-${date}`, createdAt: '', updatedAt: '', clientId, date, title: 'Session', entries: [], source: 'trainer' }
}

function invoice(clientId: string, overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: `${clientId}-inv`, createdAt: '', updatedAt: '', clientId, number: 1, date: '2026-08-01',
    lineItems: [], subtotal: 100, total: 100, status: 'sent', ...overrides,
  }
}

describe('evalCalculator', () => {
  it('evaluates basic arithmetic', () => {
    expect(evalCalculator('2+2')).toBe(4)
    expect(evalCalculator('225*0.85')).toBeCloseTo(191.25)
  })

  it('respects operator precedence and parens', () => {
    expect(evalCalculator('2+3*4')).toBe(14)
    expect(evalCalculator('(2+3)*4')).toBe(20)
  })

  it('handles unary minus and whitespace', () => {
    expect(evalCalculator(' -5 + 10 ')).toBe(5)
  })

  it('returns null for division by zero', () => {
    expect(evalCalculator('10/0')).toBeNull()
  })

  it('returns null for non-arithmetic input', () => {
    expect(evalCalculator('sam 3x5 225 back squat')).toBeNull()
    expect(evalCalculator('hello')).toBeNull()
  })

  it('returns null for malformed expressions', () => {
    expect(evalCalculator('2+')).toBeNull()
    expect(evalCalculator('(2+3')).toBeNull()
    expect(evalCalculator('')).toBeNull()
  })
})

describe('parseNlQuery', () => {
  it('recognizes "no session in N days" phrasings', () => {
    expect(parseNlQuery("clients who haven't trained in 9 days")).toEqual({ kind: 'no-session', days: 9 })
    expect(parseNlQuery('no session in 14 days')).toEqual({ kind: 'no-session', days: 14 })
  })

  it('recognizes "who owes" phrasings', () => {
    expect(parseNlQuery('who owes')).toEqual({ kind: 'owes' })
    expect(parseNlQuery('overdue clients')).toEqual({ kind: 'owes' })
    expect(parseNlQuery('outstanding balances')).toEqual({ kind: 'owes' })
  })

  it('returns null for anything unrecognized', () => {
    expect(parseNlQuery('sam rivera')).toBeNull()
    expect(parseNlQuery('settings')).toBeNull()
  })
})

describe('clientsWithNoSessionSince', () => {
  const clients = [client('c1'), client('c2'), client('c3', { status: 'paused' })]

  it('flags a client whose last session is old enough', () => {
    const logs = [log('c1', '2026-07-01'), log('c2', '2026-08-11')]
    const result = clientsWithNoSessionSince(clients, logs, 9, '2026-08-12')
    expect(result.map(r => r.client.id)).toEqual(['c1'])
    expect(result[0].daysSince).toBe(42)
  })

  it('flags a client with no logged sessions at all', () => {
    const logs = [log('c2', '2026-08-11')]
    const result = clientsWithNoSessionSince(clients, logs, 9, '2026-08-12')
    expect(result.map(r => r.client.id)).toEqual(['c1'])
    expect(result[0].daysSince).toBeNull()
  })

  it('excludes non-active clients', () => {
    const logs: SessionLog[] = []
    const result = clientsWithNoSessionSince(clients, logs, 9, '2026-08-12')
    expect(result.map(r => r.client.id)).not.toContain('c3')
  })
})

describe('clientsWhoOwe', () => {
  const clients = [client('c1'), client('c2'), client('c3')]

  it('sums sent invoices per client and sorts by amount owed', () => {
    const invoices = [
      invoice('c1', { total: 100 }),
      invoice('c1', { total: 50, id: 'c1-inv2' }),
      invoice('c2', { total: 300 }),
      invoice('c3', { total: 999, status: 'paid' }),
    ]
    const result = clientsWhoOwe(clients, invoices)
    expect(result).toEqual([
      { client: clients[1], amount: 300 },
      { client: clients[0], amount: 150 },
    ])
  })

  it('returns nothing when nobody owes', () => {
    expect(clientsWhoOwe(clients, [])).toEqual([])
  })
})
