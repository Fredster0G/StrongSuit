import { describe, it, expect } from 'vitest'
import { formatBytes, isSuspiciouslyShort } from './modelFetch'

describe('formatBytes', () => {
  it('stays in bytes under 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })

  it('formats KB/MB/GB with one decimal under 10 units, none at or above', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(9 * 1024 * 1024)).toBe('9.0 MB')
    expect(formatBytes(29 * 1024 * 1024)).toBe('29 MB')
    expect(formatBytes(1.2 * 1024 * 1024 * 1024)).toBe('1.2 GB')
  })

  it('never exceeds the largest unit', () => {
    expect(formatBytes(5 * 1024 ** 5)).toMatch(/TB$/)
  })
})

describe('isSuspiciouslyShort', () => {
  it('is false for a download that landed close to the expected size', () => {
    expect(isSuspiciouslyShort(9 * 1024 * 1024, 9)).toBe(false)
    expect(isSuspiciouslyShort(8.5 * 1024 * 1024, 9)).toBe(false) // real variance
  })

  it('is true for a download that landed way short — the captive-portal case', () => {
    // A wifi login page or proxy error is typically a few KB, standing in
    // for what should have been megabytes.
    expect(isSuspiciouslyShort(2048, 9)).toBe(true)
  })

  it('is false for a download that landed slightly OVER the expected size', () => {
    expect(isSuspiciouslyShort(9.5 * 1024 * 1024, 9)).toBe(false)
  })
})
