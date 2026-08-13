// ===== Backup/restore — the free, always-available sync path =====
// A plain JSON file with everything in this profile's local database. No
// encryption/versioning envelope like the coach app's backup.ts yet (v1 —
// grow this if/when it needs to match that sophistication); it's a real,
// working round trip today, which is the bar that matters.

import { db } from './schema'
import { ALL_TABLES, type TableName } from './types'

export interface CompanionBackup {
  app: 'coachwright-companion'
  version: 1
  exportedAt: string
  data: Partial<Record<TableName, unknown[]>>
}

export async function exportBackup(): Promise<CompanionBackup> {
  const data: Partial<Record<TableName, unknown[]>> = {}
  for (const table of ALL_TABLES) {
    data[table] = await db.table(table).toArray()
  }
  return { app: 'coachwright-companion', version: 1, exportedAt: new Date().toISOString(), data }
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Replaces everything currently in this profile with what's in the backup —
 *  the same "Replace everything" semantics the coach app offers (merge-by-
 *  newest is a reasonable future addition once this needs to reconcile two
 *  non-empty databases; a fresh phone restoring its only backup doesn't). */
export async function importBackup(text: string): Promise<void> {
  const parsed = JSON.parse(text) as CompanionBackup
  if (parsed.app !== 'coachwright-companion') {
    throw new Error('That file is not a Coachwright Companion backup.')
  }
  await db.transaction('rw', ALL_TABLES.map(t => db.table(t)), async () => {
    for (const table of ALL_TABLES) {
      await db.table(table).clear()
      const rows = parsed.data[table]
      if (rows?.length) await db.table(table).bulkAdd(rows)
    }
  })
}
