import { describe, it, expect } from 'vitest'
import {
  symptomBurden, symptomReadinessContribution, symptomGuidance,
  summariseCycles, cycleFlags, personalPattern, contraceptiveNote,
  CYCLE_FRAMING, MIN_CYCLES_FOR_PATTERN, DISRUPTION_THRESHOLD,
  type CycleEntry,
} from './cycle'

const day = (date: string, over: Partial<CycleEntry> = {}): CycleEntry =>
  ({ date, bleeding: false, ...over })

/** A run of cycles `lengthDays` apart, each bleeding for 4 days. */
function cycles(count: number, lengthDays = 28, start = '2026-01-01'): CycleEntry[] {
  const out: CycleEntry[] = []
  const base = new Date(start + 'T00:00:00')
  for (let c = 0; c < count; c++) {
    for (let d = 0; d < lengthDays; d++) {
      const dt = new Date(base)
      dt.setDate(base.getDate() + c * lengthDays + d)
      out.push(day(dt.toISOString().slice(0, 10), { bleeding: d < 4 }))
    }
  }
  return out
}

describe('symptomBurden', () => {
  it('reports nothing when nothing is logged', () => {
    expect(symptomBurden(undefined).band).toBe('none')
    expect(symptomBurden(day('2026-01-01')).band).toBe('none')
  })

  it('bands by total severity and orders worst first', () => {
    const e = day('2026-01-01', { symptoms: { cramps: 3, fatigue: 2, headache: 1 } })
    const b = symptomBurden(e)
    expect(b.band).toBe('severe')
    expect(b.reported[0].symptom).toBe('cramps')
    expect(b.reported.map(r => r.symptom)).not.toContain('gi')
  })

  it('scales mild and moderate distinctly', () => {
    expect(symptomBurden(day('d', { symptoms: { cramps: 1 } })).band).toBe('mild')
    expect(symptomBurden(day('d', { symptoms: { cramps: 3, fatigue: 2 } })).band).toBe('moderate')
  })

  it('never bands a single maxed-out symptom as mild', () => {
    // A purely additive rule would call debilitating cramps "mild" because the
    // total is only 3 — and quietly tell the coach to push the session.
    expect(symptomBurden(day('d', { symptoms: { cramps: 3 } })).band).toBe('moderate')
    expect(symptomBurden(day('d', { symptoms: { headache: 3 } })).band).toBe('moderate')
  })
})

describe('symptomReadinessContribution', () => {
  it('is negative for symptoms and zero without them', () => {
    expect(symptomReadinessContribution(undefined)).toBe(0)
    expect(symptomReadinessContribution(day('d', { symptoms: { cramps: 1 } }))).toBeLessThan(0)
  })

  it('caps at −2 so it can’t dominate the whole readiness score', () => {
    // A bad symptom day is a real reason to autoregulate, but readiness also
    // weighs sleep, energy and load — one input must not swamp the rest.
    const worst = day('d', { symptoms: { cramps: 3, fatigue: 3, mood: 3, gi: 3, headache: 3 } })
    expect(symptomReadinessContribution(worst)).toBe(-2)
  })
})

describe('symptomGuidance — symptom-driven, never phase-driven', () => {
  it('says nothing on a symptom-free day', () => {
    expect(symptomGuidance(day('d'))).toBeNull()
  })

  it('scales the advice with severity and names the worst symptom', () => {
    const severe = symptomGuidance(day('d', { symptoms: { cramps: 3, fatigue: 3, mood: 3 } }))!
    expect(severe).toMatch(/cut load|technique/i)
    expect(severe).toMatch(/cramps/)

    expect(symptomGuidance(day('d', { symptoms: { fatigue: 1 } }))!).toMatch(/No change needed/)
  })

  it('never references a cycle phase', () => {
    // The doctrine test. Phase-based prescription is not supported by
    // McNulty 2020 / Colenso-Semple 2023, so no guidance may imply it.
    const outputs = [
      symptomGuidance(day('d', { symptoms: { cramps: 3, fatigue: 3, mood: 3 } })),
      symptomGuidance(day('d', { symptoms: { cramps: 2 } })),
      symptomGuidance(day('d', { symptoms: { fatigue: 1 } })),
    ]
    for (const o of outputs) {
      expect(o).not.toMatch(/follicular|luteal|ovulat|phase/i)
    }
  })
})

describe('voice — the same claim, said to two different readers', () => {
  // This module is shared byte-for-byte with Companion, where the reader is
  // the person themselves rather than their coach. The voice may change; the
  // claim, the hedging and the referral may not. These tests exist so a future
  // edit can't soften the self-facing copy while leaving the coach copy intact.
  const heavy = [
    ...cycles(4, 45),
    { date: '2026-01-02', bleeding: true, flow: 'heavy' as const },
  ]

  it('addresses the reader directly in self voice, never third-person', () => {
    const self = cycleFlags(heavy, undefined, 'self').messages.join(' ')
    expect(self).toMatch(/\byou\b|\byour\b/i)
    expect(self).not.toMatch(/\bthey\b|\btheir\b|\bthe client\b/i)
  })

  it('speaks to the person in self-voice guidance too, not just the flags', () => {
    // Found in the browser, not here: the flags were correctly re-voiced while
    // symptomGuidance still read "unless they say otherwise" — advice about
    // the reader, addressed to someone else.
    for (const s of [{ cramps: 3 as const }, { cramps: 2 as const }, { fatigue: 1 as const }]) {
      const g = symptomGuidance(day('d', { symptoms: s }), 'self')!
      expect(g).not.toMatch(/\bthey\b|\btheir\b|\bthem\b/i)
    }
  })

  it('keeps the iron-deficiency referral in both voices', () => {
    for (const v of ['coach', 'self'] as const) {
      const m = cycleFlags(heavy, undefined, v).messages.join(' ')
      expect(m).toMatch(/iron/i)
      expect(m).toMatch(/GP/)
    }
  })

  it('keeps the "do not solve this with programming" line in both voices', () => {
    // The single most important sentence in the module: cycle disruption is a
    // REDs indicator (Mountjoy 2023) and routes to a doctor, not a deload.
    for (const v of ['coach', 'self'] as const) {
      const f = cycleFlags(cycles(4, 45), undefined, v)
      expect(f.routeToRedsScreen).toBe(true)
      expect(f.messages.join(' ')).toMatch(/not something to (fix|solve)/i)
    }
  })

  it('keeps the n=1 label on a personal pattern in both voices', () => {
    for (const v of ['coach', 'self'] as const) {
      expect(personalPattern(cycles(4, 28), v).source).toMatch(/n=1/)
    }
  })

  it('never references a cycle phase in either voice', () => {
    const outputs = (['coach', 'self'] as const).flatMap(v => [
      symptomGuidance(day('d', { symptoms: { cramps: 3, mood: 3 } }), v),
      symptomGuidance(day('d', { symptoms: { fatigue: 1 } }), v),
      ...cycleFlags(heavy, undefined, v).messages,
      contraceptiveNote('combined-oral', v),
    ])
    for (const o of outputs) expect(o).not.toMatch(/follicular|luteal|ovulat|phase/i)
  })

  it('defaults to coach voice, so existing callers are unaffected', () => {
    expect(symptomGuidance(day('d', { symptoms: { fatigue: 1 } }))).toBe(
      symptomGuidance(day('d', { symptoms: { fatigue: 1 } }), 'coach'),
    )
  })
})

describe('summariseCycles', () => {
  it('detects a cycle start on the first bleeding day after a gap', () => {
    const s = summariseCycles(cycles(3, 28))
    expect(s.starts).toHaveLength(3)
    expect(s.lengths).toEqual([28, 28])
    expect(s.averageLength).toBe(28)
    expect(s.irregularCount).toBe(0)
  })

  it('counts cycles outside 21–35 days as irregular', () => {
    const s = summariseCycles(cycles(4, 45))
    expect(s.irregularCount).toBeGreaterThanOrEqual(DISRUPTION_THRESHOLD)
  })

  it('reports the current cycle day', () => {
    const s = summariseCycles(cycles(2, 28), '2026-02-05')
    expect(s.currentDay).toBeGreaterThan(0)
  })

  it('handles an empty log', () => {
    const s = summariseCycles([])
    expect(s.starts).toEqual([])
    expect(s.averageLength).toBeNull()
    expect(s.currentDay).toBeNull()
  })
})

describe('cycleFlags — routing, not diagnosing', () => {
  it('flags disruption and routes it to the REDs screen, not to programming', () => {
    const f = cycleFlags(cycles(4, 45))
    expect(f.disruption).toBe(true)
    expect(f.routeToRedsScreen).toBe(true)
    expect(f.messages.join(' ')).toMatch(/energy-availability screen/)
    expect(f.messages.join(' ')).toMatch(/not something to solve with programming/)
  })

  it('flags heavy bleeding as an iron-status prompt', () => {
    const entries = cycles(2, 28)
    entries[0] = { ...entries[0], flow: 'heavy' }
    const f = cycleFlags(entries)
    expect(f.heavyBleeding).toBe(true)
    expect(f.messages.join(' ')).toMatch(/iron/i)
  })

  it('stays quiet on regular cycles with no heavy flow', () => {
    const f = cycleFlags(cycles(3, 28))
    expect(f.disruption).toBe(false)
    expect(f.heavyBleeding).toBe(false)
    expect(f.messages).toEqual([])
  })

  it('treats a long absence as disruption even without recorded irregular cycles', () => {
    const f = cycleFlags(cycles(2, 28), summariseCycles(cycles(2, 28), '2026-06-01'))
    expect(f.disruption).toBe(true)
  })

  it('carries its citations', () => {
    expect(cycleFlags(cycles(4, 45)).source).toMatch(/Bruinvels|Mountjoy/)
  })
})

describe('personalPattern — n=1, never a population claim', () => {
  it('says nothing until there are enough cycles', () => {
    const p = personalPattern(cycles(MIN_CYCLES_FOR_PATTERN - 1, 28))
    expect(p.reliable).toBe(false)
    expect(p.observation).toBeNull()
  })

  it('surfaces a symptom that recurs before most periods', () => {
    const entries = cycles(4, 28)
    const starts = summariseCycles(entries).starts
    // Put moderate fatigue in the 2 days before each start.
    for (const st of starts) {
      for (const back of [1, 2]) {
        const d = new Date(st + 'T00:00:00'); d.setDate(d.getDate() - back)
        const key = d.toISOString().slice(0, 10)
        const idx = entries.findIndex(e => e.date === key)
        if (idx >= 0) entries[idx] = { ...entries[idx], symptoms: { fatigue: 3 } }
      }
    }
    const p = personalPattern(entries)
    expect(p.reliable).toBe(true)
    expect(p.observation).toMatch(/fatigue/)
    expect(p.observation).toMatch(/their own pattern, not a rule/)
  })

  it('stays silent when a symptom appeared only once', () => {
    const entries = cycles(4, 28)
    const first = summariseCycles(entries).starts[0]
    const d = new Date(first + 'T00:00:00'); d.setDate(d.getDate() - 1)
    const idx = entries.findIndex(e => e.date === d.toISOString().slice(0, 10))
    if (idx >= 0) entries[idx] = { ...entries[idx], symptoms: { headache: 3 } }
    expect(personalPattern(entries).observation).toBeNull()
  })

  it('labels its own source as n=1', () => {
    expect(personalPattern(cycles(4, 28)).source).toMatch(/n=1/)
  })
})

describe('contraceptiveNote', () => {
  it('is reassurance, not a programming lever', () => {
    const note = contraceptiveNote('combined-oral')!
    expect(note).toMatch(/negligible-to-small/)
    expect(note).toMatch(/No programming change/)
  })

  it('flags the copper IUD’s iron relevance', () => {
    expect(contraceptiveNote('iud-copper')).toMatch(/iron/)
  })

  it('says nothing when there is nothing to say', () => {
    expect(contraceptiveNote('none')).toBeNull()
  })
})

describe('CYCLE_FRAMING', () => {
  it('states the evidence honestly rather than overclaiming', () => {
    // This copy is the feature's whole defensibility. If a future session
    // replaces it with a phase-based claim, this fails.
    expect(CYCLE_FRAMING).toMatch(/does not currently support/)
    expect(CYCLE_FRAMING).toMatch(/symptoms vary/)
    expect(CYCLE_FRAMING).not.toMatch(/train heavier|optimal phase|best time to/i)
  })
})
