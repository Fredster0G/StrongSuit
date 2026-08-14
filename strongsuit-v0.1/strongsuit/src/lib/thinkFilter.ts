// ===== Strip a leading <think>...</think> block from streamed model output =====
//
// Qwen3 (the assistant model, `lib/assistant.ts`) can preface its answer
// with a `<think>...</think>` reasoning block — real model behavior, not a
// bug, sometimes empty, sometimes substantial — but it's internal reasoning,
// not the answer, and a coach reading a quick response between sets doesn't
// want to see it. `skip_special_tokens` on the streamer doesn't remove it,
// since `<think>`/`</think>` are literal vocabulary tokens for this model,
// not tokenizer-level special tokens.
//
// A small state machine because the tags can land split across streamed
// chunks (a chunk boundary can fall mid-tag) — this has to work token-by-
// token, not by string-searching one already-complete response.

type Phase = 'detecting' | 'thinking' | 'visible'

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'

export interface ThinkFilter {
  /** Feed the next streamed chunk. Calls `onVisible` zero or more times with
   *  whatever of this chunk (or a previously-buffered ambiguous prefix)
   *  turned out to be real, visible output — never with anything from
   *  inside a `<think>` block. */
  push(chunk: string): void
}

/** `onVisible` receives only the text meant to be shown/returned to the
 *  caller — content between `<think>` and `</think>` (inclusive of the tags
 *  themselves) is discarded entirely, not surfaced in any form. */
export function createThinkFilter(onVisible: (text: string) => void): ThinkFilter {
  let phase: Phase = 'detecting'
  let buffer = ''

  return {
    push(chunk: string) {
      if (phase === 'visible') {
        onVisible(chunk)
        return
      }

      buffer += chunk

      if (phase === 'detecting') {
        if (buffer.startsWith(THINK_OPEN)) {
          phase = 'thinking'
          buffer = buffer.slice(THINK_OPEN.length)
        } else if (buffer.length >= THINK_OPEN.length || !THINK_OPEN.startsWith(buffer)) {
          // Either long enough to be sure, or already diverged from the
          // "<think>" prefix — everything buffered so far is real output.
          phase = 'visible'
          const flushed = buffer
          buffer = ''
          if (flushed) onVisible(flushed)
          return
        } else {
          return // still an ambiguous, shorter-than-"<think>" prefix — wait for more
        }
      }

      if (phase === 'thinking') {
        const closeIdx = buffer.indexOf(THINK_CLOSE)
        if (closeIdx === -1) return // still inside the block — discard silently, wait for more
        const after = buffer.slice(closeIdx + THINK_CLOSE.length).replace(/^\s+/, '')
        phase = 'visible'
        buffer = ''
        if (after) onVisible(after)
      }
    },
  }
}
