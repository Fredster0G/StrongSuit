// ===== Strongsuit data model (spec §2.4) =====
// All entities carry id (ULID), createdAt, updatedAt (ISO strings).

export interface Base {
  id: string
  createdAt: string
  updatedAt: string
}

export type Units = 'lb' | 'kg'

export interface Trainer extends Base {
  businessName: string
  trainerName: string
  logoDataUrl?: string
  brandColor?: string
  units: Units
  weekStartsOn: 0 | 1
  defaultRestSeconds: number
  currency: string
  lastBackupAt?: string
  onboardingComplete: boolean
  companionCredit: boolean // show "Built with Strongsuit" footer in Companion
  density: 'compact' | 'comfortable'
  theme: 'light' | 'dark' | 'system'
  monthlyProfitTarget?: number // Profit Planner goal (Business page)
}

export type ClientStatus = 'active' | 'paused' | 'archived'
export type BillingModel = 'per-session' | 'monthly' | 'package'

// Nutrition profile (spec §4.18a) — all optional, no schema index needed
export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra'
export type NutritionGoal = 'cut' | 'maintain' | 'gain'

/** What the gym/facility takes from this client's income (spec §4.17b). */
export interface GymCut {
  kind: 'percent' | 'flat-monthly'
  value: number // percent (0–100) or currency per month
}

export interface Client extends Base {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  photoDataUrl?: string
  status: ClientStatus
  goals: string
  injuries: string
  parqNotes: string
  tags: string[]
  startDate: string
  sessionRate?: number
  billingModel?: BillingModel
  activeProgramId?: string
  archivedAt?: string
  isDemo?: boolean
  // nutrition profile (unindexed, added v1.2)
  sex?: Sex
  heightCm?: number
  birthDate?: string       // yyyy-MM-dd
  activityLevel?: ActivityLevel
  nutritionGoal?: NutritionGoal
  // facility cut on this client's income (unindexed, added v1.2)
  gymCut?: GymCut
}

export interface ClientNote extends Base {
  clientId: string
  content: string
}

export type ExerciseCategory =
  | 'squat' | 'hinge' | 'push' | 'pull' | 'lunge'
  | 'carry' | 'core' | 'conditioning' | 'mobility'

export type TrackingType = 'weight_reps' | 'reps' | 'time' | 'distance' | 'rpe_only'

export interface Exercise extends Base {
  name: string
  aliases: string[]
  category: ExerciseCategory
  primaryMuscles: string[]
  equipment: string[]
  videoUrl?: string
  cues: string[]
  isCustom: boolean
  defaultTracking: TrackingType
}

// ---- Program structure (embedded JSON on Program.weeks) ----
export type LoadMode = 'absolute' | 'percent1rm' | 'rpe' | 'note'
export type BlockType = 'straight' | 'superset' | 'circuit' | 'interval' | 'warmup' | 'cooldown'

export interface SetPrescription {
  reps?: string          // "8" | "8-10" | "AMRAP"
  load?: number          // meaning depends on loadMode
  loadMode?: LoadMode
  loadNote?: string      // when loadMode === 'note'
  timeSeconds?: number
  distanceM?: number
  rpe?: number
}

export interface ExercisePrescription {
  id: string             // ULID — stable row identity for dnd/undo
  exerciseId: string
  sets: SetPrescription[]
  restSeconds?: number
  tempo?: string
  note?: string
}

export interface Block {
  id: string
  type: BlockType
  label?: string          // e.g. "A", "B1/B2", "Finisher"
  intervalSpec?: string   // e.g. "EMOM 10", "AMRAP 12"
  exercises: ExercisePrescription[]
}

export interface Day {
  id: string
  name: string            // "Day 1 — Lower"
  blocks: Block[]
}

export interface Week {
  id: string
  label: string           // "Week 1"
  days: Day[]
}

export type ProgramStatus = 'draft' | 'active' | 'completed' | 'template'

export interface Program extends Base {
  name: string
  description: string
  clientId?: string       // undefined = library template
  goalTag?: string
  weeks: Week[]
  status: ProgramStatus
  startDate?: string
  progressionPolicy?: ProgressionPolicy
  sourceTemplateId?: string
}

export type ProgressionPolicy =
  | { kind: 'linear-load'; percent: number }
  | { kind: 'double-progression'; repRange: [number, number]; loadIncrement: number }
  | { kind: 'rpe-target'; target: number }

// ---- Logging ----
export interface LoggedSet {
  targetReps?: string
  targetLoad?: number
  targetLoadMode?: LoadMode
  actualReps?: number
  actualLoad?: number
  actualTimeSeconds?: number
  rpe?: number
  done: boolean
}

export interface LogEntry {
  exerciseId: string
  sets: LoggedSet[]
  notes?: string
}

export type DataSource = 'trainer' | 'companion-import'

export interface SessionLog extends Base {
  clientId: string
  programId?: string
  weekId?: string
  dayId?: string
  date: string            // yyyy-MM-dd
  title: string
  entries: LogEntry[]
  sessionNotes?: string
  source: DataSource
}

export interface CheckIn extends Base {
  clientId: string
  date: string
  mood?: number
  sleepHours?: number
  bodyweight?: number
  energy?: number
  adherence?: number
  answers: { question: string; answer: string }[]
  source: DataSource
}

export type MetricType = 'bodyweight' | 'bodyfat' | 'measurement' | 'custom'

export interface Metric extends Base {
  clientId: string
  date: string
  type: MetricType
  key: string             // 'bodyweight' | 'waist' | custom name
  value: number
  unit: string
}

export type PaymentType = 'payment' | 'session-credit' | 'refund'

export interface Payment extends Base {
  clientId: string
  date: string
  amount: number
  method?: string
  memo?: string
  type: PaymentType
  sessions?: number       // for session-credit packs
}

// ---- Expenses (Profit Planner) ----
export type ExpenseCategory =
  | 'rent' | 'equipment' | 'insurance' | 'software'
  | 'education' | 'marketing' | 'travel' | 'other'

export type ExpenseRecurrence = 'one-time' | 'monthly'

export interface Expense extends Base {
  date: string            // yyyy-MM-dd; for monthly, the first month it applies
  amount: number
  category: ExpenseCategory
  memo?: string
  recurrence: ExpenseRecurrence
  endDate?: string        // monthly only: last month it applies (inclusive)
}

export interface Appointment extends Base {
  clientId?: string
  title: string
  start: string           // ISO datetime
  end: string
  recurrence?: 'none' | 'weekly'
  location?: string
  notes?: string
}

export interface BackupEnvelope {
  app: 'strongsuit'
  schemaVersion: number
  exportedAt: string
  encrypted: false
  data: {
    trainer: Trainer[]
    clients: Client[]
    clientNotes: ClientNote[]
    exercises: Exercise[]
    programs: Program[]
    sessionLogs: SessionLog[]
    checkIns: CheckIn[]
    metrics: Metric[]
    payments: Payment[]
    appointments: Appointment[]
    expenses?: Expense[]  // added schema v2 envelopes; absent in v1 backups
  }
}
