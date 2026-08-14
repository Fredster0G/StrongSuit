import { describe, it, expect } from 'vitest'
import { formatClientContext } from './assistantContext'

describe('formatClientContext', () => {
  it('includes name, readiness, and recent sessions when all are present', () => {
    const text = formatClientContext({
      name: 'Sam Rivera',
      latestReadiness: { score: 42, band: 'easy', date: '2026-08-10', drivers: ['low sleep', 'high soreness'] },
      recentSessions: [
        { date: '2026-08-09', title: 'Push Day', setsDone: 12, setsLogged: 15 },
        { date: '2026-08-06', title: 'Pull Day', setsDone: 14, setsLogged: 14 },
      ],
    })
    expect(text).toContain('Client: Sam Rivera')
    expect(text).toContain('42/100')
    expect(text).toContain('"easy"')
    expect(text).toContain('low sleep, high soreness')
    expect(text).toContain('2026-08-09 "Push Day": 12/15 sets completed')
    expect(text).toContain('2026-08-06 "Pull Day": 14/14 sets completed')
  })

  it('states plainly when there is no readiness data, rather than omitting it silently', () => {
    const text = formatClientContext({ name: 'Sam Rivera', recentSessions: [] })
    expect(text).toContain('No readiness check-ins logged yet.')
  })

  it('states plainly when there are no sessions', () => {
    const text = formatClientContext({ name: 'Sam Rivera', recentSessions: [] })
    expect(text).toContain('No sessions logged yet.')
  })

  it('omits the drivers parenthetical when there are none', () => {
    const text = formatClientContext({
      name: 'Sam Rivera',
      latestReadiness: { score: 80, band: 'go', date: '2026-08-10', drivers: [] },
      recentSessions: [],
    })
    expect(text).toContain('80/100, "go".')
    expect(text).not.toContain('()')
  })

  it('includes the latest Film Room note when one was sent to this client', () => {
    const text = formatClientContext({
      name: 'Sam Rivera',
      recentSessions: [],
      latestFilmRoomNote: { date: '2026-08-11T10:00:00.000Z', text: "Notes on Sam Rivera's lift:\n\n3 reps tracked." },
    })
    expect(text).toContain('Latest Film Room analysis, 2026-08-11T10:00:00.000Z:')
    expect(text).toContain('3 reps tracked.')
  })

  it('states plainly when no Film Room analysis has ever been sent', () => {
    const text = formatClientContext({ name: 'Sam Rivera', recentSessions: [] })
    expect(text).toContain('No Film Room analysis has been sent to this client yet.')
  })
})
