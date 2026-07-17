// Generic CSV parsing + column-mapping for importing a client roster
// exported from another platform (TrueCoach, Trainerize, My PT Hub, a plain
// spreadsheet, etc). Every one of those tools' exports differs in column
// names and order, so rather than hard-coding a schema per platform, the
// coach maps their own file's columns to Coachwright fields once, in the UI.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(cell => cell.trim() !== ''))
}

export const CLIENT_IMPORT_FIELDS = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'lastName', label: 'Last name', required: true },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'goals', label: 'Goals / notes' },
  { key: 'tags', label: 'Tags (comma or ; separated)' },
  { key: 'startDate', label: 'Start date' },
  { key: 'ignore', label: "Don't import" },
] as const
export type ClientImportFieldKey = (typeof CLIENT_IMPORT_FIELDS)[number]['key']

/** Guess a mapping from a header row by loosely matching common export column names. */
export function guessMapping(headerRow: string[]): ClientImportFieldKey[] {
  const guesses: Record<string, ClientImportFieldKey> = {
    firstname: 'firstName', 'first name': 'firstName', first: 'firstName', 'client first name': 'firstName',
    lastname: 'lastName', 'last name': 'lastName', last: 'lastName', 'client last name': 'lastName',
    name: 'firstName', 'full name': 'firstName', client: 'firstName',
    email: 'email', 'email address': 'email',
    phone: 'phone', 'phone number': 'phone', mobile: 'phone', cell: 'phone',
    goals: 'goals', goal: 'goals', notes: 'goals', 'client goals': 'goals',
    tags: 'tags', tag: 'tags', groups: 'tags', group: 'tags',
    'start date': 'startDate', joined: 'startDate', 'date joined': 'startDate', 'signup date': 'startDate', created: 'startDate',
  }
  return headerRow.map(h => guesses[h.trim().toLowerCase()] ?? 'ignore')
}

export interface MappedClientRow {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  goals?: string
  tags?: string[]
  startDate?: string
  /** true if this row is missing a required field and will be skipped */
  invalid: boolean
}

/** A "Full name" column (common in exports) is split on the first space so
 *  it still lands correctly in Coachwright's separate first/last fields. */
function splitFullName(value: string): [string, string] {
  const trimmed = value.trim()
  const idx = trimmed.indexOf(' ')
  return idx === -1 ? [trimmed, ''] : [trimmed.slice(0, idx), trimmed.slice(idx + 1)]
}

export function mapCsvRows(rows: string[][], mapping: ClientImportFieldKey[]): MappedClientRow[] {
  const fullNameCols = mapping.map((m, i) => (m === 'firstName' ? i : -1)).filter(i => i !== -1)
  const hasSeparateLastName = mapping.includes('lastName')

  return rows.map(cells => {
    const out: MappedClientRow = { firstName: '', lastName: '', invalid: false }
    for (let i = 0; i < mapping.length; i++) {
      const field = mapping[i]
      const value = (cells[i] ?? '').trim()
      if (!value || field === 'ignore') continue
      if (field === 'firstName') {
        if (!hasSeparateLastName && fullNameCols[0] === i) {
          const [first, last] = splitFullName(value)
          out.firstName = first
          if (last) out.lastName = last
        } else {
          out.firstName = value
        }
      } else if (field === 'lastName') {
        out.lastName = value
      } else if (field === 'tags') {
        out.tags = value.split(/[,;]/).map(t => t.trim()).filter(Boolean)
      } else {
        out[field] = value
      }
    }
    out.invalid = !out.firstName.trim()
    return out
  })
}
