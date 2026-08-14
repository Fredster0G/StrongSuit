// ===== Semantic search over the exercise library =====
//
// The actual feature `lib/localAi.ts`'s bge-small-en-v1.5 registry entry
// promises: "rear delt work that doesn't aggravate a shoulder" finds the
// right movements, not just exercises whose name literally contains those
// words — `lib/fuzzy.ts`'s existing name/alias search stays the fast,
// always-on default for that case (typing "rdl" is still instant and needs
// no model). This is a second, opt-in mode layered on top, never a
// replacement — `createFuzzyIndex` is untouched.

import { embedText, cosineSimilarity } from './embeddings'
import { exerciseEmbeddingsRepo } from '@/db/repo'
import type { Exercise } from '@/db/types'

/** What actually gets embedded — name and aliases carry the most weight by
 *  appearing first (bge-small has no field-weighting of its own, but models
 *  like this do lean on token order/proximity somewhat), category and
 *  muscles anchor the movement pattern, cues add the "what this is like to
 *  do" texture a bare name misses. */
function exerciseSearchText(ex: Exercise): string {
  return [ex.name, ...ex.aliases, ex.category, ...ex.primaryMuscles, ...ex.cues].join(' ').toLowerCase()
}

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface IndexProgress {
  done: number
  total: number
}

/**
 * Builds or refreshes the embedding cache for a roster of exercises. Safe
 * (and cheap) to call every time the library loads — an exercise whose
 * cached row already matches its current text hash is skipped entirely, so
 * a re-run over an already-indexed 350-exercise library does real work only
 * for what actually changed (a custom exercise just edited, or one just
 * added) rather than re-embedding everything every time.
 */
export async function ensureExercisesIndexed(
  exercises: Exercise[],
  onProgress?: (p: IndexProgress) => void,
): Promise<void> {
  const cached = await exerciseEmbeddingsRepo.all()
  const cachedByExercise = new Map(cached.map(r => [r.exerciseId, r]))
  let done = 0
  for (const ex of exercises) {
    const text = exerciseSearchText(ex)
    const hash = await hashText(text)
    const existing = cachedByExercise.get(ex.id)
    if (!existing || existing.textHash !== hash) {
      const vector = await embedText(text)
      await exerciseEmbeddingsRepo.put({ exerciseId: ex.id, vector, textHash: hash, updatedAt: new Date().toISOString() })
    }
    done++
    onProgress?.({ done, total: exercises.length })
  }
}

export interface SemanticMatch {
  exercise: Exercise
  score: number
}

/**
 * Floor for "this counts as a match at all." Not empirically tuned across
 * the full library — set from the one real check run before this was wired
 * in (a genuinely related query scored 0.68, an unrelated one 0.56, against
 * short generic phrases — see `lib/embeddings.ts`'s header), which is why
 * this sits meaningfully below the "related" score rather than between the
 * two: those two numbers were one data point, not a calibration sweep, and
 * erring toward returning a plausible-but-imperfect match beats erring
 * toward silently returning nothing on a real query.
 */
const MIN_SIMILARITY = 0.45

/** Ranks `exercises` by meaning-similarity to `query`. Exercises with no
 *  cached embedding yet are silently skipped — call `ensureExercisesIndexed`
 *  first (LibraryPage does, before offering this mode at all) rather than
 *  have this function embed on demand mid-search, which would make one
 *  query's latency depend on how much of the library happens to be stale. */
export async function semanticSearch(query: string, exercises: Exercise[]): Promise<SemanticMatch[]> {
  const q = query.trim()
  if (!q) return []
  const queryVector = await embedText(q)
  const cached = await exerciseEmbeddingsRepo.all()
  const vectorById = new Map(cached.map(r => [r.exerciseId, r.vector]))

  const results: SemanticMatch[] = []
  for (const ex of exercises) {
    const vector = vectorById.get(ex.id)
    if (!vector) continue
    const score = cosineSimilarity(queryVector, vector)
    if (score >= MIN_SIMILARITY) results.push({ exercise: ex, score })
  }
  return results.sort((a, b) => b.score - a.score)
}
