import { describe, it, expect } from 'vitest'
import { remapClientId } from './syncApi'
import type { Device } from '@/db/types'

function device(overrides: Partial<Device> = {}): Device {
  return {
    id: 'device-1', createdAt: '', updatedAt: '',
    name: 'Test device', role: 'client', clientId: undefined,
    publicJwk: {}, verified: true, lastSeq: 0, outSeq: 1,
    ...overrides,
  }
}

describe('remapClientId', () => {
  it('rewrites clientId to the linked Client.id for a paired client device', () => {
    const rows = [{ id: 'log-1', createdAt: '', updatedAt: '', clientId: 'companion-device-abc' }]
    const out = remapClientId(rows, device({ clientId: 'real-client-42' }))
    expect(out[0].clientId).toBe('real-client-42')
  })

  it('leaves rows untouched when the device is not linked to a Client yet', () => {
    const rows = [{ id: 'log-1', createdAt: '', updatedAt: '', clientId: 'companion-device-abc' }]
    const out = remapClientId(rows, device({ clientId: undefined }))
    expect(out[0].clientId).toBe('companion-device-abc')
  })

  it('never remaps rows from a coach-role device (another coach device, not a client)', () => {
    const rows = [{ id: 'log-1', createdAt: '', updatedAt: '', clientId: 'already-correct' }]
    const out = remapClientId(rows, device({ role: 'coach', clientId: 'real-client-42' }))
    expect(out[0].clientId).toBe('already-correct')
  })

  it('leaves rows without a clientId field alone (e.g. exercises)', () => {
    const rows = [{ id: 'ex-1', createdAt: '', updatedAt: '', name: 'Squat' }]
    const out = remapClientId(rows, device({ clientId: 'real-client-42' }))
    expect(out[0]).toEqual(rows[0])
  })
})
