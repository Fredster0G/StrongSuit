import { describe, it, expect } from 'vitest'
import {
  EQUIPMENT_PRESETS, presetById, suggestPreset, referenceFor, excludedJoints, occlusionHint,
} from './equipment'
import { RepCounter, FocusJointPicker, depthPct } from './pose'

describe('suggestPreset — guesses from the library’s own equipment tags', () => {
  it('recognises the machines that motivated this', () => {
    expect(suggestPreset(['machine', 'leg press'])).toBe('leg-press')
    expect(suggestPreset(['Hack Squat'])).toBe('leg-press')
    expect(suggestPreset(['cable', 'lat pulldown'])).toBe('lat-pulldown')
    expect(suggestPreset(['Smith machine'])).toBe('smith')
    expect(suggestPreset(['barbell'])).toBe('free-weight')
  })

  it('returns null rather than defaulting when nothing matches', () => {
    // Guessing "leg press" for an unknown tag would apply a 175° reference to
    // a movement that may not have one — inventing exactly the kind of number
    // this module exists to stop. An honest "don't know" falls back to the
    // observed range, which is at least measured.
    expect(suggestPreset(['sandbag', 'atlas stone'])).toBeNull()
    expect(suggestPreset([])).toBeNull()
    expect(suggestPreset(undefined)).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(suggestPreset(['LEG PRESS'])).toBe('leg-press')
  })
})

describe('referenceFor — the fix for debt #10', () => {
  it('uses true extension when the preset knows it', () => {
    const r = referenceFor(EQUIPMENT_PRESETS['leg-press'], 'Knee (L)', 140)
    expect(r.extended).toBe(175)
    expect(r.basis).toBe('preset')
  })

  it('falls back to the observed range and SAYS SO', () => {
    // The caller needs the basis, not just the number: depth measured against
    // whatever happened to appear in the footage is a weaker claim than depth
    // measured against true extension.
    const r = referenceFor(EQUIPMENT_PRESETS['free-weight'], 'Knee (L)', 168)
    expect(r.extended).toBe(168)
    expect(r.basis).toBe('observed')
  })

  it('falls back when there is no preset at all', () => {
    expect(referenceFor(null, 'Knee (L)', 150).basis).toBe('observed')
  })

  it('falls back for a joint the preset has no opinion about', () => {
    expect(referenceFor(EQUIPMENT_PRESETS['leg-press'], 'Shoulder (L)', 120).basis).toBe('observed')
  })
})

describe('depth against a real reference vs. the clip', () => {
  it('stops a leg press from SHORT-CHANGING the lifter', () => {
    // THE DEFECT, in one assertion. Nobody locks out on a leg press, so the
    // widest angle in the clip might be 140° when true extension is 175°.
    // Because the depth target (90°) is an absolute joint angle, a shrunken
    // reference shrinks the range the bottom is measured across, and the rep
    // reads LOWER than it really was — debt #10's own wording, "underreports
    // if the clip never shows full standing".
    const bottomAngle = 100
    const observedOnly = depthPct(bottomAngle, 140, 90)
    const withPreset = depthPct(bottomAngle, 175, 90)
    expect(observedOnly).toBe(80)
    expect(withPreset).toBe(88)
    expect(withPreset).toBeGreaterThan(observedOnly)
  })

  it('under-reports more the further the lifter is from locking out', () => {
    const bottom = 95
    const barelyExtends = depthPct(bottom, 120, 90)  // clip never gets near the top
    const trueRef = depthPct(bottom, 175, 90)
    expect(barelyExtends).toBeLessThan(trueRef)
  })
})

describe('RepCounter with an equipment reference', () => {
  /** Drive one full rep through the counter and return it. */
  function oneRep(counter: RepCounter) {
    let t = 0
    const push = (a: number) => { counter.push(t, a); t += 33 }
    for (let i = 0; i < 12; i++) push(140)     // warm-up at the machine's top
    for (const a of [130, 120, 110, 100]) push(a)
    push(95)
    for (const a of [110, 125, 138, 140]) push(a)
    return counter.reps.at(-1)
  }

  it('measures against the preset reference when given one', () => {
    const rep = oneRep(new RepCounter({ referenceExtended: 175, referenceTarget: 90 }))
    expect(rep).toBeDefined()
    expect(rep!.depthBasis).toBe('preset')
    // ±1: `depth` is computed from the unrounded bottom angle while
    // `rep.bottomAngle` is rounded for display.
    expect(rep!.depth).toBeCloseTo(depthPct(rep!.bottomAngle, 175, 90), -0.4)
  })

  it('falls back to the observed range and marks it as such', () => {
    const rep = oneRep(new RepCounter())
    expect(rep!.depthBasis).toBe('observed')
  })

  it('credits the lifter properly on the machine case', () => {
    // Same rep, same bottom position — only the reference differs. Without a
    // preset the machine's short range makes the rep look shallower than it
    // was; with one, the lifter gets the depth they actually achieved.
    const withRef = oneRep(new RepCounter({ referenceExtended: 175, referenceTarget: 90 }))!
    const without = oneRep(new RepCounter())!
    expect(withRef.bottomAngle).toBe(without.bottomAngle)
    expect(withRef.depth).toBeGreaterThan(without.depth)
  })
})

describe('FocusJointPicker with excluded joints', () => {
  it('never picks a joint the preset ruled out', () => {
    // The lat-pulldown case: the legs are seated and half under a pad, so a
    // knee that only twitches through a gap must not win "working joint".
    const picker = new FocusJointPicker(['Knee (L)', 'Knee (R)'])
    for (let i = 0; i < 30; i++) {
      picker.push({ 'Knee (L)': i * 4, 'Elbow (L)': 100 + (i % 10) * 3 })
    }
    expect(picker.best()).not.toBe('Knee (L)')
  })

  it('still picks normally when nothing is excluded', () => {
    const picker = new FocusJointPicker()
    for (let i = 0; i < 30; i++) picker.push({ 'Knee (L)': 90 + (i % 10) * 8 })
    expect(picker.best()).toBe('Knee (L)')
  })

  it('excludes the joints each preset names', () => {
    expect(excludedJoints(EQUIPMENT_PRESETS['lat-pulldown'])).toContain('Knee (L)')
    expect(excludedJoints(EQUIPMENT_PRESETS['free-weight'])).toEqual([])
    expect(excludedJoints(null)).toEqual([])
  })
})

describe('occlusionHint', () => {
  it('warns up front on equipment that blocks a joint', () => {
    // Better before filming than after — a coach can move the camera; they
    // can't re-shoot a set that already happened.
    const hint = occlusionHint(EQUIPMENT_PRESETS['leg-press'])!
    expect(hint).toMatch(/knee/)
    expect(hint).toMatch(/camera/)
  })

  it('says nothing when the equipment blocks nothing', () => {
    expect(occlusionHint(EQUIPMENT_PRESETS['free-weight'])).toBeNull()
    expect(occlusionHint(null)).toBeNull()
  })

  it('does not repeat left and right as two separate joints', () => {
    const hint = occlusionHint(EQUIPMENT_PRESETS['leg-press'])!
    expect(hint.match(/knee/g)).toHaveLength(1)
  })

  it('reads as grammatical English', () => {
    // Caught in the browser, not here: collapsing "Knee (L)"/"Knee (R)" to one
    // name produced "the knee ARE often blocked". Every joint in these lists
    // is bilateral, so the plural is always correct.
    for (const p of Object.values(EQUIPMENT_PRESETS)) {
      const hint = occlusionHint(p)
      if (!hint) continue
      expect(hint).toMatch(/the [a-z, ]+s (and [a-z]+s )?are often blocked/)
      // Reject a noun NOT ending in "s" before "are" — i.e. "the knee are".
      // `\w+` would have matched the correct plural too, which is why the
      // first version of this assertion failed on working copy.
      expect(hint).not.toMatch(/\bthe \w*[^s] are often/)
    }
  })
})

describe('presetById', () => {
  it('resolves every preset, and treats auto as "no preset"', () => {
    for (const id of Object.keys(EQUIPMENT_PRESETS) as (keyof typeof EQUIPMENT_PRESETS)[]) {
      expect(presetById(id)?.id).toBe(id)
    }
    expect(presetById('auto')).toBeNull()
  })

  it('gives every preset a label and a one-line summary for the picker', () => {
    for (const p of Object.values(EQUIPMENT_PRESETS)) {
      expect(p.label.length).toBeGreaterThan(3)
      expect(p.summary.length).toBeGreaterThan(20)
    }
  })
})
