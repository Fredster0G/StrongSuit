import { describe, it, expect } from 'vitest'
// Vite's `?raw` — we're asserting on the SOURCE of the sync layer, not on its
// behaviour, because the property we care about is structural: cycle data must
// not be reachable from the code that builds an outbound packet.
import syncSource from './companionSyncApi.ts?raw'
import typesSource from '@/db/types.ts?raw'
import { ALL_TABLES } from '@/db/types'

/**
 * Cycle & symptom data is special-category health data (GDPR Art. 9). The
 * design guarantee is that it never leaves the device over sync — not "we
 * filter it out", but "the code that builds a packet cannot see it".
 *
 * A unit test on the payload's current contents would pass just as happily
 * after someone added a cycle table to it. These tests fail instead, and the
 * failure message says why. If you're here because one broke: the fix is
 * almost certainly to not send the data, not to update the test.
 */
describe('cycle data never reaches the sync layer', () => {
  it('the sync module does not import or reference the cycle store at all', () => {
    // Not a filter that can be removed — the sync module has no route to this
    // data in the first place.
    expect(syncSource).not.toMatch(/cycleRepo|cycleDays|CycleDay/)
  })

  it('the outbound payload type lists exactly three tables', () => {
    // Pinned deliberately. Widening this shape is the one edit that could
    // start leaking; making it fail loudly is the point.
    const shape = syncSource.match(/interface OutboundPayload \{[\s\S]*?\n\}/)?.[0]
    expect(shape, 'OutboundPayload interface not found — did it get renamed?').toBeTruthy()
    expect(shape!.match(/\w+:/g)?.filter(k => k !== 'tables:')).toHaveLength(3)
    expect(shape).toMatch(/sessionLogs/)
    expect(shape).toMatch(/metrics/)
    expect(shape).toMatch(/messages/)
    expect(shape).not.toMatch(/cycle/i)
  })

  it('keeps the warning comment that explains why, next to the type', () => {
    // The comment is what stops the next person from "helpfully" adding it.
    // Losing the comment is how the guarantee gets deleted six months later.
    expect(typesSource).toMatch(/LOCAL-ONLY/)
    expect(typesSource).toMatch(/GDPR Art\. 9/)
  })

  it('does keep cycle rows in the local backup, so restore is not lossy', () => {
    // The counterpart guarantee, and a deliberately different answer: a local
    // backup file the user creates on purpose SHOULD round-trip their data.
    // Restore clears each listed table, so omitting this would also strand the
    // previous profile's cycle rows on a restored device.
    expect(ALL_TABLES).toContain('cycleDays')
  })
})
