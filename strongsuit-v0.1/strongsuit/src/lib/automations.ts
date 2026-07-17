// ===== Automation rules engine (spec §4.29) =====
// Pure evaluator: given the coach's configured rules and a set of per-client
// facts (pre-aggregated by the caller from the repos), produce a flat list of
// attention items. No timers, no background jobs, no server — this runs on
// demand whenever the Dashboard (or a rule-editor preview) renders, which is
// the only kind of "automation" a zero-backend app can honestly offer: rules
// that re-evaluate instantly against your own local data, not push-notify you
// while the app is closed (see docs/SERVER_STRATEGY.md for why).

import type { AutomationRule, AutomationTrigger, Client } from '@/db/types'

/** Whole days between a yyyy-MM-dd date and a reference "today" — deterministic
 *  (unlike lib/core's daysSince, which reads the real wall clock and would make
 *  this engine untestable and the caller's `today` parameter a lie). */
function daysBetween(dateStr: string | undefined, today: string): number | null {
  if (!dateStr) return null
  const ms = new Date(today + 'T00:00:00').getTime() - new Date(dateStr + 'T00:00:00').getTime()
  return Math.floor(ms / 86_400_000)
}

export interface ClientFacts {
  clientId: string
  lastSessionDate?: string       // yyyy-MM-dd
  lastCheckInDate?: string
  sessionsRemaining?: number     // from session-credit packs, if tracked
  lastPaymentDate?: string
  hasScreening: boolean
  screeningCleared: boolean
}

export interface AttentionItem {
  clientId: string
  ruleId: string
  message: string
  severity: 'info' | 'warning'
}

const DEFAULTS_STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

/** Always-on baseline rules — what the Dashboard showed before custom rules
 *  existed. A coach can turn these off or add their own alongside them. */
export const DEFAULT_RULES: AutomationRule[] = [
  { id: 'default-no-session', ...DEFAULTS_STAMP, name: 'No session in a while', trigger: 'no-session-days', thresholdDays: 7, message: 'No session logged in {days} days', active: true },
  { id: 'default-screening', ...DEFAULTS_STAMP, name: 'Missing health screening', trigger: 'screening-missing', message: 'No PAR-Q+ screening on file', active: true },
]

function evalOne(rule: AutomationRule, client: Client, facts: ClientFacts, today: string): AttentionItem | null {
  const msg = (m: string) => m

  switch (rule.trigger) {
    case 'no-session-days': {
      const days = daysBetween(facts.lastSessionDate, today)
      const threshold = rule.thresholdDays ?? 7
      if (days === null) {
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg(rule.message.replace('{days}', 'ever')) }
      }
      if (days >= threshold) {
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg(rule.message.replace('{days}', String(days))) }
      }
      return null
    }
    case 'checkin-overdue-days': {
      const days = daysBetween(facts.lastCheckInDate, today)
      const threshold = rule.thresholdDays ?? 14
      if (days !== null && days >= threshold) {
        return { clientId: client.id, ruleId: rule.id, severity: 'info', message: msg(rule.message.replace('{days}', String(days))) }
      }
      return null
    }
    case 'package-low-sessions': {
      const threshold = rule.thresholdSessions ?? 2
      if (facts.sessionsRemaining != null && facts.sessionsRemaining <= threshold) {
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg(rule.message.replace('{count}', String(facts.sessionsRemaining))) }
      }
      return null
    }
    case 'payment-overdue-days': {
      const days = daysBetween(facts.lastPaymentDate, today)
      const threshold = rule.thresholdDays ?? 35
      if (days !== null && days >= threshold) {
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg(rule.message.replace('{days}', String(days))) }
      }
      return null
    }
    case 'screening-missing': {
      if (!facts.hasScreening || !facts.screeningCleared) {
        return { clientId: client.id, ruleId: rule.id, severity: 'warning', message: msg(rule.message) }
      }
      return null
    }
  }
  return null
}

/** Evaluate every active rule against every active client's facts. */
export function evaluateAutomations(opts: {
  clients: Client[]
  facts: Map<string, ClientFacts>
  rules: AutomationRule[]
  today: string
}): AttentionItem[] {
  const out: AttentionItem[] = []
  for (const client of opts.clients) {
    if (client.status !== 'active') continue
    const facts = opts.facts.get(client.id)
    if (!facts) continue
    for (const rule of opts.rules) {
      if (!rule.active) continue
      const hit = evalOne(rule, client, facts, opts.today)
      if (hit) out.push(hit)
    }
  }
  return out
}

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  'no-session-days': 'No session logged in N days',
  'checkin-overdue-days': 'No check-in in N days',
  'package-low-sessions': 'Session pack down to N or fewer',
  'payment-overdue-days': 'No payment in N days',
  'screening-missing': 'Health screening missing or not cleared',
}
