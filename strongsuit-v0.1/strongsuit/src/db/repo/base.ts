import type { Table } from 'dexie'
import { nowIso, stamp } from '@/lib/core'
import type { Base } from '../types'

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
    /** ULID-keyed upsert for backup merge: newest updatedAt wins (spec §2.5.3). */
    async mergeUpsert(rows: T[]): Promise<{ applied: number; skipped: number }> {
      let applied = 0
      let skipped = 0
      await table.db.transaction('rw', table, async () => {
        for (const row of rows) {
          const existing = await table.get(row.id)
          if (!existing || new Date(row.updatedAt) >= new Date(existing.updatedAt)) {
            await table.put(row)
            applied++
          } else {
            skipped++
          }
        }
      })
      return { applied, skipped }
    },
  }
}
