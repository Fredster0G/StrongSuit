import { describe, it, expect, beforeEach } from 'vitest'
import { getActiveStaffId, setActiveStaffId } from './activeStaff'
import type { Staff } from '@/db/types'

function staff(id: string): Staff {
  return { id, createdAt: '', updatedAt: '', name: id, role: 'coach', active: true }
}

// This project's vitest runs in a plain `node` environment (no jsdom). Node's
// own global `localStorage` exists as an object but isn't actually backed by
// a working store without an explicit flag, so setItem silently no-ops —
// confirmed directly (`localStorage.setItem is not a function`). A minimal
// in-memory mock, fresh per test, makes these tests real rather than
// vacuously passing on an always-null read.
beforeEach(() => {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  } as Storage
})

describe('activeStaff', () => {
  it('returns null when nothing has been set', () => {
    expect(getActiveStaffId([staff('s1')])).toBeNull()
  })

  it('round-trips a valid id', () => {
    setActiveStaffId('s1')
    expect(getActiveStaffId([staff('s1'), staff('s2')])).toBe('s1')
  })

  it('returns null for an id that no longer exists in the roster', () => {
    setActiveStaffId('s1')
    expect(getActiveStaffId([staff('s2')])).toBeNull()
  })

  it('clears with null', () => {
    setActiveStaffId('s1')
    setActiveStaffId(null)
    expect(getActiveStaffId([staff('s1')])).toBeNull()
  })
})
