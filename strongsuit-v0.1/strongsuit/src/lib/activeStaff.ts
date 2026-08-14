// ===== "Working as" — which staff member is at this keyboard (Studio) =====
// This app has no login/auth by design (see HOW-TO-OWN-IT.md). On a shared
// studio device, something still has to decide which coach a freshly logged
// session/payment/program/invoice gets stamped with. That's a property of
// THIS DEVICE right now, not of the trainer record — it must never sync or
// back up, so it lives in localStorage (matching lib/i18n's existing
// device-local-setting pattern) rather than a Dexie table.

import type { Staff } from '@/db/types'

const ACTIVE_STAFF_KEY = 'coachwright.activeStaffId'

/** Raw stored id, or null if unset/unavailable (e.g. private browsing). */
function storedId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_STAFF_KEY)
  } catch {
    return null
  }
}

/** The active staff id, validated against the live roster — a removed staff
 *  member or a leftover value from a downgraded edition must not silently
 *  keep stamping a dead id onto new rows. */
export function getActiveStaffId(staff: Staff[]): string | null {
  const id = storedId()
  if (!id) return null
  return staff.some(s => s.id === id) ? id : null
}

export function setActiveStaffId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_STAFF_KEY, id)
    else localStorage.removeItem(ACTIVE_STAFF_KEY)
  } catch {
    /* private mode — not fatal, just means the switcher doesn't stick */
  }
}
