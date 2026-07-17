// The Coachwright mark: three ascending bars (progress, strength gains — the
// thing the whole app is for) topped with a PR-tag accent dot, on a fixed
// dark badge. Deliberately NOT theme-tokenized — a brand mark should read
// the same in light and dark mode, matching public/favicon.svg exactly.
export function Logomark({ size = 32, animated = false, className = '' }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="#171A1E" />
      <rect x="11" y="25" width="7" height="10" rx="1.5" fill="#F7F6F3" className={animated ? 'origin-bottom animate-[bar-grow_0.5s_ease-out_0.05s_both]' : ''} />
      <rect x="21" y="19" width="7" height="16" rx="1.5" fill="#F7F6F3" className={animated ? 'origin-bottom animate-[bar-grow_0.5s_ease-out_0.18s_both]' : ''} />
      <rect x="31" y="13" width="7" height="22" rx="1.5" fill="#F7F6F3" className={animated ? 'origin-bottom animate-[bar-grow_0.5s_ease-out_0.31s_both]' : ''} />
      <circle cx="34.5" cy="10" r="3.6" fill="#D9730D" className={animated ? 'animate-[pop-in_0.4s_ease-out_0.55s_both]' : ''} />
    </svg>
  )
}
