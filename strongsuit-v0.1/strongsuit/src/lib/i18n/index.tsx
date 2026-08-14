import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_LOCALE, LOCALES, detectLocale, isRtl, translate,
  formatDate, formatNumber, formatRelativeDays,
  type Catalogue, type Locale, type TranslateOptions,
} from './core'
import en, { type MessageKey } from './locales/en'

// ===== i18n React binding =====
//
// English is bundled (it's the fallback, so it must always be present and can
// never be a network hop). Every other locale is a lazily-imported JSON
// catalogue, so a coach who uses the app in German never downloads Japanese.

const LOCALE_STORAGE_KEY = 'coachwright.locale'

/** Lazy catalogue loaders, DISCOVERED from the files that actually exist.
 *
 *  Deliberately not a hardcoded list: a hardcoded map either references JSON
 *  that isn't there yet (a build error) or claims to support a language we
 *  haven't translated (a lie to the user). With glob, shipping a language is
 *  exactly "add locales/xx.json" — and `availableLocales()` below can tell the
 *  language picker the truth about what's really available.
 *
 *  Vite turns each match into its own lazy chunk, so a German user never
 *  downloads Japanese. */
const MODULES = import.meta.glob<{ default: Catalogue }>('./locales/*.json')

const LOADERS: Record<string, () => Promise<{ default: Catalogue }>> = Object.fromEntries(
  Object.entries(MODULES).map(([path, load]) => [
    path.replace('./locales/', '').replace('.json', ''),
    load,
  ]),
)

/** Locales with a real catalogue on disk, plus English. What the picker shows. */
export function availableLocales(): Locale[] {
  return (LOCALES as readonly string[])
    .filter(l => l === DEFAULT_LOCALE || l in LOADERS) as Locale[]
}

export interface I18nValue {
  locale: Locale
  setLocale: (l: Locale) => void
  /** Translate. Key is compile-checked against the English catalogue. */
  t: (key: MessageKey, opts?: TranslateOptions) => string
  /** True while a non-English catalogue is still downloading. */
  loading: boolean
  rtl: boolean
  formatNumber: (v: number, opts?: Intl.NumberFormatOptions) => string
  formatDate: (v: Date | string, opts?: Intl.DateTimeFormatOptions) => string
  formatRelativeDays: (days: number) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function storedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY)
    return v && v in LOADERS ? (v as Locale) : v === DEFAULT_LOCALE ? DEFAULT_LOCALE : null
  } catch {
    return null
  }
}

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? storedLocale() ?? detectLocale())
  const [catalogue, setCatalogue] = useState<Catalogue>(en)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (locale === DEFAULT_LOCALE) {
      setCatalogue(en)
      setLoading(false)
      return
    }

    const load = LOADERS[locale]
    if (!load) { setCatalogue(en); return }

    setLoading(true)
    load()
      .then(mod => { if (!cancelled) setCatalogue(mod.default) })
      .catch(() => {
        // A missing or corrupt catalogue must not blank the app — English is
        // always a correct answer, just not the preferred one.
        if (!cancelled) setCatalogue(en)
        if (import.meta.env.DEV) console.warn(`[i18n] could not load catalogue: ${locale}`)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [locale])

  // Keep the document in sync so CSS logical properties and screen readers
  // both behave. `dir` is what makes RTL work at all.
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr'
  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(LOCALE_STORAGE_KEY, l) } catch { /* private mode — not fatal */ }
  }, [])

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    loading,
    rtl: isRtl(locale),
    t: (key, opts) => translate(key, catalogue, en, locale, opts),
    formatNumber: (v, opts) => formatNumber(v, locale, opts),
    formatDate: (v, opts) => formatDate(v, locale, opts),
    formatRelativeDays: days => formatRelativeDays(days, locale),
  }), [locale, catalogue, loading, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * The hook every component uses.
 *
 * Falls back to an English-only implementation when no provider is mounted,
 * rather than throwing. That matters because print routes, the TV display and
 * tests all render components outside the app shell — a hard throw there would
 * turn a missing provider into a blank page instead of readable English.
 */
export function useTranslation(): I18nValue {
  const ctx = useContext(I18nContext)
  if (ctx) return ctx
  return FALLBACK
}

const FALLBACK: I18nValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  loading: false,
  rtl: false,
  t: (key, opts) => translate(key, en, en, DEFAULT_LOCALE, opts),
  formatNumber: (v, opts) => formatNumber(v, DEFAULT_LOCALE, opts),
  formatDate: (v, opts) => formatDate(v, DEFAULT_LOCALE, opts),
  formatRelativeDays: days => formatRelativeDays(days, DEFAULT_LOCALE),
}

export { DEFAULT_LOCALE, isRtl, LOCALES, type Locale } from './core'
export type { MessageKey }

/** Human-readable names, each in its own language — always how a language
 *  picker should read, because someone looking for their language can't read
 *  the current one. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  ja: '日本語',
  ko: '한국어',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ar: 'العربية',
  ru: 'Русский',
  tr: 'Türkçe',
  hi: 'हिन्दी',
}
