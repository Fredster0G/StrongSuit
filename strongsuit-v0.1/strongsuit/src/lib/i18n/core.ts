// ===== i18n core (docs/plans/07-PLATFORM.md §1) =====
//
// Hand-rolled, and deliberately so. The decision, stated plainly because a
// future session will otherwise assume it was laziness:
//
//   i18next is a fine library and its TS peer range is compatible. What it
//   would add is ~40KB of runtime plus a React binding, to solve problems the
//   platform already solves. The genuinely hard parts of i18n — per-locale
//   plural categories, date and number formatting — are `Intl.PluralRules`,
//   `Intl.DateTimeFormat` and `Intl.NumberFormat`, which are built into every
//   browser this app supports and are correct for every locale by definition.
//   What's left is key lookup, interpolation and lazy catalogue loading, which
//   is the ~200 lines below.
//
//   This also matches how the rest of the codebase already works: the service
//   worker, the fuzzy search and every chart are hand-rolled for the same
//   reason, and the main bundle has a protected budget (476KB).
//
// If this ever needs message *contexts*, gender selection, or a translator
// ecosystem that demands PO files, revisit — that's the point where a real
// library earns its weight.
//
// PLURALS: a catalogue entry may be a string, or an object keyed by CLDR
// plural category. `Intl.PluralRules` picks the category, so Arabic's six
// forms and Polish's four work correctly without us encoding any rules.

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>
export type Message = string | PluralForms
export type Catalogue = Record<string, Message>

/** BCP-47 tags we ship. Tier 1 gets human review (docs/plans/07 §1.3). */
export const LOCALES = [
  'en', 'es', 'pt-BR', 'fr', 'de', 'it', 'nl', 'pl',
  'ja', 'ko', 'zh-Hans', 'zh-Hant', 'ar', 'ru', 'tr', 'hi',
] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Right-to-left locales. Drives <html dir>. */
const RTL_LOCALES = new Set<string>(['ar', 'he', 'fa', 'ur'])

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale.split('-')[0])
}

export interface TranslateOptions {
  /** Values for {placeholder} substitution. `count` also drives plurals. */
  [key: string]: string | number | undefined
}

/**
 * Resolve a key against a catalogue, with the English catalogue as fallback.
 *
 * A missing key NEVER renders as a raw key — it falls back to English, and
 * only if English is missing too does it surface the key, which then reads as
 * an obvious bug rather than as broken-looking product copy.
 */
export function translate(
  key: string,
  catalogue: Catalogue,
  fallback: Catalogue,
  locale: string,
  opts?: TranslateOptions,
): string {
  const entry = catalogue[key] ?? fallback[key]
  if (entry === undefined) {
    // Loud in dev, silent in production: a missing string should be fixed,
    // but must never crash a coach's session or spam their console.
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`)
    return key
  }

  const isPlural = typeof entry !== 'string'
  const template = isPlural
    ? selectPlural(entry, locale, Number(opts?.count ?? 0), key, fallback)
    : entry

  return interpolate(template, opts, isPlural)
}

function selectPlural(
  forms: PluralForms,
  locale: string,
  count: number,
  key: string,
  fallback: Catalogue,
): string {
  let category: Intl.LDMLPluralRule
  try {
    category = new Intl.PluralRules(locale).select(count)
  } catch {
    // An unsupported locale tag shouldn't break rendering.
    category = new Intl.PluralRules(DEFAULT_LOCALE).select(count)
  }

  // 'other' is required by CLDR for every locale, so it's the safety net.
  const picked = forms[category] ?? forms.other
  if (picked !== undefined) return picked

  // The translated entry is malformed — fall back to English rather than
  // rendering nothing.
  const en = fallback[key]
  if (en && typeof en !== 'string') {
    return en[category] ?? en.other ?? key
  }
  return typeof en === 'string' ? en : key
}

/**
 * `{name}` substitution, plus ICU's `#` shorthand for the count.
 *
 * `#` is ONLY expanded inside a plural message. In ICU that's the only place
 * it's meaningful, and treating it as the count everywhere would quietly
 * corrupt ordinary copy — "Ranked #1" would render as "Ranked 01". Plural
 * messages are the only ones that get the substitution.
 *
 * A missing count renders as 0, matching the plural category selection, which
 * already treats an absent count as 0. Consistent beats clever.
 */
function interpolate(template: string, opts: TranslateOptions | undefined, isPlural: boolean): string {
  const withNames = template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = opts?.[name]
    return v === undefined ? whole : String(v)
  })
  if (!isPlural) return withNames
  return withNames.replace(/#/g, String(opts?.count ?? 0))
}

// ---------------------------------------------------------------- detection

/**
 * Best supported locale for a user, preferring an exact regional match
 * (`pt-BR`) over the bare language, then falling back to English.
 */
export function resolveLocale(preferred: readonly string[]): Locale {
  const supported = LOCALES as readonly string[]
  for (const tag of preferred) {
    if (supported.includes(tag)) return tag as Locale
    const base = tag.split('-')[0]
    // An exact regional variant wins; otherwise any variant of the language.
    const match = supported.find(l => l === base || l.split('-')[0] === base)
    if (match) return match as Locale
  }
  return DEFAULT_LOCALE
}

/** What the browser says the user wants. */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  return resolveLocale(navigator.languages ?? [navigator.language])
}

// ---------------------------------------------------------------- formatting

/** Locale-aware number formatting. Never hand-roll this. */
export function formatNumber(value: number, locale: string, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, opts).format(value)
}

export function formatDate(value: Date | string, locale: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat(locale, opts ?? { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

/** "3 days ago" — uses the platform's relative formatter, not a bespoke one. */
export function formatRelativeDays(days: number, locale: string): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day')
}
