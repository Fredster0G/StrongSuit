import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  translate, resolveLocale, isRtl, formatNumber, formatDate,
  type Catalogue,
} from './core'

const en: Catalogue = {
  'greet': 'Hello',
  'greet.name': 'Hello {name}',
  'reps': { one: '# rep', other: '# reps' },
  // A plural entry, so `#` is meaningful here.
  'both': { one: '{name} did # rep', other: '{name} did # reps' },
  // A plain string wanting the count must use {count} — `#` is ICU plural-only.
  'plainCount': '{name} did {count} reps',
}

afterEach(() => vi.restoreAllMocks())

describe('translate — lookup and fallback', () => {
  it('returns the translated string when present', () => {
    expect(translate('greet', { greet: 'Hola' }, en, 'es')).toBe('Hola')
  })

  it('falls back to English when the locale is missing the key', () => {
    // A partially-translated catalogue is the NORMAL state during rollout —
    // it must degrade to English, never to a raw key.
    expect(translate('greet', {}, en, 'es')).toBe('Hello')
  })

  it('returns the key only when English is missing it too', () => {
    // Reads as an obvious bug rather than as broken product copy.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(translate('nope', {}, en, 'en')).toBe('nope')
  })
})

describe('translate — interpolation', () => {
  it('substitutes named placeholders', () => {
    expect(translate('greet.name', {}, en, 'en', { name: 'Sam' })).toBe('Hello Sam')
  })

  it('leaves an unknown placeholder intact rather than printing undefined', () => {
    expect(translate('greet.name', {}, en, 'en', {})).toBe('Hello {name}')
  })

  it('substitutes # with the count, ICU-style', () => {
    expect(translate('reps', {}, en, 'en', { count: 5 })).toBe('5 reps')
  })

  it('handles a named placeholder and # in the same plural message', () => {
    expect(translate('both', {}, en, 'en', { name: 'Sam', count: 3 })).toBe('Sam did 3 reps')
    expect(translate('both', {}, en, 'en', { name: 'Sam', count: 1 })).toBe('Sam did 1 rep')
  })

  it('supports {count} in a non-plural message', () => {
    expect(translate('plainCount', {}, en, 'en', { name: 'Sam', count: 3 })).toBe('Sam did 3 reps')
  })
})

describe('translate — plurals via Intl.PluralRules', () => {
  it('picks one vs other in English', () => {
    expect(translate('reps', {}, en, 'en', { count: 1 })).toBe('1 rep')
    expect(translate('reps', {}, en, 'en', { count: 2 })).toBe('2 reps')
    expect(translate('reps', {}, en, 'en', { count: 0 })).toBe('0 reps')
  })

  it('uses the locale’s own plural categories, not English rules', () => {
    // Polish: 2–4 is `few`, 5+ is `many`. Hard-coding `n === 1` — the usual
    // hand-rolled i18n bug — gets both of these wrong.
    const pl: Catalogue = { reps: { one: '# powtórzenie', few: '# powtórzenia', many: '# powtórzeń', other: '# powtórzenia' } }
    expect(translate('reps', pl, en, 'pl', { count: 1 })).toBe('1 powtórzenie')
    expect(translate('reps', pl, en, 'pl', { count: 3 })).toBe('3 powtórzenia')
    expect(translate('reps', pl, en, 'pl', { count: 7 })).toBe('7 powtórzeń')
  })

  it('supports Arabic’s zero/two/few categories', () => {
    const ar: Catalogue = {
      reps: { zero: 'لا تكرارات', one: 'تكرار واحد', two: 'تكراران', few: '# تكرارات', many: '# تكرارًا', other: '# تكرار' },
    }
    expect(translate('reps', ar, en, 'ar', { count: 0 })).toBe('لا تكرارات')
    expect(translate('reps', ar, en, 'ar', { count: 2 })).toBe('تكراران')
    expect(translate('reps', ar, en, 'ar', { count: 3 })).toBe('3 تكرارات')
  })

  it('falls back to `other` when a translation omits a category it needs', () => {
    const partial: Catalogue = { reps: { other: '# powt.' } }
    expect(translate('reps', partial, en, 'pl', { count: 3 })).toBe('3 powt.')
  })

  it('falls back to the English plural forms when a translation is malformed', () => {
    const broken: Catalogue = { reps: {} }
    expect(translate('reps', broken, en, 'en', { count: 2 })).toBe('2 reps')
  })

  it('treats a missing count as zero, consistently with plural selection', () => {
    // selectPlural already reads an absent count as 0, so `#` must agree.
    expect(translate('reps', {}, en, 'en')).toBe('0 reps')
  })

  it('does NOT expand # in a non-plural message', () => {
    // "Ranked #1" must survive intact — `#` is only ICU's count shorthand
    // inside a plural, and expanding it everywhere would corrupt ordinary copy.
    const cat: Catalogue = { rank: 'Ranked #1 this week' }
    expect(translate('rank', cat, cat, 'en', { count: 7 })).toBe('Ranked #1 this week')
  })
})

describe('resolveLocale', () => {
  it('prefers an exact regional match', () => {
    expect(resolveLocale(['pt-BR'])).toBe('pt-BR')
  })

  it('matches a bare language to a supported variant', () => {
    expect(resolveLocale(['pt'])).toBe('pt-BR')
  })

  it('walks the preference list in order', () => {
    expect(resolveLocale(['xx', 'yy', 'de'])).toBe('de')
  })

  it('falls back to English when nothing matches', () => {
    expect(resolveLocale(['xx'])).toBe('en')
    expect(resolveLocale([])).toBe('en')
  })

  it('ignores region when the language is supported without one', () => {
    expect(resolveLocale(['de-AT'])).toBe('de')
  })
})

describe('isRtl', () => {
  it('detects RTL languages including regional variants', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('ar-EG')).toBe(true)
    expect(isRtl('he')).toBe(true)
    expect(isRtl('en')).toBe(false)
    expect(isRtl('zh-Hans')).toBe(false)
  })
})

describe('formatting delegates to Intl', () => {
  it('formats numbers per locale', () => {
    // German uses . for thousands — the exact reason not to hand-roll this.
    expect(formatNumber(1234.5, 'de')).toBe('1.234,5')
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5')
  })

  it('formats dates per locale', () => {
    const d = new Date('2026-03-09T12:00:00Z')
    expect(formatDate(d, 'en', { month: 'short', day: 'numeric', timeZone: 'UTC' })).toBe('Mar 9')
    expect(formatDate(d, 'ja', { month: 'short', day: 'numeric', timeZone: 'UTC' })).toBe('3月9日')
  })
})
