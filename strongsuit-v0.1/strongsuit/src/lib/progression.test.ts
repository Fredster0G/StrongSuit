import { describe, it, expect } from 'vitest'
import { suggestNext, suggestHeuristic, roundToPlate, type Performance } from './progression'
import { expenseAppliesTo, expensesForMonth, incomeForMonth, profitPlan } from './business'
import type { Expense, Payment } from '@/db/types'

const perf = (sets: [number, number, number?][]): Performance => ({
  date: '2026-07-10',
  sets: sets.map(([load, reps, rpe]) => ({ load, reps, rpe, done: true })),
})

describe('progression engine', () => {
  it('rounds to plate steps', () => {
    expect(roundToPlate(187.1, 'lb')).toBe(187.5)
    expect(roundToPlate(101.1, 'kg')).toBe(101.25)
  })

  it('linear-load adds the percent and rounds', () => {
    const s = suggestNext({ kind: 'linear-load', percent: 2.5 }, [perf([[200, 5], [200, 5]])], 'lb')
    expect(s?.load).toBe(205)
    expect(s?.direction).toBe('up')
    expect(s?.reason).toContain('2.5%')
  })

  it('linear-load never suggests the same load (min one plate step)', () => {
    const s = suggestNext({ kind: 'linear-load', percent: 0.5 }, [perf([[100, 5]])], 'lb')
    expect(s!.load!).toBeGreaterThan(100)
  })

  it('double-progression adds load when all sets hit top of range', () => {
    const s = suggestNext(
      { kind: 'double-progression', repRange: [8, 12], loadIncrement: 5 },
      [perf([[185, 12], [185, 12], [185, 12]])], 'lb',
    )
    expect(s?.load).toBe(190)
    expect(s?.reps).toBe('8')
  })

  it('double-progression holds load and adds a rep inside the range', () => {
    const s = suggestNext(
      { kind: 'double-progression', repRange: [8, 12], loadIncrement: 5 },
      [perf([[185, 10], [185, 9], [185, 8]])], 'lb',
    )
    expect(s?.load).toBe(185)
    expect(s?.reps).toBe('9')
    expect(s?.direction).toBe('hold')
  })

  it('rpe-target adds load when under target, backs off when over', () => {
    const up = suggestNext({ kind: 'rpe-target', target: 8 }, [perf([[200, 5, 6], [200, 5, 6]])], 'lb')
    expect(up?.direction).toBe('up')
    expect(up!.load!).toBeGreaterThan(200)

    const down = suggestNext({ kind: 'rpe-target', target: 8 }, [perf([[200, 5, 9.5], [200, 5, 9.5]])], 'lb')
    expect(down?.direction).toBe('down')
    expect(down!.load!).toBeLessThan(200)
  })

  it('returns null with no usable history and every suggestion has a reason', () => {
    expect(suggestNext({ kind: 'linear-load', percent: 2.5 }, [], 'lb')).toBeNull()
    const s = suggestHeuristic([perf([[135, 10], [135, 10]])], 'lb')
    expect(s?.reason.length).toBeGreaterThan(10)
  })

  it('heuristic takes smallest jump at 8+ reps, holds near-max RPE', () => {
    const jump = suggestHeuristic([perf([[135, 10], [135, 9]])], 'lb')
    expect(jump?.load).toBe(137.5)
    const hold = suggestHeuristic([perf([[135, 5, 10], [135, 5, 10]])], 'lb')
    expect(hold?.direction).toBe('hold')
    expect(hold?.load).toBe(135)
  })
})

// ---- Profit Planner math ----
const exp = (over: Partial<Expense>): Expense => ({
  id: 'x', createdAt: '', updatedAt: '', date: '2026-07-01', amount: 100,
  category: 'other', recurrence: 'one-time', ...over,
})
const pay = (over: Partial<Payment>): Payment => ({
  id: 'p', createdAt: '', updatedAt: '', clientId: 'c', date: '2026-07-05',
  amount: 100, type: 'payment', ...over,
})

describe('profit planner math', () => {
  it('one-time expenses only hit their month; monthly recur until endDate', () => {
    expect(expenseAppliesTo(exp({ date: '2026-07-10' }), '2026-07')).toBe(true)
    expect(expenseAppliesTo(exp({ date: '2026-06-10' }), '2026-07')).toBe(false)
    const rent = exp({ date: '2026-01-01', recurrence: 'monthly' })
    expect(expenseAppliesTo(rent, '2026-07')).toBe(true)
    expect(expenseAppliesTo(rent, '2025-12')).toBe(false)
    expect(expenseAppliesTo(exp({ date: '2026-01-01', recurrence: 'monthly', endDate: '2026-05-31' }), '2026-07')).toBe(false)
  })

  it('sums month expenses and income (refunds subtract)', () => {
    const spent = expensesForMonth([
      exp({ amount: 500, date: '2026-01-01', recurrence: 'monthly' }),
      exp({ amount: 80, date: '2026-07-12' }),
      exp({ amount: 999, date: '2026-06-12' }),
    ], '2026-07')
    expect(spent).toBe(580)
    const income = incomeForMonth([
      pay({ amount: 400 }), pay({ amount: 100, type: 'refund' }), pay({ amount: 300, date: '2026-06-01' }),
    ], '2026-07')
    expect(income).toBe(300)
  })

  it('computes gap, projection, and sessions to close', () => {
    const plan = profitPlan({
      payments: [pay({ amount: 1000, date: '2026-07-08' })],
      expenses: [exp({ amount: 400, date: '2026-07-01', recurrence: 'monthly' })],
      target: 2600, month: '2026-07', today: '2026-07-10', avgSessionRate: 75,
    })
    expect(plan.net).toBe(600)
    expect(plan.gap).toBe(2000)
    expect(plan.sessionsToClose).toBe(Math.ceil(2000 / 75))
    // 1000 over 10 of 31 days → projected 3100 income − 400 expenses = 2700
    expect(plan.projectedNet).toBe(2700)
    expect(plan.onTrack).toBe(true)
  })

  it('past-goal months report zero sessions needed', () => {
    const plan = profitPlan({
      payments: [pay({ amount: 5000 })], expenses: [], target: 2000,
      month: '2026-07', today: '2026-07-20', avgSessionRate: 75,
    })
    expect(plan.gap).toBeLessThan(0)
    expect(plan.sessionsToClose).toBe(0)
  })
})
