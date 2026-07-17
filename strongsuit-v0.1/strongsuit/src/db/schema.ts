import Dexie, { type Table } from 'dexie'
import { DB_NAME } from '@/lib/brand'
import type {
  Trainer, Client, ClientNote, Exercise, Program, SessionLog,
  CheckIn, Metric, Payment, Appointment, Expense, Waiver, Device,
  CoachMessage
} from './types'

// Envelope schema version. Bumped 1→2 (expenses), 2→3 (waivers + devices, v1.3).
// A newer envelope is rejected by older apps with the "made with a newer version" message.
export const SCHEMA_VERSION = 5

export class CoachwrightDB extends Dexie {
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
  waivers!: Table<Waiver, string>
  devices!: Table<Device, string>
  messages!: Table<CoachMessage, string>

  // DB_NAME stays 'strongsuit' post-rename so existing IndexedDB data survives
  // the Coachwright rebrand (see lib/brand.ts). Never repoint without migration.
  constructor(name = DB_NAME) {
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

    // v1.3: liability records + paired sync devices. Appointments gain
    // seriesId (recurring) — indexed for series queries.
    this.version(4).stores({
      appointments: 'id, clientId, start, seriesId',
      waivers: 'id, clientId, kind',
      devices: 'id, clientId, role',
    }).upgrade(_tx => {})

    this.version(5).stores({
      messages: 'id, clientId, date',
    }).upgrade(_tx => {})
  }
}

export const db = new CoachwrightDB()

export const ALL_TABLES = [
  'trainer', 'clients', 'clientNotes', 'exercises', 'programs', 'sessionLogs',
  'checkIns', 'metrics', 'payments', 'appointments', 'expenses', 'waivers', 'devices',
  'messages',
] as const
export type TableName = (typeof ALL_TABLES)[number]
