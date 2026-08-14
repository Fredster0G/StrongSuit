// ===== Conflict policy (docs/plans/01-CONNECTIVITY.md §7) =====
//
// THE DEFECT THIS FIXES, stated plainly: every table merges with
// newest-`updatedAt`-wins and a whole-row `put()`. That is correct for one
// coach with one client and QUIETLY DESTRUCTIVE the moment a business has two
// trainers:
//
//   · Two trainers add different exercises to the same session. Both rows
//     carry the same id, so the later save replaces the earlier one WHOLESALE
//     and the first trainer's entries are gone. No error, no warning, and the
//     training history is simply wrong.
//   · A stale device pushes an old invoice over a recorded payment. Money
//     silently moves backwards.
//   · `>=` means even an exact timestamp tie lets the incoming row win, so two
//     saves in the same second are decided by arrival order.
//
// The rule this module encodes: **auto-resolve only where it is provably
// safe, and never silently pick a winner for training history or money.**
// Anything genuinely ambiguous becomes a `Conflict` for a human to settle.
// An empty conflicts list is the expected state; a non-empty one is the
// system refusing to guess rather than the system failing.
//
// Pure — no Dexie, no repos. `db/repo/base.ts` consumes it.

import type { Base } from '@/db/types'

export type ConflictPolicy =
  /** One logical author; last write is genuinely the truth. */
  | 'newest-wins'
  /** Rows are additive. Never replace one wholesale — merge its contents. */
  | 'union-entries'
  /** Rows are keyed by (clientId, date, key); same key = same reading. */
  | 'union-by-key'
  /** Never auto-resolved. A human decides. */
  | 'manual'

/**
 * Per-table policy. Anything not listed falls back to `newest-wins`, which is
 * the historic behaviour — so adding a table can't silently change how an
 * existing one merges.
 */
export const TABLE_POLICY: Record<string, ConflictPolicy> = {
  // Single logical author: the coach edits their own client record.
  clients: 'newest-wins',
  programs: 'newest-wins',
  exercises: 'newest-wins',
  // Additive training history — the case that motivated this whole module.
  sessionLogs: 'union-entries',
  // One reading per (client, date, kind). Two devices recording the same
  // morning weigh-in are the same fact, not competing ones.
  metrics: 'union-by-key',
  checkIns: 'union-by-key',
  // Already id-unioned in practice (a message is immutable once sent).
  messages: 'newest-wins',
  // Money. Never auto-resolved — see the header.
  payments: 'manual',
  invoices: 'manual',
}

export function policyFor(table: string): ConflictPolicy {
  return TABLE_POLICY[table] ?? 'newest-wins'
}

/** What the merge decided, and why — the `reason` is user-facing copy. */
export type Resolution<T> =
  | { action: 'apply'; row: T; reason: string }
  | { action: 'keep'; reason: string }
  | { action: 'conflict'; incoming: T; existing: T; reason: string }

/** A row two devices disagree about, parked for a human. */
export interface Conflict extends Base {
  table: string
  rowId: string
  /** Serialised copies so the view can show both sides without re-syncing. */
  incomingJson: string
  existingJson: string
  reason: string
  /** Device that sent the incoming version. */
  fromDeviceId?: string
  resolvedAt?: string
  resolvedAs?: 'incoming' | 'existing'
}

// ------------------------------------------------------------- session logs

interface EntryLike { exerciseId: string; sets?: unknown[] }
interface SessionLogLike extends Base { entries?: EntryLike[]; sessionNotes?: string }

/**
 * Merge two versions of one session by unioning their exercise entries.
 *
 * This is the fix for "two trainers logging the same client must not clobber
 * each other". An entry present on either side survives. Where both sides have
 * the same exercise, the one with MORE sets wins — a trainer who logged four
 * sets saw more of the session than one who logged two, and picking by
 * timestamp would throw away the fuller record just because it was saved
 * first.
 *
 * Notes are concatenated rather than replaced, for the same reason: two people
 * wrote them, and deleting one is not a merge.
 */
export function unionSessionEntries<T extends SessionLogLike>(incoming: T, existing: T): T {
  const byExercise = new Map<string, EntryLike>()
  for (const e of existing.entries ?? []) byExercise.set(e.exerciseId, e)
  for (const e of incoming.entries ?? []) {
    const have = byExercise.get(e.exerciseId)
    if (!have) { byExercise.set(e.exerciseId, e); continue }
    const mine = e.sets?.length ?? 0
    const theirs = have.sets?.length ?? 0
    if (mine > theirs) byExercise.set(e.exerciseId, e)
  }

  const notes = mergeNotes(existing.sessionNotes, incoming.sessionNotes)

  // Field-level: everything else takes the newer row's value, since those are
  // single-valued (title, date) and last-write is reasonable for them.
  const newer = new Date(incoming.updatedAt) >= new Date(existing.updatedAt) ? incoming : existing
  return {
    ...newer,
    entries: [...byExercise.values()],
    ...(notes !== undefined ? { sessionNotes: notes } : {}),
  }
}

function mergeNotes(a?: string, b?: string): string | undefined {
  const left = a?.trim(), right = b?.trim()
  if (!left) return right || undefined
  if (!right || left === right) return left
  // Both wrote something different — keep both. Losing a coach's note because
  // someone else also wrote one is exactly the silent loss this module exists
  // to stop.
  if (left.includes(right)) return left
  if (right.includes(left)) return right
  return `${left}\n\n${right}`
}

// --------------------------------------------------------------- resolution

/** Rows that carry a natural key beyond their id. */
interface KeyedLike extends Base { clientId?: string; date?: string; key?: string; type?: string }

/** The natural key for a `union-by-key` table: the same reading recorded twice
 *  on two devices should collapse, not duplicate. */
export function naturalKey(row: KeyedLike): string {
  return [row.clientId ?? '', row.date ?? '', row.key ?? row.type ?? ''].join('|')
}

/**
 * Order-independent JSON, all the way down.
 *
 * Written by hand rather than with `JSON.stringify(v, keys)` because that
 * second argument is a property **allowlist**, not a sort order — and since a
 * top-level key list doesn't contain nested field names, it silently strips
 * the inside of every nested object. The first version of `sameContent` did
 * exactly that, which made two completely different session logs serialise
 * identically and compare as equal. A test caught it; it would otherwise have
 * been a silent skip of real training data, i.e. the precise failure this
 * whole module exists to prevent.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/** True when two rows are the same in every way that matters, so there is
 *  nothing to resolve. Deliberately ignores the timestamps — an identical row
 *  re-saved, or re-sent by another device, is not a conflict. */
export function sameContent<T extends Base>(a: T, b: T): boolean {
  const strip = (r: T) => {
    const { updatedAt: _u, createdAt: _c, ...rest } = r as T & Record<string, unknown>
    return stableStringify(rest)
  }
  return strip(a) === strip(b)
}

/**
 * Decide what to do with one incoming row.
 *
 * `existing` undefined means it's new — always applied, whatever the policy.
 * Nothing here ever deletes; the worst case is `conflict`, which keeps what
 * is already stored and asks a person.
 */
export function resolve<T extends Base>(
  policy: ConflictPolicy,
  incoming: T,
  existing: T | undefined,
): Resolution<T> {
  if (!existing) return { action: 'apply', row: incoming, reason: 'New record.' }
  if (sameContent(incoming, existing)) {
    return { action: 'keep', reason: 'Identical to what is already stored.' }
  }

  switch (policy) {
    case 'union-entries': {
      const merged = unionSessionEntries(
        incoming as unknown as SessionLogLike,
        existing as unknown as SessionLogLike,
      ) as unknown as T
      return { action: 'apply', row: merged, reason: 'Merged both devices’ entries for this session.' }
    }

    case 'union-by-key': {
      // Same reading from two devices. Newer wins — but only when it IS newer;
      // a tie keeps what we have rather than letting arrival order decide.
      return new Date(incoming.updatedAt) > new Date(existing.updatedAt)
        ? { action: 'apply', row: incoming, reason: 'Newer reading for the same day.' }
        : { action: 'keep', reason: 'Older or same-age reading for a day already recorded.' }
    }

    case 'manual':
      // Money. The cost of asking is a click; the cost of guessing is a
      // wrong balance the coach may never notice.
      return {
        action: 'conflict',
        incoming, existing,
        reason: 'Two devices have different versions of this financial record.',
      }

    case 'newest-wins':
    default:
      return new Date(incoming.updatedAt) > new Date(existing.updatedAt)
        ? { action: 'apply', row: incoming, reason: 'Newer version from the other device.' }
        : { action: 'keep', reason: 'Local version is newer or the same age.' }
  }
}
