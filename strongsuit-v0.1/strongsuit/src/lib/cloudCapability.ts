// ===== Cloud capability logic (spec: 3-tier hosting, docs/SERVER_STRATEGY.md §2.5) =====
// Single source of truth for "what does this coach's hosting choice unlock."
// Every feature that touches sync-server (live messaging, reminders, cloud
// device sync) should ask this module rather than checking `syncServerUrl`
// inline — that way the UI's explanation of *why* something is hidden stays
// consistent everywhere it appears, instead of silently disappearing.

import type { Trainer } from '@/db/types'

export type CloudTier = 'local' | 'self-hosted' | 'managed'

export interface CloudCapabilities {
  tier: CloudTier
  /** A relay URL is set — self-hosted or managed, either counts. */
  configured: boolean
  /** Cloud-relay device sync (push/pull over the internet, not just local
   *  WiFi/file export) — everything below requires this too. */
  sync: boolean
  /** Live coach↔client messaging over the relay (MessagesTab's Live panel). */
  messaging: boolean
  /** Poll-based reminders (server endpoints exist; coach-side scheduling UI
   *  does not yet — see docs/SERVER_STRATEGY.md §6). */
  reminders: boolean
  /** Allow querying Open Food Facts for barcodes. Network call! */
  barcodeLookup: boolean
  /** Plain-language reason to show the coach when a feature is hidden or
   *  disabled because of their current hosting choice. Undefined when
   *  everything is available. */
  reasonUnavailable?: string
}

/** What a coach's current hosting tier unlocks. Local-only (the default,
 *  and the zero-backend baseline every tier still includes — file/WiFi sync,
 *  local message logging, everything else in the app) never depends on this;
 *  only the relay-specific features above do. */
export function cloudCapabilities(trainer: Pick<Trainer, 'cloudTier' | 'syncServerUrl'> | undefined | null): CloudCapabilities {
  const tier: CloudTier = trainer?.cloudTier ?? 'local'
  const configured = !!trainer?.syncServerUrl

  if (tier === 'local') {
    return {
      tier, configured: false, sync: false, messaging: false, reminders: false,
      barcodeLookup: false, // Strict zero-network mode
      reasonUnavailable: "This coach account is set to fully local — nothing leaves this device, by design. Turn on self-hosted or managed sync in Settings → Cloud to unlock this.",
    }
  }
  if (!configured) {
    return {
      tier, configured: false, sync: false, messaging: false, reminders: false,
      barcodeLookup: true, // Direct API call to Open Food Facts, doesn't need custom relay
      reasonUnavailable: `${tier === 'managed' ? 'Managed' : 'Self-hosted'} sync is selected but no server URL is saved yet — finish setup in Settings → Cloud.`,
    }
  }
  return { tier, configured: true, sync: true, messaging: true, reminders: true, barcodeLookup: true }
}
