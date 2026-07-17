import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { encryptText, decryptText, isEncryptedBackup, parseEnvelope, importBackup, buildEnvelope } from './backup'
import { CoachwrightDB } from './schema'
import { makeRepo } from './repo/base'
import { stamp } from '@/lib/core'
import { e1rm } from '@/lib/core'
import type { Client } from './types'

describe('crypto', () => {
  it('round-trips AES-GCM with passphrase', async () => {
    const secret = JSON.stringify({ hello: 'world', n: 42 })
    const encd = await encryptText(secret, 'correct horse battery staple')
    expect(isEncryptedBackup(encd)).toBe(true)
    const out = await decryptText(encd, 'correct horse battery staple')
    expect(out).toBe(secret)
  })
  it('rejects wrong passphrase with friendly error', async () => {
    const encd = await encryptText('data', 'right')
    await expect(decryptText(encd, 'wrong')).rejects.toThrow(/check the passphrase/i)
  })
})

describe('envelope', () => {
  it('rejects non-backup files', () => {
    expect(() => parseEnvelope('{"app":"other"}')).toThrow(/isn't a Coachwright backup/)
    expect(() => parseEnvelope('not json')).toThrow()
  })
  it('rejects newer schema versions', () => {
    const env = JSON.stringify({ app: 'coachwright', schemaVersion: 999, data: {} })
    expect(() => parseEnvelope(env)).toThrow(/newer version/)
  })
  it('still accepts pre-rename (strongsuit) backups', () => {
    const env = JSON.stringify({ app: 'strongsuit', schemaVersion: 1, data: {} })
    expect(parseEnvelope(env).app).toBe('strongsuit')
  })
})

describe('merge logic (newest updatedAt wins)', () => {
  it('applies newer rows, skips older', async () => {
    const testDb = new CoachwrightDB('merge-test')
    const repo = makeRepo<Client>(testDb.clients)
    const base = stamp({
      firstName: 'Ada', lastName: 'L', status: 'active', goals: '', injuries: '',
      parqNotes: '', tags: [], startDate: '2026-01-01',
    } as unknown as Client)
    await testDb.clients.add(base)

    const older = { ...base, firstName: 'OLD', updatedAt: '2020-01-01T00:00:00.000Z' }
    const newer = { ...base, firstName: 'NEW', updatedAt: '2999-01-01T00:00:00.000Z' }

    let r = await repo.mergeUpsert([older])
    expect(r.skipped).toBe(1)
    expect((await testDb.clients.get(base.id))?.firstName).toBe('Ada')

    r = await repo.mergeUpsert([newer])
    expect(r.applied).toBe(1)
    expect((await testDb.clients.get(base.id))?.firstName).toBe('NEW')
    testDb.close()
  })
})

describe('backup round trip', () => {
  it('export → replace-import preserves rows', async () => {
    const env = await buildEnvelope()
    const report = await importBackup(JSON.stringify(env), 'replace')
    expect(report.mode).toBe('replace')
    expect(Object.keys(report.perTable).length).toBeGreaterThan(0)
  })
})

describe('e1rm (Epley)', () => {
  it('matches known values', () => {
    expect(e1rm(100, 1)).toBe(100)
    expect(e1rm(100, 10)).toBeCloseTo(133.3, 1)
    expect(e1rm(0, 5)).toBe(0)
  })
})
