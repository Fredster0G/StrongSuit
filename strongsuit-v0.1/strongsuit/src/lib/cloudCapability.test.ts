import { describe, it, expect } from 'vitest'
import { cloudCapabilities } from './cloudCapability'

describe('cloudCapabilities', () => {
  it('defaults to local-only with everything cloud-dependent unavailable', () => {
    const c = cloudCapabilities(undefined)
    expect(c.tier).toBe('local')
    expect(c.configured).toBe(false)
    expect(c.sync).toBe(false)
    expect(c.messaging).toBe(false)
    expect(c.reminders).toBe(false)
    expect(c.reasonUnavailable).toMatch(/fully local/i)
  })

  it('explicit local tier behaves the same as no trainer at all', () => {
    const c = cloudCapabilities({ cloudTier: 'local', syncServerUrl: undefined })
    expect(c.messaging).toBe(false)
  })

  it('self-hosted or managed tier selected but no URL saved yet — still unavailable, different reason', () => {
    const selfHosted = cloudCapabilities({ cloudTier: 'self-hosted', syncServerUrl: undefined })
    expect(selfHosted.configured).toBe(false)
    expect(selfHosted.messaging).toBe(false)
    expect(selfHosted.reasonUnavailable).toMatch(/no server url/i)

    const managed = cloudCapabilities({ cloudTier: 'managed', syncServerUrl: undefined })
    expect(managed.reasonUnavailable).toMatch(/managed/i)
  })

  it('a configured self-hosted or managed relay unlocks everything', () => {
    const selfHosted = cloudCapabilities({ cloudTier: 'self-hosted', syncServerUrl: 'http://192.168.1.5:4000' })
    expect(selfHosted.configured).toBe(true)
    expect(selfHosted.sync).toBe(true)
    expect(selfHosted.messaging).toBe(true)
    expect(selfHosted.reminders).toBe(true)
    expect(selfHosted.reasonUnavailable).toBeUndefined()

    const managed = cloudCapabilities({ cloudTier: 'managed', syncServerUrl: 'https://relay.coachwright.app' })
    expect(managed.messaging).toBe(true)
  })

  it('a syncServerUrl left over from before switching back to local does not re-enable anything', () => {
    // e.g. a coach tried self-hosted, saved a URL, then switched the tier
    // selector back to "fully local" without clearing the URL field.
    const c = cloudCapabilities({ cloudTier: 'local', syncServerUrl: 'http://192.168.1.5:4000' })
    expect(c.messaging).toBe(false)
    expect(c.reasonUnavailable).toMatch(/fully local/i)
  })
})
