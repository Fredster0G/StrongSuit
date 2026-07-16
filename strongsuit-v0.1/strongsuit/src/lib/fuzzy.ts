/**
 * A fast, dependency-free fuzzy search index for arrays of objects.
 * Built for <50ms query times over small-to-medium lists (e.g. 500 exercises).
 */

export interface FuzzyResult<T> {
  item: T
  score: number
}

// Higher score = better match
const SCORE_EXACT = 100
const SCORE_PREFIX = 80
const SCORE_WORD_PREFIX = 60
const SCORE_SUBSTRING = 40
const SCORE_SUBSEQUENCE = 10

/**
 * Creates a reusable search index over a static array.
 */
export function createFuzzyIndex<T>(items: T[], getKeys: (item: T) => string[]) {
  // Pre-process all items: lowercased, flattened keys
  const index = items.map((item) => {
    const rawKeys = getKeys(item)
    return {
      item,
      searchTerms: rawKeys.map((k) => k.toLowerCase().trim()).filter(Boolean),
    }
  })

  return function search(query: string): FuzzyResult<T>[] {
    const q = query.toLowerCase().trim()
    if (!q) {
      // Empty query -> return everything with 0 score (or could return top N, but we'll return all un-scored)
      return items.map((item) => ({ item, score: 0 }))
    }

    const results: FuzzyResult<T>[] = []

    for (const entry of index) {
      let maxScore = -1

      for (const term of entry.searchTerms) {
        if (term === q) {
          maxScore = Math.max(maxScore, SCORE_EXACT)
          continue
        }

        if (term.startsWith(q)) {
          maxScore = Math.max(maxScore, SCORE_PREFIX)
          continue
        }

        // Check if query is a prefix of any word in the term
        // e.g. q="dead", term="romanian deadlift"
        if (term.includes(` ${q}`)) {
          maxScore = Math.max(maxScore, SCORE_WORD_PREFIX)
          continue
        }

        if (term.includes(q)) {
          maxScore = Math.max(maxScore, SCORE_SUBSTRING)
          continue
        }

        // Subsequence match
        let qIdx = 0
        let termIdx = 0
        while (qIdx < q.length && termIdx < term.length) {
          if (q[qIdx] === term[termIdx]) {
            qIdx++
          }
          termIdx++
        }

        if (qIdx === q.length) {
          // Matched all characters in sequence!
          // Score slightly better if it's more compact (term length ratio)
          const compactness = q.length / term.length
          maxScore = Math.max(maxScore, SCORE_SUBSEQUENCE + compactness * 10)
        }
      }

      if (maxScore >= 0) {
        results.push({ item: entry.item, score: maxScore })
      }
    }

    // Sort descending by score
    return results.sort((a, b) => b.score - a.score)
  }
}
