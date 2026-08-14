import type { Client, SessionLog, Invoice } from '@/db/types'

// ===== Inline calculator =====
// A safe recursive-descent arithmetic evaluator — no eval/Function, so a
// palette query can never execute arbitrary code. Supports + - * / (), unary
// minus, and decimals; anything else (letters, unmatched parens, division by
// zero) returns null rather than a wrong or thrown result.

export function evalCalculator(input: string): number | null {
  const s = input.trim()
  if (!/^[\d\s+\-*/().]+$/.test(s) || !/\d/.test(s)) return null

  let i = 0
  const peek = () => s[i]
  const skipWs = () => { while (s[i] === ' ') i++ }

  function parseExpr(): number {
    let v = parseTerm()
    for (;;) {
      skipWs()
      if (peek() === '+') { i++; v += parseTerm() }
      else if (peek() === '-') { i++; v -= parseTerm() }
      else break
    }
    return v
  }
  function parseTerm(): number {
    let v = parseFactor()
    for (;;) {
      skipWs()
      if (peek() === '*') { i++; v *= parseFactor() }
      else if (peek() === '/') { i++; const d = parseFactor(); if (d === 0) throw new Error('div0'); v /= d }
      else break
    }
    return v
  }
  function parseFactor(): number {
    skipWs()
    if (peek() === '-') { i++; return -parseFactor() }
    if (peek() === '(') {
      i++
      const v = parseExpr()
      skipWs()
      if (peek() !== ')') throw new Error('paren')
      i++
      return v
    }
    const start = i
    while (i < s.length && /[\d.]/.test(s[i])) i++
    if (start === i) throw new Error('number')
    return Number(s.slice(start, i))
  }

  try {
    const result = parseExpr()
    skipWs()
    if (i !== s.length || !Number.isFinite(result)) return null
    return result
  } catch {
    return null
  }
}

// ===== Natural-language client queries =====
// Deliberately NOT general NLP — a small, honest set of recognized phrasings
// mapped onto data this app actually tracks (session dates, sent invoices).
// A query that doesn't match falls straight through to the normal fuzzy
// search rather than pretending to understand it.

export type NlQuery = { kind: 'no-session'; days: number } | { kind: 'owes' }

export function parseNlQuery(query: string): NlQuery | null {
  const q = query.trim()
  const noSession = q.match(/(?:haven'?t trained|no session)s?\s*(?:in|for)?\s*(\d+)\s*days?/i)
  if (noSession) return { kind: 'no-session', days: Number(noSession[1]) }
  if (/\b(who owes|overdue|outstanding)\b/i.test(q)) return { kind: 'owes' }
  return null
}

function daysBetween(dateStr: string, todayStr: string): number {
  const ms = new Date(todayStr + 'T00:00:00').getTime() - new Date(dateStr + 'T00:00:00').getTime()
  return Math.floor(ms / 86_400_000)
}

/** Active clients with no logged session in at least `days` days — a client
 *  who has never logged one at all counts as overdue too. */
export function clientsWithNoSessionSince(
  clients: Client[], logs: SessionLog[], days: number, todayStr: string,
): { client: Client; daysSince: number | null }[] {
  const lastByClient = new Map<string, string>()
  for (const l of logs) {
    const prev = lastByClient.get(l.clientId)
    if (!prev || l.date > prev) lastByClient.set(l.clientId, l.date)
  }
  return clients
    .filter(c => c.status === 'active')
    .map(c => {
      const last = lastByClient.get(c.id)
      return { client: c, daysSince: last ? daysBetween(last, todayStr) : null }
    })
    .filter(({ daysSince: d }) => d === null || d >= days)
}

/** Clients with at least one sent (unpaid) invoice, amount owed descending. */
export function clientsWhoOwe(clients: Client[], invoices: Invoice[]): { client: Client; amount: number }[] {
  const totals = new Map<string, number>()
  for (const inv of invoices) {
    if (inv.status !== 'sent') continue
    totals.set(inv.clientId, (totals.get(inv.clientId) ?? 0) + inv.total)
  }
  return clients
    .filter(c => totals.has(c.id))
    .map(c => ({ client: c, amount: totals.get(c.id)! }))
    .sort((a, b) => b.amount - a.amount)
}
