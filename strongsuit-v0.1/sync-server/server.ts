import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import * as dotenv from 'dotenv'
import { rateLimit } from 'express-rate-limit'

dotenv.config()

const app = express()
const port = process.env.PORT || 4000

// Rate limit: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

app.use(cors())
app.use(limiter)
app.use(express.json({ limit: '5mb' })) // Reduced from 50mb to prevent memory exhaustion

// Basic API Key authorization to prevent unauthorized abuse
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key']
  const serverKey = process.env.API_KEY || 'default-coachwright-key'
  if (apiKey !== serverKey) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

// Initialize SQLite database
// This stores encrypted JSON blobs for each "Coach" and their "Clients"
const db = new Database('coachwright.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS sync_payloads (
    id TEXT PRIMARY KEY,       -- Either coachId or clientId
    type TEXT,                 -- 'coach' or 'client'
    coach_id TEXT,             -- The coach this belongs to
    encrypted_payload TEXT,    -- The E2E encrypted JSON blob
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Push an encrypted payload to the server
app.post('/sync/push', (req, res) => {
  const { id, type, coachId, encryptedPayload } = req.body

  if (!id || !type || !coachId || !encryptedPayload) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const stmt = db.prepare(`
    INSERT INTO sync_payloads (id, type, coach_id, encrypted_payload, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET 
      encrypted_payload = excluded.encrypted_payload,
      updated_at = CURRENT_TIMESTAMP
  `)

  try {
    stmt.run(id, type, coachId, encryptedPayload)
    res.json({ success: true })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Pull an encrypted payload from the server
// Type: 'coach' (clients pull this) or 'client' (coach pulls this)
// For 'client', id = clientId. For 'coach', id = coachId.
app.get('/sync/pull/:type/:id', (req, res) => {
  const { type, id } = req.params

  const stmt = db.prepare(`SELECT encrypted_payload FROM sync_payloads WHERE id = ? AND type = ?`)
  const row = stmt.get(id, type) as any

  if (row) {
    res.json({ success: true, encryptedPayload: row.encrypted_payload })
  } else {
    // Return empty state if no payload found
    res.json({ success: true, encryptedPayload: null })
  }
})

// Coach pulls all their clients' payloads
app.get('/sync/pull/clients/:coachId', (req, res) => {
  const { coachId } = req.params

  const stmt = db.prepare(`SELECT id, encrypted_payload FROM sync_payloads WHERE coach_id = ? AND type = 'client'`)
  const rows = stmt.all(coachId) as any[]

  const payloads: Record<string, string> = {}
  for (const row of rows) {
    payloads[row.id] = row.encrypted_payload
  }

  res.json({ success: true, payloads })
})

app.listen(port, () => {
  console.log(`Coachwright Cloud Sync Server running on port ${port}`)
})
