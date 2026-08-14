// ===== Real data assembled for the assistant, never invented by it =====
//
// `lib/assistant.ts`'s system prompt tells the model to answer only from
// context it's given — this is where that context actually comes from.
// Deliberately thin: name, the latest readiness check-in (reusing
// `readinessFromCheckIn`, the same scoring the Readiness page itself shows —
// the assistant explains the app's own number, it doesn't compute a
// different one), the last few logged sessions, and — since S15 — the most
// recent Film Room analysis, if one was ever sent to this client. No PRs, no
// business numbers, no program detail — small, real, and easy to verify
// against the app's own screens, rather than a large dump that's harder to
// check and slower to encode as tokens.

import { clientsRepo, checkInsRepo, logsRepo, messagesRepo } from '@/db/repo'
import { readinessFromCheckIn } from './readiness'
import { fullName } from './core'

export interface ClientSummary {
  name: string
  latestReadiness?: { score: number; band: string; date: string; drivers: string[] }
  recentSessions: { date: string; title: string; setsDone: number; setsLogged: number }[]
  latestFilmRoomNote?: { date: string; text: string }
}

/** Film Room's own video/tracking data is never persisted (see
 *  `filmRoomSummary.ts`'s header) — the only durable trace of an analysis is
 *  the plain-English summary a coach chose to send, logged as an outbound
 *  message. `buildFilmRoomSummary()` always opens with this exact phrase, so
 *  it's how a real Film Room note is told apart from an ordinary message
 *  logged through the same table — a real, if imperfect, marker, not a
 *  guess. */
const FILM_ROOM_MARKER = /^Notes on (.+'s lift|this lift):/

/** Pure text formatting, kept separate from the repo calls below so it's
 *  testable without IndexedDB. */
export function formatClientContext(summary: ClientSummary): string {
  const lines: string[] = [`Client: ${summary.name}`]

  if (summary.latestReadiness) {
    const r = summary.latestReadiness
    const drivers = r.drivers.length > 0 ? ` (${r.drivers.join(', ')})` : ''
    lines.push(`Latest readiness check-in, ${r.date}: ${r.score}/100, "${r.band}"${drivers}.`)
  } else {
    lines.push('No readiness check-ins logged yet.')
  }

  if (summary.recentSessions.length > 0) {
    lines.push('Recent sessions, newest first:')
    for (const s of summary.recentSessions) {
      lines.push(`- ${s.date} "${s.title}": ${s.setsDone}/${s.setsLogged} sets completed`)
    }
  } else {
    lines.push('No sessions logged yet.')
  }

  if (summary.latestFilmRoomNote) {
    lines.push(`Latest Film Room analysis, ${summary.latestFilmRoomNote.date}:`)
    lines.push(summary.latestFilmRoomNote.text)
  } else {
    lines.push('No Film Room analysis has been sent to this client yet.')
  }

  return lines.join('\n')
}

/** `null` when the client doesn't exist (deleted between opening the
 *  assistant and it actually loading, the only realistic case). */
export async function buildClientContext(clientId: string): Promise<string | null> {
  const client = await clientsRepo.get(clientId)
  if (!client) return null

  const checkIns = await checkInsRepo.table.where('clientId').equals(clientId).sortBy('date')
  const latestCheckIn = checkIns.at(-1)
  const readiness = latestCheckIn ? readinessFromCheckIn(latestCheckIn) : null

  const logs = await logsRepo.forClient(clientId) // newest first
  const recentSessions = logs.slice(0, 3).map(log => {
    const allSets = log.entries.flatMap(e => e.sets)
    return {
      date: log.date,
      title: log.title,
      setsLogged: allSets.length,
      setsDone: allSets.filter(s => s.done).length,
    }
  })

  const messages = await messagesRepo.table.where('clientId').equals(clientId).sortBy('date')
  const latestFilmRoomMessage = [...messages].reverse().find(m => FILM_ROOM_MARKER.test(m.content))

  return formatClientContext({
    name: fullName(client),
    latestReadiness: readiness && latestCheckIn
      ? { score: readiness.score, band: readiness.band, date: latestCheckIn.date, drivers: readiness.drivers }
      : undefined,
    recentSessions,
    latestFilmRoomNote: latestFilmRoomMessage
      // Capped so one long analysis can't crowd out the rest of the
      // context — the assistant still has the gist, and the coach has the
      // full text in Messages if they need to check it exactly.
      ? { date: latestFilmRoomMessage.date, text: latestFilmRoomMessage.content.slice(0, 600) }
      : undefined,
  })
}
