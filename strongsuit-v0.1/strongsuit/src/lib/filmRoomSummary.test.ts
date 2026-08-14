import { describe, it, expect } from 'vitest'
import { buildFilmRoomSummary, buildFilmRoomStatsHtml, type FilmNote } from './filmRoomSummary'
import type { Rep } from './pose'

const rep = (over: Partial<Rep> = {}): Rep => ({ bottomAngle: 90, eccentricMs: 1200, concentricMs: 900, depth: 100, ...over })

describe('buildFilmRoomSummary', () => {
  it('greets by client name when given one', () => {
    const out = buildFilmRoomSummary({ reps: [] }, [], 'Alex Rivera')
    expect(out).toContain("Notes on Alex Rivera's lift:")
  })

  it('falls back to a generic greeting with no client', () => {
    const out = buildFilmRoomSummary({ reps: [] }, [])
    expect(out).toContain('Notes on this lift:')
  })

  it('summarizes rep count and the last rep tempo/depth', () => {
    const out = buildFilmRoomSummary({ reps: [rep(), rep({ eccentricMs: 1500, concentricMs: 1100, depth: 95 })] }, [])
    expect(out).toContain('2 reps tracked')
    expect(out).toContain('1.5s down, 1.1s up, 95% of target depth')
  })

  it('flags low consistency/symmetry/bar-path scores distinctly from good ones', () => {
    const good = buildFilmRoomSummary({ reps: [rep()], depthConsistency: 90, tempoConsistency: 92, symmetryPct: 95, barPathDriftPct: 5 }, [])
    expect(good).toContain('stayed consistent')
    expect(good).toContain('stayed even')
    expect(good).toContain('looked good')
    expect(good).toContain('stayed close to vertical')

    const bad = buildFilmRoomSummary({ reps: [rep()], depthConsistency: 50, tempoConsistency: 40, symmetryPct: 70, barPathDriftPct: 30 }, [])
    expect(bad).toContain('varied more than ideal')
    expect(bad).toContain('varied rep to rep')
    expect(bad).toContain('was off')
    expect(bad).toContain('drifted noticeably')
  })

  it('lists timestamped notes sorted chronologically regardless of input order', () => {
    const notes: FilmNote[] = [
      { id: '2', tMs: 45000, text: 'good depth here' },
      { id: '1', tMs: 12000, text: 'elbow flares on the way up' },
    ]
    const out = buildFilmRoomSummary({ reps: [] }, notes)
    const iFirst = out.indexOf('0:12')
    const iSecond = out.indexOf('0:45')
    expect(iFirst).toBeGreaterThan(-1)
    expect(iSecond).toBeGreaterThan(iFirst)
    expect(out).toContain('At 0:12 — elbow flares on the way up')
    expect(out).toContain('At 0:45 — good depth here')
  })

  it('omits the stats/notes sections entirely when there is nothing to say', () => {
    const out = buildFilmRoomSummary({ reps: [] }, [])
    expect(out).not.toContain('reps tracked')
    expect(out).not.toContain('Timestamped notes')
  })
})

describe('buildFilmRoomStatsHtml', () => {
  it('escapes note text so it cannot inject markup into the print window', () => {
    const notes: FilmNote[] = [{ id: '1', tMs: 1000, text: '<script>alert(1)</script> & "quoted"' }]
    const html = buildFilmRoomStatsHtml({ reps: [] }, notes)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;quoted&quot;')
  })

  it('escapes the client name and exercise name in the title/header', () => {
    const html = buildFilmRoomStatsHtml({ reps: [] }, [], { clientName: '<b>Al</b>', exerciseName: '<i>Squat</i>' })
    expect(html).not.toContain('<b>Al</b>')
    expect(html).not.toContain('<i>Squat</i>')
    expect(html).toContain('&lt;b&gt;Al&lt;/b&gt;')
  })

  it('includes a rep table row per rep and the stat cards for whatever scores are present', () => {
    const html = buildFilmRoomStatsHtml({ reps: [rep()], symmetryPct: 88 }, [])
    expect(html).toContain('90°')
    expect(html).toContain('88%')
  })

  it('is valid enough to parse as HTML with a title element', () => {
    const html = buildFilmRoomStatsHtml({ reps: [] }, [], { exerciseName: 'Bench Press' })
    expect(html).toMatch(/<title>.*Bench Press.*<\/title>/)
  })
})
