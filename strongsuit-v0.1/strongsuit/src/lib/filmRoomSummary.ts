// ===== Film Room notes + natural-language summary (spec §4.16c) =====
// Turns a tracked set's raw numbers + a coach's timestamped notes into a
// plain-English block a client can actually read — not a stats table.

import type { Rep } from './pose'

export interface FilmNote { id: string; tMs: number; text: string }

function fmtNoteTime(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export interface FilmRoomStats {
  reps: Rep[]
  symmetryPct?: number | null
  depthConsistency?: number | null
  tempoConsistency?: number | null
  barPathDriftPct?: number | null
}

/** Compose a plain-English summary of a tracked set + timestamped notes —
 *  written to be read by a client, not a coach reading a stats table. */
export function buildFilmRoomSummary(stats: FilmRoomStats, notes: FilmNote[], clientName?: string): string {
  const lines: string[] = []
  lines.push(clientName ? `Notes on ${clientName}'s lift:` : 'Notes on this lift:')

  if (stats.reps.length > 0) {
    lines.push('')
    const last = stats.reps.at(-1)!
    const repWord = stats.reps.length === 1 ? 'rep' : 'reps'
    lines.push(`${stats.reps.length} ${repWord} tracked. Last rep: ${(last.eccentricMs / 1000).toFixed(1)}s down, ${(last.concentricMs / 1000).toFixed(1)}s up, ${last.depth}% of target depth.`)

    if (stats.depthConsistency != null) {
      lines.push(stats.depthConsistency >= 80
        ? `Depth stayed consistent across reps (${stats.depthConsistency}% consistency).`
        : `Depth varied more than ideal across reps (${stats.depthConsistency}% consistency) — worth a look at fatigue or bracing.`)
    }
    if (stats.tempoConsistency != null) {
      lines.push(stats.tempoConsistency >= 80
        ? `Tempo stayed even rep to rep (${stats.tempoConsistency}% consistency).`
        : `Tempo varied rep to rep (${stats.tempoConsistency}% consistency).`)
    }
    if (stats.symmetryPct != null) {
      lines.push(stats.symmetryPct >= 90
        ? `Left/right symmetry looked good (${stats.symmetryPct}%).`
        : `Left/right symmetry was off (${stats.symmetryPct}%) — worth watching for a one-sided compensation.`)
    }
    if (stats.barPathDriftPct != null) {
      lines.push(stats.barPathDriftPct <= 15
        ? `Bar path stayed close to vertical (${stats.barPathDriftPct}% drift).`
        : `The bar drifted noticeably off vertical (${stats.barPathDriftPct}% drift) — likely worth a cue to keep it over mid-foot.`)
    }
  }

  if (notes.length > 0) {
    lines.push('')
    lines.push('Timestamped notes:')
    for (const n of [...notes].sort((a, b) => a.tMs - b.tMs)) {
      lines.push(`• At ${fmtNoteTime(n.tMs)} — ${n.text}`)
    }
  }

  return lines.join('\n')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A self-contained, printable HTML stats sheet — used by FilmRoomPage to
 *  open a print window for a tracked set. Film Room's data is entirely
 *  in-memory (videos are never persisted), so this can't be a normal
 *  Dexie-backed sibling print route the way client-facing sheets are —
 *  it's generated from the live state and opened via window.open/document.write. */
export function buildFilmRoomStatsHtml(stats: FilmRoomStats, notes: FilmNote[], opts: { clientName?: string; exerciseName?: string } = {}): string {
  const title = opts.exerciseName ? `Film Room — ${opts.exerciseName}` : 'Film Room — Movement Stats'
  const repRows = stats.reps.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.bottomAngle}°</td>
      <td>${(r.eccentricMs / 1000).toFixed(1)}s / ${(r.concentricMs / 1000).toFixed(1)}s</td>
      <td>${r.depth}%</td>
    </tr>`).join('')

  const statCards = [
    stats.reps.length ? `<div class="stat"><b>${stats.reps.length}</b>Reps tracked</div>` : '',
    stats.depthConsistency != null ? `<div class="stat"><b>${stats.depthConsistency}%</b>Depth consistency</div>` : '',
    stats.tempoConsistency != null ? `<div class="stat"><b>${stats.tempoConsistency}%</b>Tempo consistency</div>` : '',
    stats.symmetryPct != null ? `<div class="stat"><b>${stats.symmetryPct}%</b>Symmetry</div>` : '',
    stats.barPathDriftPct != null ? `<div class="stat"><b>${stats.barPathDriftPct}%</b>Bar path drift</div>` : '',
  ].filter(Boolean).join('')

  const notesHtml = notes.length
    ? `<ul>${[...notes].sort((a, b) => a.tMs - b.tMs).map(n => `<li><strong>${fmtNoteTime(n.tMs)}</strong> — ${escapeHtml(n.text)}</li>`).join('')}</ul>`
    : '<p class="muted">No notes recorded.</p>'

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body { font-family: Arial, Helvetica, sans-serif; color: #171A1E; padding: 32px; max-width: 720px; margin: 0 auto; }
    h1 { font-size: 22px; margin-bottom: 4px; } h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .muted { color: #666; font-size: 13px; }
    .stats { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
    .stat { border: 1px solid #ccc; border-radius: 6px; padding: 8px 14px; font-size: 12px; color: #666; min-width: 100px; }
    .stat b { display: block; font-size: 20px; color: #171A1E; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
    ul { padding-left: 18px; font-size: 13px; } li { margin-bottom: 4px; }
    pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; background: #F7F6F3; border: 1px solid #ccc; border-radius: 6px; padding: 12px; }
    @media print { body { padding: 12px; } }
  </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${new Date().toLocaleDateString()}${opts.clientName ? ` · ${escapeHtml(opts.clientName)}` : ''}</p>
    ${statCards ? `<div class="stats">${statCards}</div>` : ''}
    ${stats.reps.length ? `<h2>Reps</h2><table><thead><tr><th>#</th><th>Bottom angle</th><th>Tempo (down/up)</th><th>Depth</th></tr></thead><tbody>${repRows}</tbody></table>` : ''}
    <h2>Notes</h2>${notesHtml}
    <h2>Summary for client</h2><pre>${escapeHtml(buildFilmRoomSummary(stats, notes, opts.clientName))}</pre>
  </body></html>`
}
