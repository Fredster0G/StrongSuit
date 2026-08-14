import { describe, it, expect } from 'vitest'
import {
  staffCommissionForMonth, totalCommissionsForMonth, couponDiscount, invoiceTotals, clientBalance,
} from './business'
import { evaluateAutomations, DEFAULT_RULES, type ClientFacts } from './automations'
import { leaderboard } from './leaderboard'
import { currentStreak } from './habits'
import type { Client, Coupon, Invoice, Payment, Staff, SessionLog, Metric } from '@/db/types'

const client = (over: Partial<Client>): Client => ({
  id: 'c1', createdAt: '', updatedAt: '', firstName: 'A', lastName: 'B',
  status: 'active', goals: '', injuries: '', parqNotes: '', tags: [], startDate: '2026-01-01', ...over,
})
const pay = (over: Partial<Payment>): Payment => ({
  id: 'p', createdAt: '', updatedAt: '', clientId: 'c1', date: '2026-07-05',
  amount: 100, type: 'payment', ...over,
})
const staff = (over: Partial<Staff>): Staff => ({
  id: 's1', createdAt: '', updatedAt: '', name: 'Alex', role: 'coach', active: true, ...over,
})

describe('staff commissions', () => {
  it('pays a percent of assigned clients income only', () => {
    const alex = staff({ commissionPercent: 20 })
    const clients = [client({ id: 'c1', staffId: 's1' }), client({ id: 'c2', staffId: 'other' })]
    const payments = [pay({ clientId: 'c1', amount: 500 }), pay({ clientId: 'c2', amount: 1000 })]
    expect(staffCommissionForMonth(alex, clients, payments, '2026-07')).toBe(100) // 20% of 500 only
  })

  it('zero commission percent pays nothing; totals sum across staff', () => {
    const a = staff({ id: 'a', commissionPercent: 10 })
    const b = staff({ id: 'b', commissionPercent: 0 })
    const clients = [client({ id: 'c1', staffId: 'a' }), client({ id: 'c2', staffId: 'b' })]
    const payments = [pay({ clientId: 'c1', amount: 1000 }), pay({ clientId: 'c2', amount: 1000 })]
    expect(totalCommissionsForMonth([a, b], clients, payments, '2026-07')).toBe(100)
  })

  it("a payment's own staffId wins over the client's CURRENT staffId — the reassignment case", () => {
    const original = staff({ id: 'original', commissionPercent: 20 })
    const newCoach = staff({ id: 'new-coach', commissionPercent: 20 })
    // The client is now assigned to newCoach, but this payment was collected
    // back when the original coach still had them — the original coach did
    // that work and must still get paid for it.
    const clients = [client({ id: 'c1', staffId: 'new-coach' })]
    const payments = [pay({ clientId: 'c1', amount: 500, staffId: 'original' })]
    expect(staffCommissionForMonth(original, clients, payments, '2026-07')).toBe(100)
    expect(staffCommissionForMonth(newCoach, clients, payments, '2026-07')).toBe(0)
  })

  it("falls back to the client's staffId for older payments with no staffId of their own", () => {
    const alex = staff({ id: 's1', commissionPercent: 20 })
    const clients = [client({ id: 'c1', staffId: 's1' })]
    const payments = [pay({ clientId: 'c1', amount: 500 })] // no staffId — pre-v1.6 row
    expect(staffCommissionForMonth(alex, clients, payments, '2026-07')).toBe(100)
  })
})

describe('coupons & invoicing', () => {
  const coupon = (over: Partial<Coupon>): Coupon => ({
    id: 'k', createdAt: '', updatedAt: '', code: 'SAVE10', kind: 'percent', value: 10, active: true, ...over,
  })

  it('percent and flat coupons discount correctly, never below zero or above subtotal', () => {
    expect(couponDiscount(200, coupon({ kind: 'percent', value: 10 }))).toBe(20)
    expect(couponDiscount(200, coupon({ kind: 'flat', value: 500 }))).toBe(200) // capped at subtotal
    expect(couponDiscount(200, coupon({ active: false }))).toBe(0)
    expect(couponDiscount(200, undefined)).toBe(0)
  })

  it('expired coupons apply no discount', () => {
    expect(couponDiscount(200, coupon({ expiresAt: '2020-01-01' }))).toBe(0)
  })

  it('invoiceTotals sums line items with qty and applies the coupon once', () => {
    const totals = invoiceTotals(
      [{ description: 'Session', amount: 75, qty: 4 }, { description: 'Assessment', amount: 50 }],
      coupon({ kind: 'flat', value: 50 }),
    )
    expect(totals.subtotal).toBe(350)
    expect(totals.discountAmount).toBe(50)
    expect(totals.total).toBe(300)
  })

  it('client balance sums only sent (unpaid) invoices', () => {
    const inv = (over: Partial<Invoice>): Invoice => ({
      id: 'i', createdAt: '', updatedAt: '', clientId: 'c1', number: 1, date: '2026-07-01',
      lineItems: [], subtotal: 0, total: 100, status: 'sent', ...over,
    })
    const invoices = [inv({ status: 'sent', total: 100 }), inv({ status: 'paid', total: 200 }), inv({ status: 'void', total: 300 })]
    expect(clientBalance(invoices)).toBe(100)
  })
})

describe('automation rules engine', () => {
  const facts = (over: Partial<ClientFacts>): ClientFacts => ({
    clientId: 'c1', hasScreening: true, screeningCleared: true, ...over,
  })

  it('flags a client with no session in 7+ days using the default rule', () => {
    const hits = evaluateAutomations({
      clients: [client({ id: 'c1' })],
      facts: new Map([['c1', facts({ lastSessionDate: '2026-07-01' })]]),
      rules: DEFAULT_RULES,
      today: '2026-07-16',
    })
    expect(hits.some(h => h.ruleId === 'default-no-session')).toBe(true)
  })

  it('does not flag a client trained recently, and skips archived/paused clients', () => {
    const hits = evaluateAutomations({
      clients: [client({ id: 'c1', status: 'paused' })],
      facts: new Map([['c1', facts({ lastSessionDate: '2026-07-15' })]]),
      rules: DEFAULT_RULES,
      today: '2026-07-16',
    })
    expect(hits).toHaveLength(0)
  })

  it('a custom low-package-count rule fires with the right message substitution', () => {
    const rule = { id: 'r1', createdAt: '', updatedAt: '', name: 'Low pack', trigger: 'package-low-sessions' as const, thresholdSessions: 2, message: '{count} sessions left', active: true }
    const hits = evaluateAutomations({
      clients: [client({ id: 'c1' })],
      facts: new Map([['c1', facts({ lastSessionDate: '2026-07-16', sessionsRemaining: 1 })]]),
      rules: [rule],
      today: '2026-07-16',
    })
    expect(hits[0].message).toBe('1 sessions left')
  })

  it('screening-missing rule fires when uncleared', () => {
    const rule = { id: 'r2', createdAt: '', updatedAt: '', name: 'Screen', trigger: 'screening-missing' as const, message: 'Needs clearance', active: true }
    const hits = evaluateAutomations({
      clients: [client({ id: 'c1' })],
      facts: new Map([['c1', facts({ lastSessionDate: '2026-07-16', hasScreening: true, screeningCleared: false })]]),
      rules: [rule],
      today: '2026-07-16',
    })
    expect(hits).toHaveLength(1)
  })
})

describe('leaderboard', () => {
  const log = (over: Partial<SessionLog>): SessionLog => ({
    id: 'l', createdAt: '', updatedAt: '', clientId: 'c1', date: '2026-07-10',
    title: 'Session', entries: [], source: 'trainer', ...over,
  })

  it('ranks by volume, excludes non-opted-in clients, ties share rank', () => {
    const clients = [
      client({ id: 'c1', leaderboardOptIn: true }),
      client({ id: 'c2', leaderboardOptIn: true }),
      client({ id: 'c3', leaderboardOptIn: false }),
    ]
    const logs = [
      log({ clientId: 'c1', date: '2026-07-10', entries: [{ exerciseId: 'e', sets: [{ actualLoad: 100, actualReps: 10, done: true }] }] }),
      log({ clientId: 'c2', date: '2026-07-11', entries: [{ exerciseId: 'e', sets: [{ actualLoad: 200, actualReps: 10, done: true }] }] }),
      log({ clientId: 'c3', date: '2026-07-11', entries: [{ exerciseId: 'e', sets: [{ actualLoad: 500, actualReps: 10, done: true }] }] }),
    ]
    const board = leaderboard({ metric: 'volume', clients, sessionLogs: logs, metrics: [], start: '2026-07-01', end: '2026-07-31' })
    expect(board.map(e => e.clientId)).toEqual(['c2', 'c1']) // c3 excluded (not opted in)
    expect(board[0].rank).toBe(1)
  })

  it('bodyweight-loss-pct compares first vs last reading in range', () => {
    const clients = [client({ id: 'c1', leaderboardOptIn: true })]
    const metrics: Metric[] = [
      { id: 'm1', createdAt: '', updatedAt: '', clientId: 'c1', date: '2026-07-01', type: 'bodyweight', key: 'bodyweight', value: 200, unit: 'lb' },
      { id: 'm2', createdAt: '', updatedAt: '', clientId: 'c1', date: '2026-07-15', type: 'bodyweight', key: 'bodyweight', value: 190, unit: 'lb' },
    ]
    const board = leaderboard({ metric: 'bodyweight-loss-pct', clients, sessionLogs: [], metrics, start: '2026-07-01', end: '2026-07-31' })
    expect(board[0].value).toBe(5) // (200-190)/200 * 100
  })

  it('a challenge can scope participants to a subset', () => {
    const clients = [client({ id: 'c1', leaderboardOptIn: true }), client({ id: 'c2', leaderboardOptIn: true })]
    const logs = [
      log({ clientId: 'c1' }), log({ clientId: 'c2' }),
    ].map(l => ({ ...l, entries: [{ exerciseId: 'e', sets: [{ actualLoad: 100, actualReps: 10, done: true }] }] }))
    const board = leaderboard({ metric: 'sessions', clients, sessionLogs: logs, metrics: [], start: '2026-07-01', end: '2026-07-31', participantIds: ['c1'] })
    expect(board.map(e => e.clientId)).toEqual(['c1'])
  })
})

describe('habit streaks', () => {
  it('counts consecutive done days ending today', () => {
    const entries = [
      { date: '2026-07-14', done: true }, { date: '2026-07-15', done: true }, { date: '2026-07-16', done: true },
    ]
    expect(currentStreak(entries, '2026-07-16')).toBe(3)
  })

  it('still counts a streak if today is not logged yet but yesterday was', () => {
    const entries = [{ date: '2026-07-15', done: true }, { date: '2026-07-14', done: true }]
    expect(currentStreak(entries, '2026-07-16')).toBe(2)
  })

  it('breaks on a missed day and zeroes out if neither today nor yesterday is done', () => {
    const entries = [{ date: '2026-07-10', done: true }, { date: '2026-07-16', done: false }]
    expect(currentStreak(entries, '2026-07-16')).toBe(0)
  })
})
