// Theme application — the Settings picker wrote profile.theme but nothing
// ever toggled the `.dark` class, so the setting was a no-op until S13.
// `system` follows the OS live (media-query listener, torn down on change).
import type { Theme } from '@/db/types'

let mq: MediaQueryList | null = null
let listener: ((e: MediaQueryListEvent) => void) | null = null

function set(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

export function applyTheme(theme: Theme) {
  if (mq && listener) {
    mq.removeEventListener('change', listener)
    mq = null
    listener = null
  }
  if (theme === 'system') {
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    set(mq.matches)
    listener = e => set(e.matches)
    mq.addEventListener('change', listener)
  } else {
    set(theme === 'dark')
  }
}
