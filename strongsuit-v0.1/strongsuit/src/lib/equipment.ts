// ===== Equipment context presets (docs/plans/04-FILM-ROOM-V2.md §2, Layer 4) =====
//
// One dropdown, two real payoffs.
//
// 1. IT FIXES DEBT #10, which is a wrong number rather than a missing one.
//    `RepCounter` uses the widest angle it happens to observe as the
//    "standing" reference for depth. On a barbell squat that's fine — the
//    lifter stands up between reps. On a **leg press nobody fully locks out**,
//    so the observed maximum might be 140° when true extension is ~175°.
//
//    The depth target (~90° knee) is an ABSOLUTE joint angle, so shrinking the
//    reference shrinks the range the bottom position is measured across and
//    the reading comes out LOW — the lifter is told they hit 80% of depth when
//    against true extension they reached 88%. Debt #10's own wording:
//    "underreports if the clip never shows full standing." A preset supplies
//    the real reference instead of inferring one from footage that never
//    contained it.
//
//    (I had this backwards on the first pass and wrote it up as *inflating*
//    the number. Three tests disagreed, and they were right. Noted here
//    because the direction is genuinely counter-intuitive and the next person
//    to read this will second-guess it too.)
//
// 2. IT TELLS THE OCCLUSION LAYER WHAT TO EXPECT. On a lat pulldown the legs
//    are static and half-hidden under a thigh pad; letting them compete for
//    "working joint" is how the picker ends up tracking a knee that never
//    moves. Excluding them is not a heuristic — it's knowing what machine the
//    person is on.
//
// Pure data + pure functions, so all of it is unit-testable and none of it
// imports MediaPipe.

import type { JointName } from './pose'

export type EquipmentPresetId =
  | 'auto'
  | 'free-weight'
  | 'leg-press'
  | 'lat-pulldown'
  | 'smith'
  | 'cable'
  | 'bench'

export interface JointReference {
  /** Joint angle at true full extension for this movement — the honest
   *  "top of the rep", independent of whether the clip ever shows it. */
  extended: number
  /** Angle at the depth target, i.e. 100% depth. */
  target: number
}

export interface EquipmentPreset {
  id: EquipmentPresetId
  label: string
  /** One line the coach reads in the picker. */
  summary: string
  /** Reference ROM per joint. Absent = fall back to observed range. */
  reference: Partial<Record<JointName, JointReference>>
  /** Joints that must not be chosen as the working joint — static or hidden
   *  by the machine on this movement. */
  excludeJoints: JointName[]
  /** Joints this machine commonly blocks. Used for the up-front hint, so the
   *  coach can reposition the camera BEFORE filming rather than discovering
   *  it in the analysis afterwards. */
  expectOccluded: JointName[]
}

const KNEES: JointName[] = ['Knee (L)', 'Knee (R)']
const HIPS: JointName[] = ['Hip (L)', 'Hip (R)']
const ELBOWS: JointName[] = ['Elbow (L)', 'Elbow (R)']

/**
 * Reference angles are deliberately CONSERVATIVE full-extension figures for
 * each movement pattern rather than textbook anatomical maxima: the point is
 * to stop depth being measured against a reference the clip never contained,
 * not to impose one coach's idea of correct range on everyone.
 */
export const EQUIPMENT_PRESETS: Record<Exclude<EquipmentPresetId, 'auto'>, EquipmentPreset> = {
  'free-weight': {
    id: 'free-weight',
    label: 'Free weight — barbell / dumbbell',
    summary: 'Standing lifts where the top of the rep is visible. Depth is measured against the range in the clip.',
    reference: {},          // observed range is genuinely correct here
    excludeJoints: [],
    expectOccluded: [],
  },
  'leg-press': {
    id: 'leg-press',
    label: 'Leg press / hack squat',
    summary: 'Knees are usually behind the pad, and lifters rarely lock out — so depth is measured against true extension, not the clip.',
    reference: {
      'Knee (L)': { extended: 175, target: 90 },
      'Knee (R)': { extended: 175, target: 90 },
    },
    excludeJoints: [...ELBOWS],
    expectOccluded: [...KNEES],
  },
  'lat-pulldown': {
    id: 'lat-pulldown',
    label: 'Lat pulldown / seated row',
    summary: 'Lower body is seated and static — only the arms and shoulders are tracked.',
    reference: {
      'Elbow (L)': { extended: 175, target: 60 },
      'Elbow (R)': { extended: 175, target: 60 },
    },
    excludeJoints: [...KNEES, ...HIPS],
    expectOccluded: [...KNEES],
  },
  smith: {
    id: 'smith',
    label: 'Smith machine',
    summary: 'Bar travels in a fixed line, so bar path is a straight-line reference rather than a finding.',
    reference: {
      'Knee (L)': { extended: 175, target: 90 },
      'Knee (R)': { extended: 175, target: 90 },
    },
    excludeJoints: [],
    expectOccluded: [],
  },
  cable: {
    id: 'cable',
    label: 'Cable / functional trainer',
    summary: 'The stack and frame often cut across the torso.',
    reference: {},
    excludeJoints: [],
    expectOccluded: [...ELBOWS],
  },
  bench: {
    id: 'bench',
    label: 'Bench press (flat / incline)',
    summary: 'The bench hides part of the torso; the hip reference is fixed rather than moving.',
    reference: {
      'Elbow (L)': { extended: 175, target: 75 },
      'Elbow (R)': { extended: 175, target: 75 },
    },
    excludeJoints: [...KNEES, ...HIPS],
    expectOccluded: [...HIPS],
  },
}

export function presetById(id: EquipmentPresetId): EquipmentPreset | null {
  return id === 'auto' ? null : EQUIPMENT_PRESETS[id]
}

/**
 * Guess the preset from an exercise's own equipment tags.
 *
 * Returns `null` rather than a default when nothing matches — guessing
 * "leg press" for an unrecognised tag would apply a 175° reference to a
 * movement that may not have one, which is precisely the invented-number
 * problem this module exists to remove. An honest "don't know" falls back to
 * the observed range, which is at least measured.
 */
export function suggestPreset(tags: readonly string[] | undefined): EquipmentPresetId | null {
  if (!tags?.length) return null
  const hay = tags.join(' ').toLowerCase()
  const match: [RegExp, EquipmentPresetId][] = [
    [/leg press|hack squat/, 'leg-press'],
    [/lat pulldown|pulldown|seated row|cable row/, 'lat-pulldown'],
    [/smith/, 'smith'],
    [/bench/, 'bench'],
    [/cable|functional trainer/, 'cable'],
    [/barbell|dumbbell|kettlebell|bodyweight/, 'free-weight'],
  ]
  for (const [re, id] of match) if (re.test(hay)) return id
  return null
}

/**
 * The depth reference for a joint, and — critically — whether it is a real
 * reference or a fallback.
 *
 * The caller needs the second half: a depth measured against the widest angle
 * that happened to appear in the footage is a weaker claim than one measured
 * against true extension, and the UI should not present them identically.
 */
export function referenceFor(
  preset: EquipmentPreset | null,
  joint: JointName | null,
  observedMax: number,
): { extended: number; target?: number; basis: 'preset' | 'observed' } {
  const ref = preset && joint ? preset.reference[joint] : undefined
  if (!ref) return { extended: observedMax, basis: 'observed' }
  return { extended: ref.extended, target: ref.target, basis: 'preset' }
}

/** Joints this preset says not to track. Empty for a preset that has no
 *  opinion, and for `auto`. */
export function excludedJoints(preset: EquipmentPreset | null): JointName[] {
  return preset?.excludeJoints ?? []
}

/** Up-front warning so a coach can move the camera BEFORE filming, rather
 *  than finding out from a set of withheld depth numbers afterwards. */
export function occlusionHint(preset: EquipmentPreset | null): string | null {
  if (!preset?.expectOccluded.length) return null
  // Collapse "Knee (L)" + "Knee (R)" to one name — but PLURALISE it, or the
  // sentence reads "the knee are often blocked". Every joint here is
  // bilateral, so the plural is always the right form.
  const names = [...new Set(
    preset.expectOccluded.map(j => `${j.replace(/ \([LR]\)$/, '').toLowerCase()}s`),
  )]
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `On this equipment the ${list} are often blocked. Coachwright will reconstruct them from limb lengths, ` +
    'but a side-on camera with a clear view gives better numbers.'
}
