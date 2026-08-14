import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { Button, Card, toast } from '@/design'
import { pendingConflicts, resolveConflict } from './syncApi'
import type { Conflict } from '@/lib/conflict'
import { useTranslation, type MessageKey } from '@/lib/i18n'

/**
 * Rows two devices disagree about, waiting for a person.
 *
 * This should be empty almost always — and when it isn't, that is the sync
 * layer refusing to guess rather than the sync layer failing. The alternative
 * it replaces was worse and invisible: whichever packet arrived last silently
 * overwrote the other, so a trainer's logged work or a recorded payment could
 * disappear with nothing on screen to show it ever existed.
 *
 * Renders nothing when there is nothing to settle, so it costs a coach who
 * never hits a conflict exactly zero attention.
 */
export function ConflictsCard() {
  const [rows, setRows] = useState<Conflict[]>([])
  const { t } = useTranslation()

  const refresh = useCallback(async () => setRows(await pendingConflicts()), [])
  useEffect(() => { void refresh() }, [refresh])

  async function choose(c: Conflict, side: 'incoming' | 'existing') {
    await resolveConflict(c.id, side)
    toast(side === 'incoming' ? t('sync.conflict.keptIncoming') : t('sync.conflict.keptExisting'))
    await refresh()
  }

  if (rows.length === 0) return null

  return (
    <Card className="border-ember-500/40">
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangle size={16} className="text-ember-600" />
        <p className="font-display text-base font-semibold text-ink">
          {t('sync.conflict.title', { count: String(rows.length), s: rows.length === 1 ? '' : 's' })}
        </p>
      </div>
      <p className="text-xs text-muted">
        {t('sync.conflict.body')}
      </p>
      <div className="mt-3 space-y-3">
        {rows.map(c => <ConflictRow key={c.id} conflict={c} onChoose={choose} />)}
      </div>
    </Card>
  )
}

function ConflictRow({ conflict, onChoose }: {
  conflict: Conflict
  onChoose: (c: Conflict, side: 'incoming' | 'existing') => void
}) {
  const incoming = safeParse(conflict.incomingJson)
  const existing = safeParse(conflict.existingJson)
  const fields = differingFields(incoming, existing)
  const { t } = useTranslation()

  return (
    <div className="rounded-ctl border border-line p-3">
      <p className="text-xs font-medium text-ink">{describe(conflict.table, t)}</p>
      <p className="mt-0.5 text-2xs text-muted">{conflict.reason}</p>

      {/* Show only what actually differs. Dumping two whole records side by
          side would make the coach hunt for the difference, which is how a
          wrong choice gets made. */}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-2xs">
          <thead className="text-faint">
            <tr>
              <th className="py-1 pe-3 text-start font-medium">{t('sync.conflict.fieldCol')}</th>
              <th className="py-1 pe-3 text-start font-medium">{t('sync.conflict.existingCol')}</th>
              <th className="py-1 text-start font-medium">{t('sync.conflict.incomingCol')}</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {fields.map(f => (
              <tr key={f} className="border-t border-line/60">
                <td className="py-1 pe-3 font-sans text-muted">{f}</td>
                <td className="py-1 pe-3 text-ink">{preview(existing?.[f])}</td>
                <td className="py-1 text-ink">{preview(incoming?.[f])}</td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr><td colSpan={3} className="py-1 text-faint">{t('sync.conflict.sameValues')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2.5 flex gap-2">
        <Button size="sm" variant="primary" onClick={() => onChoose(conflict, 'existing')} className="gap-1.5">
          <Check size={13} /> {t('sync.conflict.keepExistingBtn')}
        </Button>
        <Button size="sm" onClick={() => onChoose(conflict, 'incoming')}>
          {t('sync.conflict.keepIncomingBtn')}
        </Button>
      </div>
    </div>
  )
}

function safeParse(json: string): Record<string, unknown> | null {
  try { return JSON.parse(json) as Record<string, unknown> } catch { return null }
}

/** Fields that actually differ, ignoring the bookkeeping ones a coach can do
 *  nothing useful with. */
function differingFields(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): string[] {
  if (!a || !b) return []
  const ignored = new Set(['id', 'createdAt', 'updatedAt'])
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter(k => !ignored.has(k)))
  return [...keys].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort()
}

function preview(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 40)}…` : v
  const json = JSON.stringify(v)
  return json.length > 40 ? `${json.slice(0, 40)}…` : json
}

const TABLE_KEYS: Record<string, MessageKey> = {
  payments: 'sync.conflict.tables.payments',
  invoices: 'sync.conflict.tables.invoices',
  sessionLogs: 'sync.conflict.tables.sessionLogs',
  clients: 'sync.conflict.tables.clients',
  programs: 'sync.conflict.tables.programs',
}

function describe(table: string, t: (k: MessageKey, opts?: Record<string, string>) => string): string {
  const key = TABLE_KEYS[table]
  if (key) return t(key)
  return t('sync.conflict.tables.default', { table })
}
