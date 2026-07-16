import type { Exercise, ExerciseCategory, TrackingType } from '../types'
import { db } from '../schema'
import { stamp } from '@/lib/core'

// PHASE 3 EXPANSION POINT ————————————————————————————————
// This is the first 48 of the 350+ seed library (spec §4.3). Continue the same
// shape: real coaching cues (2–3, imperative voice), honest aliases, no video
// URLs (trainers add their own). Keep names canonical, aliases lowercase.
// ————————————————————————————————————————————————————————

import { p1 } from './exercises_p1'
import { p2 } from './exercises_p2'
import { p3 } from './exercises_p3'

type SeedRow = [name: string, aliases: string, cat: ExerciseCategory, muscles: string, equip: string, track: TrackingType, cues: string[]]

const S: SeedRow[] = [
  // ---- squat ----
  ['Back Squat', 'squat,bb squat', 'squat', 'quads,glutes', 'barbell,rack', 'weight_reps', ['Brace before you descend', 'Knees track over toes', 'Drive the floor apart']],
  ['Front Squat', 'fs', 'squat', 'quads,upper back', 'barbell,rack', 'weight_reps', ['Elbows high through the whole rep', 'Stay tall out of the hole']],
  ['Goblet Squat', 'goblet', 'squat', 'quads,glutes', 'dumbbell,kettlebell', 'weight_reps', ['Elbows inside the knees at depth', 'Chest proud, heels down']],
  ['Box Squat', 'box', 'squat', 'glutes,quads', 'barbell,box', 'weight_reps', ['Sit back, not down', 'Pause without relaxing']],
  ['Bulgarian Split Squat', 'bss,rear foot elevated split squat,rfess', 'lunge', 'quads,glutes', 'dumbbell,bench', 'weight_reps', ['Front shin near vertical', 'Drop the back knee straight down']],
  ['Leg Press', 'press', 'squat', 'quads,glutes', 'machine', 'weight_reps', ['Lower under control to 90°', "Don't let the hips roll off the pad"]],
  // ---- hinge ----
  ['Conventional Deadlift', 'deadlift,dl', 'hinge', 'hamstrings,glutes,back', 'barbell', 'weight_reps', ['Slack out of the bar first', 'Push the floor away', 'Bar stays on the legs']],
  ['Romanian Deadlift', 'rdl', 'hinge', 'hamstrings,glutes', 'barbell,dumbbell', 'weight_reps', ['Hips back until the hamstrings load', 'Soft knees, flat back']],
  ['Trap Bar Deadlift', 'trap bar,hex bar', 'hinge', 'quads,glutes,back', 'trap bar', 'weight_reps', ['Chest up through the handles', 'Stand up in one piece']],
  ['Hip Thrust', 'thrust,barbell hip thrust', 'hinge', 'glutes', 'barbell,bench', 'weight_reps', ['Chin tucked, ribs down', 'Full lockout squeeze at the top']],
  ['Kettlebell Swing', 'kb swing,swing', 'hinge', 'glutes,hamstrings', 'kettlebell', 'reps', ['Snap the hips — arms are ropes', 'Bell floats, back stays flat']],
  ['Good Morning', 'gm', 'hinge', 'hamstrings,spinal erectors', 'barbell', 'weight_reps', ['Brace hard before the hinge', 'Only as deep as the back stays flat']],
  ['Glute Bridge', 'bridge', 'hinge', 'glutes', 'bodyweight,barbell', 'weight_reps', ['Drive through the heels', 'Pause and squeeze at the top']],
  // ---- push ----
  ['Bench Press', 'bench,bb bench', 'push', 'chest,triceps,shoulders', 'barbell,bench', 'weight_reps', ['Feet planted, upper back tight', 'Touch and press to the same spot']],
  ['Incline Dumbbell Press', 'incline db press', 'push', 'upper chest,shoulders', 'dumbbell,bench', 'weight_reps', ['Elbows about 45° from the torso', 'Press up and slightly back']],
  ['Overhead Press', 'ohp,military press,shoulder press', 'push', 'shoulders,triceps', 'barbell', 'weight_reps', ['Squeeze glutes, ribs down', 'Head through at lockout']],
  ['Dumbbell Shoulder Press', 'db ohp,seated db press', 'push', 'shoulders,triceps', 'dumbbell', 'weight_reps', ['Lower to ear height under control', 'No back arch to finish reps']],
  ['Push-Up', 'pushup,press up', 'push', 'chest,triceps,core', 'bodyweight', 'reps', ['One straight line, head to heels', 'Elbows ~45°, full range']],
  ['Dip', 'dips,parallel bar dip', 'push', 'chest,triceps', 'dip bars', 'weight_reps', ['Slight forward lean', 'Depth: shoulders to elbow level']],
  ['Lateral Raise', 'side raise,lat raise', 'push', 'side delts', 'dumbbell,cable', 'weight_reps', ['Lead with the elbows', 'Stop at shoulder height, no swing']],
  ['Cable Chest Fly', 'fly,cable fly', 'push', 'chest', 'cable', 'weight_reps', ['Slight elbow bend held constant', 'Hug a barrel, squeeze the finish']],
  ['Close-Grip Bench Press', 'cgbp', 'push', 'triceps,chest', 'barbell,bench', 'weight_reps', ['Hands just inside shoulder width', 'Elbows tucked to the sides']],
  // ---- pull ----
  ['Pull-Up', 'pullup,chin over bar', 'pull', 'lats,biceps', 'pull-up bar', 'weight_reps', ['Start from a dead hang', 'Pull the elbows to the ribs']],
  ['Chin-Up', 'chinup', 'pull', 'lats,biceps', 'pull-up bar', 'weight_reps', ['Underhand grip, chest to bar intent', 'Control the lowering']],
  ['Lat Pulldown', 'pulldown', 'pull', 'lats,biceps', 'cable', 'weight_reps', ['Chest tall, pull to the collarbone', "Don't lean back to cheat"]],
  ['Barbell Row', 'bent over row,bb row', 'pull', 'lats,mid-back', 'barbell', 'weight_reps', ['Hinge and hold the torso angle', 'Pull to the lower ribs']],
  ['Dumbbell Row', 'db row,one arm row', 'pull', 'lats,mid-back', 'dumbbell,bench', 'weight_reps', ['Long spine, square hips', 'Row the elbow past the ribs']],
  ['Seated Cable Row', 'cable row', 'pull', 'mid-back,lats', 'cable', 'weight_reps', ['Sit tall, shoulders down', 'Squeeze the blades together']],
  ['Face Pull', 'facepull', 'pull', 'rear delts,upper back', 'cable,band', 'weight_reps', ['Pull to the eyebrows', 'Thumbs point behind you at the finish']],
  ['Barbell Curl', 'curl,bb curl', 'pull', 'biceps', 'barbell', 'weight_reps', ['Elbows pinned to the sides', 'Full stretch at the bottom']],
  ['Hammer Curl', 'hammer', 'pull', 'biceps,forearms', 'dumbbell', 'weight_reps', ['Neutral grip the whole rep', 'No shoulder swing']],
  // ---- lunge / carry ----
  ['Walking Lunge', 'lunges', 'lunge', 'quads,glutes', 'dumbbell,bodyweight', 'weight_reps', ['Long step, torso tall', 'Back knee kisses the floor']],
  ['Reverse Lunge', 'rev lunge', 'lunge', 'quads,glutes', 'dumbbell,barbell', 'weight_reps', ['Step back, load the front leg', 'Push through the front heel']],
  ['Step-Up', 'stepup,box step up', 'lunge', 'quads,glutes', 'dumbbell,box', 'weight_reps', ['Whole foot on the box', 'Drive up without pushing off the floor leg']],
  ["Farmer's Carry", 'farmer walk,carries', 'carry', 'grip,core,traps', 'dumbbell,kettlebell', 'distance', ['Tall posture, ribs stacked', 'Short quick steps']],
  ['Suitcase Carry', 'suitcase', 'carry', 'obliques,grip', 'dumbbell,kettlebell', 'distance', ['One side loaded — stay level', "Don't lean away from the weight"]],
  // ---- core ----
  ['Plank', 'front plank', 'core', 'core', 'bodyweight', 'time', ['Squeeze glutes, tuck ribs', 'Push the floor away']],
  ['Side Plank', 'side bridge', 'core', 'obliques', 'bodyweight', 'time', ['Stack shoulders over elbow', 'Hips high the whole hold']],
  ['Dead Bug', 'deadbug', 'core', 'core', 'bodyweight', 'reps', ['Low back stays glued down', 'Slow opposite arm and leg']],
  ['Hanging Knee Raise', 'knee raise', 'core', 'abs,hip flexors', 'pull-up bar', 'reps', ['No swing between reps', 'Curl the pelvis, not just the knees']],
  ['Pallof Press', 'pallof', 'core', 'obliques,core', 'cable,band', 'weight_reps', ['Resist the rotation', 'Press out slow, hold, return']],
  ...p1,
  ...p2,
  ...p3,
  ['Ab Wheel Rollout', 'ab wheel,rollout', 'core', 'abs', 'ab wheel', 'reps', ['Ribs down before you roll', 'Only as far as the back stays flat']],
  // ---- conditioning ----
  ['Rowing Erg', 'row erg,rower,c2', 'conditioning', 'full body', 'rower', 'distance', ['Legs, then body, then arms', 'Long strokes beat fast strokes']],
  ['Assault Bike', 'air bike,echo bike', 'conditioning', 'full body', 'bike', 'time', ['Push and pull the handles', 'Settle into a sustainable cadence']],
  ['Sled Push', 'prowler', 'conditioning', 'legs,full body', 'sled', 'distance', ['Low arm angle, long strides', 'Drive, don’t stomp']],
  ['Burpee', 'burpees', 'conditioning', 'full body', 'bodyweight', 'reps', ['Chest to floor every rep', 'Jump and open the hips fully']],
  // ---- mobility ----
  ['World’s Greatest Stretch', 'wgs,spiderman lunge stretch', 'mobility', 'hips,t-spine', 'bodyweight', 'reps', ['Long lunge, elbow toward instep', 'Rotate and reach tall']],
  ['90/90 Hip Switch', '90 90,hip switch', 'mobility', 'hips', 'bodyweight', 'reps', ['Both hips stay grounded', 'Move slow through the switch']],
]

export function buildSeedExercises(): Exercise[] {
  return S.map(([name, aliases, category, muscles, equip, defaultTracking, cues]) =>
    stamp({
      name,
      aliases: aliases ? aliases.split(',') : [],
      category,
      primaryMuscles: muscles.split(','),
      equipment: equip.split(','),
      cues,
      isCustom: false,
      defaultTracking,
    } as Exercise),
  )
}

/** Idempotent: only seeds an empty library. */
export async function seedExercisesIfEmpty() {
  const count = await db.exercises.count()
  if (count > 0) return false
  await db.exercises.bulkAdd(buildSeedExercises())
  return true
}
