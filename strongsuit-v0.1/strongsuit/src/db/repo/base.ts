import type { Table } from 'dexie'
import { nowIso, stamp } from '@/lib/core'
import { resolve, type ConflictPolicy } from '@/lib/conflict'
import type { Base } from '../types'

/** A row the merge refused to decide. Returned to the caller, which owns
 *  persisting it — the repo layer shouldn't be writing to a different table. */
export interface PendingConflict<T> {
  incoming: T
  existing: T
  reason: string
}

/** Generic repository factory. Every entity repo wraps this; features never
 *  touch Dexie directly (spec §2.3). */
export function makeRepo<T extends Base>(table: Table<T, string>) {
  return {
    table,
    async get(id: string) {
      return table.get(id)
    },
    async all() {
      return table.toArray()
    },
    async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
      const row = stamp(data as T)
      await table.add(row)
      return row
    },
    async update(id: string, patch: Partial<T>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await table.update(id, { ...patch, updatedAt: nowIso() } as any)
      return table.get(id)
    },
    async remove(id: string) {
      await table.delete(id)
    },
    /**
     * ULID-keyed upsert for sync and backup merge.
     *
     * Historically this was newest-`updatedAt`-wins with a whole-row `put()`,
     * which is right for one coach and quietly destructive for a business with
     * two trainers — the later save replaced the earlier one wholesale, so one
     * trainer's logged exercises simply vanished (docs/plans/01-CONNECTIVITY.md
     * §7). Resolution now runs through `lib/conflict.ts`, which merges session
     * entries instead of replacing them and refuses to auto-resolve money at
     * all.
     *
     * `policy` is passed by the caller because the repo doesn't know its own
     * table name. Omitting it keeps the legacy newest-wins behaviour, so
     * existing callers are unaffected.
     */
    async mergeUpsert(
      rows: T[],
      policy: ConflictPolicy = 'newest-wins',
    ): Promise<{ applied: number; skipped: number; conflicts: PendingConflict<T>[] }> {
      let applied = 0
      let skipped = 0
      const conflicts: PendingConflict<T>[] = []
      await table.db.transaction('rw', table, async () => {
        for (const row of rows) {
          const existing = await table.get(row.id)
          const decision = resolve(policy, row, existing)
          if (decision.action === 'apply') {
            await table.put(decision.row)
            applied++
          } else if (decision.action === 'conflict') {
            // Nothing is written. The stored row stands until a human picks,
            // so the worst case is "unchanged", never "silently overwritten".
            conflicts.push({ incoming: decision.incoming, existing: decision.existing, reason: decision.reason })
            skipped++
          } else {
            skipped++
          }
        }
      })
      return { applied, skipped, conflicts }
    },
  }
}
