import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'
import { router } from './app/router'
import { trainerRepo } from './db/repo'
import { seedExercisesIfEmpty } from './db/seed/exercises'

// theme boot + durable storage request (spec §2.5.5)
;(async () => {
  const t = await trainerRepo.getOrCreate()
  const dark = t.theme === 'dark' || (t.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  if (navigator.storage?.persist) navigator.storage.persist()
  seedExercisesIfEmpty()
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
