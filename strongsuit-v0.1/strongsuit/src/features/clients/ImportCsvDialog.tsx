import { useMemo, useState } from 'react'
import { clientsRepo } from '@/db/repo'
import { today } from '@/lib/core'
import { CLIENT_IMPORT_FIELDS, guessMapping, mapCsvRows, type ClientImportFieldKey } from '@/lib/csv'
import { canAddClient, FREE_TIER_CLIENT_LIMIT } from '@/lib/membership'
import { Dialog, Button, Select, Table, Tag, toast } from '@/design'
import type { Client } from '@/db/types'
import { useTranslation } from '@/lib/i18n'

// Any platform's client-roster export (TrueCoach, Trainerize, My PT Hub, a
// plain spreadsheet) lands here as raw CSV rows — the coach maps columns to
// Coachwright fields once, sees a live preview, then imports. No platform's
// export schema needs to be hard-coded.
export default function ImportCsvDialog({ headerRow, dataRows, open, onClose, activeClientCount, hasActiveMembership }: {
  headerRow: string[]
  dataRows: string[][]
  open: boolean
  onClose: () => void
  activeClientCount: number
  hasActiveMembership: boolean
}) {
  const [mapping, setMapping] = useState<ClientImportFieldKey[]>(() => guessMapping(headerRow))
  const [importing, setImporting] = useState(false)
  const { t } = useTranslation()

  const mapped = useMemo(() => mapCsvRows(dataRows, mapping), [dataRows, mapping])
  const validCount = mapped.filter(r => !r.invalid).length
  // A CSV can add dozens of clients in one shot — the same free-tier cap
  // enforced one-by-one in NewClientDialog has to apply here too, or the cap
  // is trivially bypassed by importing instead of adding manually.
  const remainingSlots = hasActiveMembership ? Infinity : Math.max(0, FREE_TIER_CLIENT_LIMIT - activeClientCount)
  const importCount = Math.min(validCount, remainingSlots)
  const cap = canAddClient(activeClientCount, hasActiveMembership)

  function setColumn(i: number, field: ClientImportFieldKey) {
    setMapping(m => m.map((v, idx) => (idx === i ? field : v)))
  }

  async function runImport() {
    setImporting(true)
    try {
      let count = 0
      for (const row of mapped) {
        if (row.invalid) continue
        if (count >= remainingSlots) break
        await clientsRepo.create({
          firstName: row.firstName,
          lastName: row.lastName || '—',
          email: row.email,
          phone: row.phone,
          goals: row.goals,
          tags: row.tags ?? [],
          startDate: row.startDate || today(),
          status: 'active',
          parqNotes: '',
        } as Omit<Client, 'id' | 'createdAt' | 'updatedAt'>)
        count++
      }
      const skipped = validCount - count
      toast(skipped > 0
        ? (count === 1 ? t('clients.toast.importSkipped', { count, skipped, limit: FREE_TIER_CLIENT_LIMIT }) : t('clients.toast.importSkippedPlural', { count, skipped, limit: FREE_TIER_CLIENT_LIMIT }))
        : (count === 1 ? t('clients.toast.importOne', { name: 'CSV import', count }) : t('clients.toast.importMany', { count })))
      onClose()
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('clients.importCsv.title')} width={720}>
      <p className="mb-3 text-xs text-muted">
        {t('clients.importCsv.description')}
      </p>
      {!cap.allowed && (
        <p className="mb-3 rounded-ctl border border-red-600/40 bg-red-100/40 px-3 py-2 text-xs text-red-700">
          {cap.reason}
        </p>
      )}
      {cap.allowed && importCount < validCount && (
        <p className="mb-3 rounded-ctl border border-line bg-surface2 px-3 py-2 text-xs text-muted">
          {t('clients.importCsv.capWarning', { importCount, validCount, limit: FREE_TIER_CLIENT_LIMIT })}
        </p>
      )}
      <div className="max-h-80 overflow-auto rounded-ctl border border-line">
        <Table
          head={
            <>
              {headerRow.map((h, i) => (
                <th key={i} className="min-w-[140px]">
                  <div className="mb-1 font-medium text-ink">{h || t('clients.importCsv.column', { num: i + 1 })}</div>
                  <Select className="!h-7 w-full text-xs" value={mapping[i]} onChange={e => setColumn(i, e.target.value as ClientImportFieldKey)}>
                    {CLIENT_IMPORT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </Select>
                </th>
              ))}
            </>
          }
        >
          {dataRows.slice(0, 8).map((row, i) => (
            <tr key={i} className={mapped[i]?.invalid ? 'opacity-40' : ''}>
              {row.map((cell, j) => <td key={j} className="max-w-[160px] truncate">{cell}</td>)}
            </tr>
          ))}
        </Table>
      </div>
      {dataRows.length > 8 && <p className="mt-1.5 text-2xs text-faint">{t('clients.importCsv.rowsNotShown', { count: dataRows.length - 8 })}</p>}

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <div className="text-xs text-muted">
          <Tag tone={validCount > 0 ? 'verde' : 'red'}>{t('clients.importCsv.rowsReady', { valid: validCount, total: dataRows.length })}</Tag>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" onClick={runImport} disabled={validCount === 0 || importCount === 0 || importing}>
            {importing ? t('clients.importCsv.importing') : (importCount === 1 ? t('clients.importCsv.importCount', { count: importCount }) : t('clients.importCsv.importCountPlural', { count: importCount }))}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
