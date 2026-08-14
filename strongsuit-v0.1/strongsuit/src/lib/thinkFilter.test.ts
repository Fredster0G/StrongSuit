import { describe, it, expect } from 'vitest'
import { createThinkFilter } from './thinkFilter'

function run(chunks: string[]): string {
  let out = ''
  const filter = createThinkFilter(text => { out += text })
  for (const c of chunks) filter.push(c)
  return out
}

describe('createThinkFilter', () => {
  it('passes text through unchanged when there is no think block at all', () => {
    expect(run(['Hello', ' there', '!'])).toBe('Hello there!')
  })

  it('strips a think block delivered as one whole chunk', () => {
    expect(run(['<think>reasoning here</think>The real answer.'])).toBe('The real answer.')
  })

  it('strips an empty think block — the exact shape Qwen3 sometimes emits', () => {
    expect(run(['<think>\n</think>\n\nA readiness score of 42 means...'])).toBe('A readiness score of 42 means...')
  })

  it('strips a think block split across many small chunks, including mid-tag', () => {
    // Simulates real token-by-token streaming, where a tag can straddle a
    // chunk boundary — this is the actual failure mode a naive
    // string.includes('<think>') check on each chunk in isolation would miss.
    const chunks = ['<th', 'ink', '>', 'reason', 'ing ', 'here', '</th', 'ink>', 'Real', ' answer.']
    expect(run(chunks)).toBe('Real answer.')
  })

  it('handles a chunk stream that starts with a partial "<think>" prefix but is not actually one', () => {
    // "<thinking about it" never completes the literal "<think>" tag — once
    // enough has arrived to prove that, it must all flush as real output.
    expect(run(['<thin', 'king about it, yes.'])).toBe('<thinking about it, yes.')
  })

  it('never emits anything from inside the think block, even split oddly', () => {
    let out = ''
    const filter = createThinkFilter(text => { out += text })
    filter.push('<think>')
    filter.push('secret reasoning')
    expect(out).toBe('') // nothing visible yet — still inside the block
    filter.push('</think>answer')
    expect(out).toBe('answer')
  })

  it('handles a single-character chunk stream without losing or duplicating text', () => {
    const text = '<think>x</think>Hi there.'
    expect(run(text.split(''))).toBe('Hi there.')
  })
})
