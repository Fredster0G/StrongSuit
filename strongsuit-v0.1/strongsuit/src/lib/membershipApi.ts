// ===== Membership networking (S15) =====
//
// Talks to the Coachwright-operated sync-server's `/membership` routes —
// always the OFFICIAL managed server (`MEMBERSHIP_SERVER_URL`), never
// whatever self-hosted `syncServerUrl` a coach configured for their own sync
// relay. Membership billing is inherently a Coachwright-run service (it
// holds the Stripe account and the licence-signing private key) — there's no
// such thing as a self-hosted membership tier the way there's a self-hosted
// sync relay, so this deliberately does NOT read `trainer.syncServerUrl`.
//
// Every function here degrades to "leave things as they were" on failure —
// offline, DNS failure, server down. Only a POSITIVE, VERIFIED response ever
// changes what the app believes about membership status (see
// `refreshMembership()`), matching `lib/membership.ts`'s header: the app
// keeps working fully on its last verified state until that token's own
// `expiresAt`, never an instant cutoff from a failed network call.

import { getIdentity } from '@/features/sync/syncApi'
import { trainerRepo } from '@/db/repo'
import { verifyMembershipToken, isMembershipCurrent } from './membership'

export const MEMBERSHIP_SERVER_URL = 'https://relay.coachwright.app'

export interface MembershipRefreshResult {
  active: boolean
  reason?: string
  expiresAt?: string
}

/** Calls `/membership/status`, verifies whatever token comes back (never
 *  trusts the network response's claims without checking the ECDSA
 *  signature — see `verifyMembershipToken`), and persists the result onto
 *  the trainer record. Safe to call often: offline or a down/unconfigured
 *  server just returns `null` and leaves the cached state untouched. */
export async function refreshMembership(): Promise<MembershipRefreshResult | null> {
  const identity = await getIdentity()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(
      `${MEMBERSHIP_SERVER_URL}/membership/status?coachId=${encodeURIComponent(identity.deviceId)}`,
      { signal: controller.signal },
    )
    clearTimeout(timer)
    if (!res.ok) return null

    const body = await res.json() as { active: boolean; reason?: string; token?: string; expiresAt?: string }

    if (!body.active || !body.token) {
      await trainerRepo.patch({ membershipActive: false, membershipToken: undefined, membershipExpiresAt: undefined })
      return { active: false, reason: body.reason }
    }

    const status = await verifyMembershipToken(body.token)
    if (!status.valid || !isMembershipCurrent(status.claims)) {
      // Server said active but the token itself doesn't check out (or is
      // somehow already expired on arrival) — treat as not-a-member rather
      // than trusting an unverifiable claim from the network.
      await trainerRepo.patch({ membershipActive: false, membershipToken: undefined, membershipExpiresAt: undefined })
      return { active: false, reason: 'Membership token failed verification' }
    }

    await trainerRepo.patch({
      membershipActive: true,
      membershipToken: body.token,
      membershipExpiresAt: status.claims.expiresAt,
    })
    return { active: true, expiresAt: status.claims.expiresAt }
  } catch {
    return null
  }
}

/** Opens a Stripe Checkout session and returns the URL to send the coach
 *  to — the app never collects card details itself. */
export async function startMembershipCheckout(name: string, email?: string): Promise<string> {
  const identity = await getIdentity()
  const res = await fetch(`${MEMBERSHIP_SERVER_URL}/membership/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coachId: identity.deviceId, name, email }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    throw new Error(body.error || `Checkout couldn't start (${res.status}).`)
  }
  const { url } = await res.json() as { url: string }
  return url
}

/** Opens Stripe's own hosted billing portal (card update, cancel) — this app
 *  never builds a customer portal, per docs/MANAGED_HOSTING.md's existing
 *  doctrine, applied here to the automated membership tier too. */
export async function openMembershipBillingPortal(): Promise<string> {
  const identity = await getIdentity()
  const res = await fetch(`${MEMBERSHIP_SERVER_URL}/membership/portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coachId: identity.deviceId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    throw new Error(body.error || `Couldn't open billing portal (${res.status}).`)
  }
  const { url } = await res.json() as { url: string }
  return url
}
