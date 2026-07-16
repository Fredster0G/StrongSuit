import Dexie, { type Table } from 'dexie'
import type {
  Trainer, Client, ClientNote, Exercise, Program, SessionLog,
  CheckIn, Metric, Payment, Appointment, Expense,
} from './types'

// Envelope schema version. Bumped 1→2 when the expenses table was added:
// v2 backups are rejected by v1 apps with the "made with a newer version" message.
export const SCHEMA_VERSION = 2

export class StrongsuitDB extends Dexie {
  trainer!: Table<Trainer, string>
  clients!: Table<Client, string>
  clientNotes!: Table<ClientNote, string>
  exercises!: Table<Exercise, string>
  programs!: Table<Program, string>
  sessionLogs!: Table<SessionLog, string>
  checkIns!: Table<CheckIn, string>
  metrics!: Table<Metric, string>
  payments!: Table<Payment, string>
  appointments!: Table<Appointment, string>
  expenses!: Table<Expense, string>

  constructor(name = 'strongsuit') {
    super(name)
    // MIGRATION DOCTRINE (spec §2.5.1): never edit an existing version block.
    // Schema changes = append this.version(N+1).stores({...}).upgrade(tx => ...)
    this.version(1).stores({
      trainer: 'id',
      clients: 'id, status, lastName, *tags',
      exercises: 'id, name, category, isCustom',
      programs: 'id, clientId, status',
      sessionLogs: 'id, clientId, date, [clientId+date], programId',
      checkIns: 'id, clientId, date, [clientId+date]',
      metrics: 'id, clientId, [clientId+key], date',
      payments: 'id, clientId, date',
      appointments: 'id, clientId, start',
    })
    
    this.version(2).stores({
      clientNotes: 'id, clientId',
    }).upgrade(_tx => {})

    this.version(3).stores({
      expenses: 'id, date, category',
    }).upgrade(_tx => {})
  }
}

export const db = new StrongsuitDB()

export const ALL_TABLES = [
  'trainer', 'clients', 'clientNotes', 'exercises', 'programs', 'sessionLogs',
  'checkIns', 'metrics', 'payments', 'appointments', 'expenses',
] as const
export type TableName = (typeof ALL_TABLES)[number]
