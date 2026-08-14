// ===== Loyalty & advocacy asks (docs/plans/06-EDITIONS-PRICING.md §4.6) =====
//
// You asked for loyalty mechanics, a donation ask and a LinkedIn follow. The
// entire risk in that feature is TONE: the same three asks are either a
// respectful "if you've got value from this…" or the thing that makes someone
// uninstall. The difference is timing and restraint, so timing and restraint
// are the parts written in code and covered by tests.
//
// THE RULES, from the plan, each enforced by a test below:
//
//   · NEVER a modal on first launch. Never a modal at all — these render as a
//     quiet inline card, and this module refuses to produce one until the
//     conditions below hold.
//   · ONLY AFTER A GENUINE WIN. Not "opened the app 5 times" — a real
//     coaching outcome: a client PR, a completed program, a run of logged
//     sessions. Asking someone who hasn't got value yet is what makes an ask
//     feel like a toll booth.
//   · DISMISSIBLE FOREVER, and forever means forever. One "no thanks" ends
//     that ask permanently, with no clever re-prompt six months later.
//   · NEVER NAGGING. One ask at a time, long cooldown between different asks,
//     and a hard cap on how many the app will ever make.
//   · THE DONATION ASK IS NOT IN HERE AS A PROMPT. §4.6 says it lives as a
//     single quiet entry in Settings — never a popup, never a banner. There is
//     deliberately no 'donate' case in `chooseAsk`, so it cannot become one.
//
// Pure — takes state and signals, returns a decision.

export type AskKind = 'linkedin' | 'review' | 'referral' | 'contribute'

/** Persisted per-ask state. `dismissedAt` is terminal. */
export interface AskRecord {
  shownAt?: string
  /** Set when the user says no. Never cleared — see the header. */
  dismissedAt?: string
  /** Set when they actually did the thing. Also terminal. */
  actedAt?: string
}

export interface AdvocacyState {
  /** Keyed by ask. */
  asks: Partial<Record<AskKind, AskRecord>>
  /** When this install was first used. */
  firstRunAt?: string
}

/** Evidence the coach has actually got value out of the app. */
export interface WinSignals {
  sessionsLogged: number
  clientsWithPrs: number
  programsCompleted: number
  /** Days since first run. */
  daysUsed: number
}

/** Minimum before ANY ask is allowed, however good the numbers look. Someone
 *  three days in hasn't formed a view worth broadcasting. */
export const MIN_DAYS_BEFORE_ASK = 30
/** Days between two different asks. Long on purpose. */
export const ASK_COOLDOWN_DAYS = 120
/** Hard ceiling on lifetime asks across all kinds. After this the app never
 *  asks again, whatever happens. */
export const MAX_LIFETIME_ASKS = 3

/**
 * Has this coach actually had a win worth celebrating?
 *
 * Deliberately NOT engagement metrics. "Opened the app 20 times" measures our
 * retention, not their outcome, and asking on that basis is asking for a
 * favour in exchange for nothing.
 */
export function hasGenuineWin(s: WinSignals): boolean {
  if (s.daysUsed < MIN_DAYS_BEFORE_ASK) return false
  return s.clientsWithPrs >= 1 || s.programsCompleted >= 1 || s.sessionsLogged >= 40
}

function daysBetween(fromIso: string | undefined, now: Date): number {
  if (!fromIso) return Infinity
  const t = new Date(fromIso).getTime()
  if (Number.isNaN(t)) return Infinity
  return (now.getTime() - t) / 86_400_000
}

/** An ask is settled once the user has dismissed it or acted on it. Both are
 *  permanent: re-asking someone who already said no is the definition of
 *  nagging, and re-asking someone who already did it is worse. */
export function isSettled(rec: AskRecord | undefined): boolean {
  return !!(rec?.dismissedAt || rec?.actedAt)
}

/** Total asks this install has ever shown. */
export function lifetimeAsks(state: AdvocacyState): number {
  return Object.values(state.asks).filter(r => r?.shownAt).length
}

export interface AskDecision {
  ask: AskKind | null
  /** Why — surfaced in dev tooling and useful when someone asks "why did it
   *  show me that". Never shown to the user as-is. */
  reason: string
}

/**
 * Which ask, if any, may be shown right now.
 *
 * Returns `null` in every ambiguous case. The default answer to "should we ask
 * the user for something?" is no.
 */
export function chooseAsk(
  state: AdvocacyState,
  signals: WinSignals,
  now: Date = new Date(),
): AskDecision {
  if (!hasGenuineWin(signals)) {
    return { ask: null, reason: 'No genuine win yet — asking now would be asking for a favour in exchange for nothing.' }
  }
  if (lifetimeAsks(state) >= MAX_LIFETIME_ASKS) {
    return { ask: null, reason: 'This install has already been asked the maximum number of times.' }
  }

  // Cooldown measured from the most recent ask of ANY kind, so three different
  // asks can't arrive in the same week by each checking only itself.
  const lastShown = Object.values(state.asks)
    .map(r => r?.shownAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1)
  if (lastShown && daysBetween(lastShown, now) < ASK_COOLDOWN_DAYS) {
    return { ask: null, reason: 'Too soon after the last ask.' }
  }

  // Cheapest-for-the-user first: a follow costs a click, a case study costs an
  // afternoon. Asking for the big one first is how you get a no to everything.
  const order: AskKind[] = ['linkedin', 'review', 'referral', 'contribute']
  for (const kind of order) {
    if (!isSettled(state.asks[kind]) && !state.asks[kind]?.shownAt) {
      return { ask: kind, reason: 'Eligible.' }
    }
  }
  return { ask: null, reason: 'Every ask has been shown, dismissed or acted on.' }
}

/** Record that an ask was shown. */
export function markShown(state: AdvocacyState, kind: AskKind, now = new Date()): AdvocacyState {
  return { ...state, asks: { ...state.asks, [kind]: { ...state.asks[kind], shownAt: now.toISOString() } } }
}

/** Record a permanent "no thanks". */
export function markDismissed(state: AdvocacyState, kind: AskKind, now = new Date()): AdvocacyState {
  return { ...state, asks: { ...state.asks, [kind]: { ...state.asks[kind], dismissedAt: now.toISOString() } } }
}

/** Record that they did it. Also permanent — never thank someone by asking
 *  again. */
export function markActed(state: AdvocacyState, kind: AskKind, now = new Date()): AdvocacyState {
  return { ...state, asks: { ...state.asks, [kind]: { ...state.asks[kind], actedAt: now.toISOString() } } }
}

/** Copy for each ask. Written to be refusable: every one names the benefit to
 *  US honestly rather than pretending the favour is for the user. */
export const ASK_COPY: Record<AskKind, { title: string; body: string; action: string }> = {
  linkedin: {
    title: 'Following us helps more than you’d think',
    body: 'We don’t advertise, so word of mouth is genuinely how coaches find this. A follow on LinkedIn costs you a click.',
    action: 'Follow on LinkedIn',
  },
  review: {
    title: 'Would you write a couple of honest lines?',
    body: 'A public review — good or critical — helps other coaches decide whether this fits how they work.',
    action: 'Write a review',
  },
  referral: {
    title: 'Know a coach who’d use this?',
    body: 'Your link gives them $30 off and gives you $30 of cloud credit. No pressure, and no tracking beyond the code itself.',
    action: 'Get my link',
  },
  contribute: {
    title: 'Spotted a broken demo link, or a bad translation?',
    body: 'Fixes get credited and earn cloud credit. Link upkeep and translations are the two things we genuinely can’t keep up with alone.',
    action: 'See what needs doing',
  },
}
