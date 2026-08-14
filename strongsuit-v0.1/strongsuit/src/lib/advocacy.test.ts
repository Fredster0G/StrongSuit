import { describe, it, expect } from 'vitest'
import {
  chooseAsk, hasGenuineWin, isSettled, lifetimeAsks,
  markShown, markDismissed, markActed, ASK_COPY,
  MIN_DAYS_BEFORE_ASK, ASK_COOLDOWN_DAYS, MAX_LIFETIME_ASKS,
  type AdvocacyState, type WinSignals, type AskKind,
} from './advocacy'

const fresh: AdvocacyState = { asks: {} }
const NOW = new Date('2026-08-01T12:00:00.000Z')

const won: WinSignals = { sessionsLogged: 60, clientsWithPrs: 2, programsCompleted: 1, daysUsed: 90 }
const newUser: WinSignals = { sessionsLogged: 0, clientsWithPrs: 0, programsCompleted: 0, daysUsed: 0 }

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe('hasGenuineWin — outcomes, not engagement', () => {
  it('requires a real coaching outcome', () => {
    expect(hasGenuineWin(won)).toBe(true)
    expect(hasGenuineWin({ ...won, clientsWithPrs: 0, programsCompleted: 0, sessionsLogged: 40 })).toBe(true)
  })

  it('is not satisfied by having used the app a lot with nothing to show', () => {
    // "Opened it 20 times" measures our retention, not their outcome. Asking
    // on that basis is asking for a favour in exchange for nothing.
    expect(hasGenuineWin({ sessionsLogged: 5, clientsWithPrs: 0, programsCompleted: 0, daysUsed: 400 })).toBe(false)
  })

  it('refuses however good the numbers look if it is still early', () => {
    expect(hasGenuineWin({ ...won, daysUsed: MIN_DAYS_BEFORE_ASK - 1 })).toBe(false)
  })
})

describe('the rules that stop this being obnoxious', () => {
  it('NEVER asks on first launch', () => {
    // The single most important line in this module.
    const d = chooseAsk(fresh, newUser, NOW)
    expect(d.ask).toBeNull()
    expect(d.reason).toMatch(/no genuine win/i)
  })

  it('never asks a brand-new install even after heavy first-week use', () => {
    expect(chooseAsk(fresh, { sessionsLogged: 200, clientsWithPrs: 9, programsCompleted: 3, daysUsed: 6 }, NOW).ask)
      .toBeNull()
  })

  it('asks once the coach has genuinely got value', () => {
    expect(chooseAsk(fresh, won, NOW).ask).toBe('linkedin')
  })

  it('treats a dismissal as permanent', () => {
    // "Forever" means forever — no clever re-prompt six months later.
    let s = markShown(fresh, 'linkedin', NOW)
    s = markDismissed(s, 'linkedin', NOW)
    const muchLater = new Date('2030-01-01')
    expect(chooseAsk(s, won, muchLater).ask).not.toBe('linkedin')
    expect(isSettled(s.asks.linkedin)).toBe(true)
  })

  it('never re-asks something the user already did', () => {
    let s = markShown(fresh, 'linkedin', NOW)
    s = markActed(s, 'linkedin', NOW)
    expect(chooseAsk(s, won, new Date('2030-01-01')).ask).not.toBe('linkedin')
  })

  it('enforces a long cooldown ACROSS asks, not per ask', () => {
    // Otherwise three different asks each check only themselves and all three
    // arrive in the same week.
    let s = markShown(fresh, 'linkedin', new Date(daysAgo(10)))
    s = markDismissed(s, 'linkedin', new Date(daysAgo(10)))
    const d = chooseAsk(s, won, NOW)
    expect(d.ask).toBeNull()
    expect(d.reason).toMatch(/too soon/i)
  })

  it('allows the next ask only after the cooldown', () => {
    let s = markShown(fresh, 'linkedin', new Date(daysAgo(ASK_COOLDOWN_DAYS + 1)))
    s = markDismissed(s, 'linkedin', new Date(daysAgo(ASK_COOLDOWN_DAYS + 1)))
    expect(chooseAsk(s, won, NOW).ask).toBe('review')
  })

  it('stops permanently after the lifetime cap', () => {
    let s: AdvocacyState = fresh
    const kinds: AskKind[] = ['linkedin', 'review', 'referral']
    kinds.forEach((k, i) => {
      s = markShown(s, k, new Date(daysAgo(1000 - i * 200)))
      s = markDismissed(s, k, new Date(daysAgo(1000 - i * 200)))
    })
    expect(lifetimeAsks(s)).toBe(MAX_LIFETIME_ASKS)
    const d = chooseAsk(s, won, NOW)
    expect(d.ask).toBeNull()
    expect(d.reason).toMatch(/maximum/i)
  })

  it('asks for the cheapest thing first', () => {
    // A follow costs a click; a case study costs an afternoon. Leading with
    // the big one is how you get a no to everything.
    expect(chooseAsk(fresh, won, NOW).ask).toBe('linkedin')
  })

  it('only ever offers one ask at a time', () => {
    const d = chooseAsk(fresh, won, NOW)
    expect(typeof d.ask === 'string' || d.ask === null).toBe(true)
  })
})

describe('the donation ask is structurally not a prompt', () => {
  it('has no "donate" ask kind at all', () => {
    // §4.6: the donation ask lives as a single quiet entry in Settings —
    // never a popup, never a banner. Leaving it out of this module means it
    // cannot become one by someone adding a case later.
    expect(Object.keys(ASK_COPY)).not.toContain('donate')
    let s: AdvocacyState = fresh
    for (let i = 0; i < 20; i++) {
      const d = chooseAsk(s, won, new Date(NOW.getTime() + i * 200 * 86_400_000))
      if (d.ask) s = markDismissed(markShown(s, d.ask), d.ask)
      expect(d.ask).not.toBe('donate')
    }
  })
})

describe('ask copy', () => {
  it('names the benefit to US honestly rather than pretending it is a favour to them', () => {
    expect(ASK_COPY.linkedin.body).toMatch(/we don’t advertise|word of mouth/i)
    expect(ASK_COPY.contribute.body).toMatch(/can’t keep up/i)
  })

  it('is refusable in tone — no urgency, no guilt, no countdown', () => {
    for (const c of Object.values(ASK_COPY)) {
      expect(c.title.length).toBeGreaterThan(10)
      expect(c.body).not.toMatch(/hurry|limited time|last chance|expires|only \d+ left/i)
      expect(c.body).not.toMatch(/you must|you should really/i)
    }
  })

  it('offers a review honestly, including a critical one', () => {
    // Asking only for positive reviews is review-gating, which app stores ban
    // and which is dishonest regardless.
    expect(ASK_COPY.review.body).toMatch(/good or critical/i)
  })
})

describe('state transitions', () => {
  it('records shown, dismissed and acted independently', () => {
    let s = markShown(fresh, 'review', NOW)
    expect(s.asks.review?.shownAt).toBeTruthy()
    expect(isSettled(s.asks.review)).toBe(false)
    s = markDismissed(s, 'review', NOW)
    expect(isSettled(s.asks.review)).toBe(true)
  })

  it('does not mutate the state it is given', () => {
    const before = JSON.stringify(fresh)
    markShown(fresh, 'linkedin', NOW)
    expect(JSON.stringify(fresh)).toBe(before)
  })
})
