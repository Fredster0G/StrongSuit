import { Logomark } from './brand/Logomark'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'

/** Shown while the trainer record loads and the exercise library seeds —
 *  keeps first paint from racing IndexedDB (spec: no page should query the
 *  db before boot has had a chance to seed it). */
export function BootScreen({ fadingOut = false }: { fadingOut?: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-surface2 ${fadingOut ? 'animate-[fade-out_0.35s_ease-in_both]' : ''}`}
    >
      <Logomark size={56} animated />
      <div className="text-center">
        <div className="font-display text-lg font-bold tracking-tight text-ink">{APP_NAME}</div>
        <div className="text-xs text-faint">{APP_TAGLINE}</div>
      </div>
    </div>
  )
}
