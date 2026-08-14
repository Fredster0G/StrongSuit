import fs from 'fs'
import path from 'path'

const OUTPUT_FILE = path.join(__dirname, './exercises_p4.ts')

// Read existing exercise names via regex
const getExistingNames = () => {
  const names = new Set<string>()
  const files = ['exercises_p1.ts', 'exercises_p2.ts', 'exercises_p3.ts', 'exercises.ts']
  for (const file of files) {
    const p = path.join(__dirname, file)
    if (!fs.existsSync(p)) continue
    const content = fs.readFileSync(p, 'utf8')
    // Match lines starting with `['Name',` or `["Name",`
    const matches = content.matchAll(/^\s*\[['"]([^'"]+)['"]/gm)
    for (const match of matches) {
      names.add(normalize(match[1]))
    }
  }
  return names
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const existingSet = getExistingNames()

const equipMap: Record<string, string> = {
  'body only': 'bodyweight',
  'machine': 'machine',
  'kettlebells': 'kettlebell',
  'dumbbell': 'dumbbell',
  'cable': 'cable',
  'barbell': 'barbell',
  'bands': 'band',
  'medicine ball': 'medicine ball',
  'exercise ball': 'stability ball',
  'e-z curl bar': 'ez bar',
  'foam roll': 'foam roller',
}

const mapEquipment = (eq: string | null) => {
  if (!eq || eq === 'other') return 'bodyweight'
  const e = eq.toLowerCase()
  if (e.includes('trx') || e.includes('suspension')) return 'suspension trainer'
  return equipMap[e] || e
}

const mapCategory = (category: string, force: string | null, primary: string[]): string => {
  if (category === 'stretching') return 'mobility'
  if (category === 'cardio') return 'conditioning'
  if (category === 'plyometrics') return 'conditioning'
  if (primary.includes('abdominals')) return 'core'
  
  if (force === 'pull') {
    if (primary.includes('hamstrings') || primary.includes('lower back') || primary.includes('glutes')) return 'hinge'
    return 'pull'
  }
  
  if (force === 'push') {
    if (primary.includes('quadriceps')) return 'squat'
    if (primary.includes('calves')) return 'squat'
    return 'push'
  }
  
  if (primary.includes('quadriceps')) return 'squat'
  if (primary.includes('hamstrings')) return 'hinge'
  if (primary.includes('chest') || primary.includes('triceps') || primary.includes('shoulders')) return 'push'
  if (primary.includes('lats') || primary.includes('middle back') || primary.includes('biceps')) return 'pull'
  
  return 'conditioning'
}

const mapMuscles = (m: string) => {
  if (m === 'quadriceps') return 'quads'
  if (m === 'abdominals') return 'abs'
  if (m === 'middle back') return 'mid-back'
  return m
}

async function run() {
  console.log('Fetching database from URL...')
  const DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
  const res = await fetch(DB_URL)
  const rawData = await res.json()
  
  const newExercises: any[] = []
  
  for (const item of rawData) {
    const normName = normalize(item.name)
    if (existingSet.has(normName)) {
      continue
    }
    existingSet.add(normName)
    
    const cat = mapCategory(item.category, item.force, item.primaryMuscles)
    const muscles = item.primaryMuscles.map(mapMuscles).join(',')
    const secondary = item.secondaryMuscles.map(mapMuscles).join(',')
    const equip = mapEquipment(item.equipment)
    const track = 'weight_reps'
    const cues: string[] = []
    
    // row: [name, aliases, cat, muscles, equip, track, cues, needsAuthoring, level, force, mechanic, secondary]
    const row = [
      item.name,
      '',
      cat,
      muscles,
      equip,
      track,
      cues,
      true,
      item.level || '',
      item.force || '',
      item.mechanic || '',
      secondary
    ]
    
    newExercises.push(row)
  }
  
  console.log(`Deduped: keeping ${newExercises.length} new exercises.`)
  
  const outputLines = [
    `import type { ExerciseCategory, TrackingType } from '../types'`,
    ``,
    `export type SeedRowP4 = [`,
    `  name: string, aliases: string, cat: ExerciseCategory, muscles: string, equip: string,`,
    `  track: TrackingType, cues: string[], needsAuthoring: boolean,`,
    `  level: string, force: string, mechanic: string, secondary: string`,
    `]`,
    ``,
    `export const p4: SeedRowP4[] = [`
  ]
  
  for (const row of newExercises) {
    outputLines.push(`  ${JSON.stringify(row)},`)
  }
  
  outputLines.push(`]`)
  outputLines.push(``)
  
  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf8')
  console.log(`Wrote ${OUTPUT_FILE}`)
}

run().catch(console.error)
