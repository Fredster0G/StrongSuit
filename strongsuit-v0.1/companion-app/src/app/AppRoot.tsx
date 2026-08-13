import { useEffect, useState } from 'react'
import { profileRepo } from '@/db/repo'
import { applyTheme } from '@/lib/theme'
import { initAutoSync } from '@/lib/autoSync'
import type { CompanionProfile } from '@/db/types'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { Shell } from './Shell'

/** Gates the app on the one profile row existing — same "don't let a page
 *  query the DB before boot is ready" discipline as the coach app's
 *  AppRoot, just without the two-phase splash treatment (Companion is a
 *  lighter, faster-booting app; there's no exercise library to seed). */
export function AppRoot() {
  const [profile, setProfile] = useState<CompanionProfile | null>(null)
  const [error, setError] = useState<string>('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    profileRepo.getOrCreate().then(p => {
      if (cancelled) return
      setProfile(p)
      applyTheme(p.theme)
      if (p.onboarded) initAutoSync() // event-driven only — see lib/autoSync.ts
    }).catch((err: unknown) => {
      // Nothing used to catch this, and `!profile` renders null — so any
      // failure here (a storage refusal in private mode, the first-launch
      // insert race this repo hit for real) showed a permanently blank app
      // with no message and no way out.
      if (cancelled) return
      console.error('[boot] could not load your profile', err)
      setError(err instanceof Error ? err.message : String(err))
    })
    return () => { cancelled = true }
  }, [attempt])

  // Theme choice applies live whenever the profile changes (Settings picker).
  useEffect(() => { if (profile) applyTheme(profile.theme) }, [profile?.theme])

  if (error) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-base font-bold text-ink">Companion couldn’t start</p>
        <p className="text-xs text-muted">We couldn’t open this device’s storage.</p>
        <p className="break-words font-mono text-2xs text-faint">{error}</p>
        <p className="text-2xs text-muted">
          Your training data is stored in this browser and hasn’t been touched. If retrying
          doesn’t help, check that you aren’t in private browsing and that storage is allowed.
        </p>
        <button
          className="min-h-[44px] rounded-ctl bg-verde-600 px-4 text-sm font-medium text-white"
          onClick={() => { setError(''); setAttempt(a => a + 1) }}
        >
          Try again
        </button>
      </div>
    )
  }

  if (!profile) return null

  if (!profile.onboarded) {
    return <Onboarding profile={profile} onDone={p => setProfile(p)} />
  }

  return <Shell profile={profile} onProfileChange={setProfile} />
}
