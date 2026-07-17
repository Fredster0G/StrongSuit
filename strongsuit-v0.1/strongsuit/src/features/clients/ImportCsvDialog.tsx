import { useMemo, useState } from 'react'
import { clientsRepo } from '@/db/repo'
import { today } from '@/lib/core'
import { CLIENT_IMPORT_FIELDS, guessMapping, mapCsvRows, type ClientImportFieldKey } from '@/lib/csv'
import { Dialog, Button, Select, Table, Tag, toast } from '@/design'
import type { Client } from '@/db/types'

// Any platform's client-roster export (TrueCoach, Trainerize, My PT Hub, a
// plain spreadsheet) lands here as raw CSV rows — the coach maps columns to
// Coachwright fields once, sees a live preview, then imports. No platform's
// export schema needs to be hard-coded.
export default function ImportCsvDialog({ headerRow, dataRows, open, onClose }: {
  headerRow: string[]
  dataRows: string[][]
  open: boolean
  onClose: () => void
}) {
  const [mapping, setMapping] = useState<ClientImportFieldKey[]>(() => guessMapping(headerRow))
  const [importing, setImporting] = useState(false)

  const mapped = useMemo(() => mapCsvRows(dataRows, mapping), [dataRows, mapping])
  const validCount = mapped.filter(r => !r.invalid).length

  function setColumn(i: number, field: ClientImportFieldKey) {
    setMapping(m => m.map((v, idx) => (idx === i ? field : v)))
  }

  async function runImport() {
    setImporting(true)
    try {
      let count = 0
      for (const row of mapped) {
        if (row.invalid) continue
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
      toast(`Imported ${count} client${count === 1 ? '' : 's'}.`)
      onClose()
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Import client roster" width={720}>
      <p className="mb-3 text-xs text-muted">
        Match each column from your file to a Coachwright field. Rows without a first name are skipped.
      </p>
      <div className="max-h-80 overflow-auto rounded-ctl border border-line">
        <Table
          head={
            <>
              {headerRow.map((h, i) => (
                <th key={i} className="min-w-[140px]">
                  <div className="mb-1 font-medium text-ink">{h || `Column ${i + 1}`}</div>
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
      {dataRows.length > 8 && <p className="mt-1.5 text-2xs text-faint">+ {dataRows.length - 8} more rows not shown</p>}

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <div className="text-xs text-muted">
          <Tag tone={validCount > 0 ? 'verde' : 'red'}>{validCount} of {dataRows.length} rows ready</Tag>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={runImport} disabled={validCount === 0 || importing}>
            {importing ? 'Importing…' : `Import ${validCount} client${validCount === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
