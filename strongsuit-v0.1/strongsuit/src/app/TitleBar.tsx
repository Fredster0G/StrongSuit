import { useEffect, useState, type CSSProperties } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { Logomark } from './brand/Logomark'
import { APP_NAME } from '@/lib/brand'
import { useTranslation } from '@/lib/i18n'

/** Present only inside the Electron desktop build (electron/preload.ts). */
interface TitleBarAPI {
  platform?: string
  showAppMenu?: () => void
  windowMinimize?: () => void
  windowMaximizeToggle?: () => void
  windowClose?: () => void
  windowIsMaximized?: () => Promise<boolean>
  onWindowMaximizedChange?: (cb: (maximized: boolean) => void) => () => void
}

type DragCss = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }
const DRAG: DragCss = { WebkitAppRegion: 'drag' }
const NO_DRAG: DragCss = { WebkitAppRegion: 'no-drag' }

/** Custom Windows/Linux window chrome. `electron/main.ts` sets `frame: false`
 *  on those platforms specifically because the native fallback there is a
 *  boxy classic title bar plus an always-visible File/Edit/Go/View/Window/
 *  Help menu row — it reads like Windows 7 next to the rest of the app.
 *  The native menu (`electron/menu.ts`) still exists underneath, for its
 *  accelerators (Ctrl+Shift+N etc.) and as a popup triggered from here.
 *
 *  macOS is untouched on purpose: it keeps `titleBarStyle: 'hiddenInset'`,
 *  which already gives native inset traffic lights, and its menu bar lives
 *  at the top of the screen, outside the window entirely — there is nothing
 *  dated to replace there. */
export function TitleBar() {
  const [api] = useState<TitleBarAPI | undefined>(
    () => (window as unknown as { electronAPI?: TitleBarAPI }).electronAPI,
  )
  const [maximized, setMaximized] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    if (!api?.windowIsMaximized) return
    api.windowIsMaximized().then(setMaximized).catch(() => {})
    return api.onWindowMaximizedChange?.(setMaximized)
  }, [api])

  // Not inside Electron at all (browser dev/preview, Capacitor) — no native
  // window to chrome. On mac, the native inset traffic lights already do the
  // job, so there is nothing for this bar to render there either.
  if (!api?.platform || api.platform === 'darwin') return null

  return (
    <div
      className="flex h-9 shrink-0 select-none items-stretch border-b border-line bg-surface print:hidden"
      style={DRAG}
      onDoubleClick={() => api.windowMaximizeToggle?.()}
    >
      <button
        type="button"
        onClick={() => api.showAppMenu?.()}
        style={NO_DRAG}
        className="flex items-center gap-2 px-3 text-xs font-semibold text-muted transition-colors hover:bg-surface2 hover:text-ink"
        title={t('shell.menu')}
      >
        <Logomark size={15} />
        <span className="font-display tracking-tight">{APP_NAME}</span>
      </button>
      <div className="flex-1" />
      <div style={NO_DRAG} className="flex items-stretch">
        <button
          type="button"
          aria-label={t('shell.minimize')}
          onClick={() => api.windowMinimize?.()}
          className="flex w-11 items-center justify-center text-muted transition-colors hover:bg-surface2 hover:text-ink"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          aria-label={maximized ? t('shell.restore') : t('shell.maximize')}
          onClick={() => api.windowMaximizeToggle?.()}
          className="flex w-11 items-center justify-center text-muted transition-colors hover:bg-surface2 hover:text-ink"
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          aria-label={t('shell.close')}
          onClick={() => api.windowClose?.()}
          className="flex w-11 items-center justify-center text-muted transition-colors hover:bg-signal-600 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
