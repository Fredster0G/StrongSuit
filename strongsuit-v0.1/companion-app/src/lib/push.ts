// ===== Web Push — notifications while the app is CLOSED =====
// This is the honest answer to "background notifications without battery
// drain": the OS keeps exactly one shared push socket for every app on the
// device; we ride it instead of polling. Requires the coach to have a relay
// (something must originate the push), and requires the platform to support
// Web Push for installed PWAs — Android/desktop broadly yes; iOS only when
// added to the Home Screen on iOS 16.4+. See CLIENT_APP_STRATEGY.md §9.
//
// Privacy: the push payload is metadata only ("new message"), never content.
// Content stays E2EE and is fetched by the app itself on open — the push
// service (FCM/APNs/Mozilla) never sees anything worth reading.

import { profileRepo } from '@/db/repo'
import type { CoachLink } from '@/db/types'

function relayCfg(link: CoachLink) {
  if (!link.relayUrl) return null
  return { url: link.relayUrl.replace(/\/+$/, ''), apiKey: link.relayApiKey || 'default-coachwright-key' }
}

function b64ToUint8(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
}

/** Ask permission, subscribe with the relay's VAPID key, and register the
 *  subscription server-side. Returns a human-readable status string. */
export async function enablePush(link: CoachLink): Promise<string> {
  const cfg = relayCfg(link)
  if (!cfg) return "Closed-app notifications need your coach's server — in-app alerts still work."
  if (!pushSupported()) return "This browser can't receive push — install the app to your home screen and try again."

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'Notifications stay off until you allow them.'

  const vapidRes = await fetch(`${cfg.url}/push/vapid`, { headers: { 'x-api-key': cfg.apiKey } })
  if (!vapidRes.ok) return "Your coach's server doesn't support push yet — in-app alerts still work."
  const { publicKey } = (await vapidRes.json()) as { publicKey: string }

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToUint8(publicKey) as BufferSource,
  })
  const identity = await profileRepo.getOrCreateIdentity()
  const res = await fetch(`${cfg.url}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify({ clientId: identity.deviceId, coachId: link.coachDeviceId, subscription: sub.toJSON() }),
  })
  if (!res.ok) return "Couldn't register with the server — try again later."
  await profileRepo.patch({ notifyEnabled: true })
  return 'On — you\'ll hear about new coach messages even with the app closed.'
}

export async function disablePush(link: CoachLink | undefined): Promise<void> {
  await profileRepo.patch({ notifyEnabled: false })
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    const cfg = link ? relayCfg(link) : null
    if (cfg) {
      await fetch(`${cfg.url}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {})
    }
    await sub.unsubscribe().catch(() => {})
  }
}
