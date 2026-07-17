import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { BootScreen } from './BootScreen'
import { trainerRepo } from '@/db/repo'
import { seedExercisesIfEmpty } from '@/db/seed/exercises'

const BOOT_FADE_MS = 380

/** Gates the router behind the boot sequence (theme + durable storage +
 *  exercise-library seed) so no page can query IndexedDB before it's ready —
 *  previously this ran fire-and-forget while the router mounted immediately. */
export function AppRoot() {
  const [ready, setReady] = useState(false)
  const [showBoot, setShowBoot] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const t = await trainerRepo.getOrCreate()
      const dark = t.theme === 'dark' || (t.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
      if (navigator.storage?.persist) navigator.storage.persist()
      await seedExercisesIfEmpty()
      if (cancelled) return
      setReady(true)
      setTimeout(() => { if (!cancelled) setShowBoot(false) }, BOOT_FADE_MS)
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <>
      {ready && <RouterProvider router={router} />}
      {showBoot && <BootScreen fadingOut={ready} />}
    </>
  )
}
