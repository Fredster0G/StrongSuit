# 07 — Platform: languages, Ctrl+K, imports, polish, performance

The "fill in the blanks so it feels like professional software" items.

---

## 1. Internationalization — every major language

### 1.1 Why this is Phase A

There is **zero i18n today** — every string is hardcoded across ~70 components. Each new feature in this plan adds more. The retrofit cost grows every day we don't do it, and every doc in this folder adds strings. **This goes first or it never happens.**

### 1.2 Approach

| Decision | Choice | Why |
|---|---|---|
| Library | **`@lingui/react`** or `i18next` | Both mature. Lingui has better compile-time extraction and smaller runtime. |
| Catalogue format | ICU MessageFormat | Handles plurals/gender properly. `{count, plural, one {# rep} other {# reps}}` — most libraries get this wrong for Slavic/Arabic. |
| Extraction | Automated from source | Never hand-maintain a key list |
| Loading | **Lazy per locale** | Never ship 30 languages to one user |
| Fallback | English, always | A missing key shows English, never a raw key |

### 1.3 Launch locales (Tier 1 — full human review)

English (US/UK) · Spanish (ES/LatAm) · Portuguese (BR) · French · German · Italian · Dutch · Polish · Japanese · Korean · Chinese (Simplified/Traditional) · Arabic **(RTL)** · Russian · Turkish · Hindi

**Tier 2** (machine translation + native spot-check, marked "community translation"): Swedish, Norwegian, Danish, Finnish, Czech, Greek, Hebrew (RTL), Indonesian, Thai, Vietnamese, Ukrainian, Romanian, Hungarian.

### 1.4 The parts everyone forgets

- **RTL layout** for Arabic and Hebrew — logical CSS properties (`margin-inline-start`, not `margin-left`) everywhere. Cheaper to do at conversion time than to retrofit. Film Room's video panes and the sidebar need explicit RTL handling.
- **Units**: kg/lb, cm/ft-in, kJ/kcal, metric/imperial fluid — partially exists, must become locale-aware defaults.
- **Dates/numbers**: `Intl.DateTimeFormat` / `Intl.NumberFormat`; week-start already exists (`weekStartsOn`) — wire to locale.
- **Name order**: family-name-first locales.
- **Exercise names are content, not UI.** 3,000 names × 30 locales is not a translation job — it's a **library localization** decision. Recommendation: translate the ~220 base patterns and the modifier vocabulary, then **compose** localized names from the same taxonomy. That's ~400 strings per locale instead of 3,000 hand-translated names. This is a strong argument for the generated-taxonomy design in [05](05-EXERCISE-LIBRARY.md).
- **The citation corpus stays in its source language** (English) — научные papers aren't translated. The AI's *explanation* is localized; the citation isn't. Say so in the UI.
- **Text expansion**: German runs ~35% longer than English. Layouts must not assume English width.

---

## 2. Ctrl+K — command palette v2

Today: fuzzy search over nav routes + clients (204 lines). Good bones, shallow reach.

### 2.1 What v2 becomes

**Everything you can do, from the keyboard, in one place.**

| Capability | Example |
|---|---|
| **Navigate** | *(current)* routes, clients |
| **Every entity** | programs, exercises (3k, semantic), sessions, invoices, messages, staff, leads, appointments |
| **Actions, not just destinations** | "log a session for Sam", "add 10 lb to Sam's squat", "start a rest timer", "export Sam's data" |
| **Scoped context** | Inside a client, `Ctrl+K` scopes to that client first |
| **Natural language** *(AI opt-in)* | "who hasn't trained in two weeks" → filtered list |
| **Calculations inline** | "1rm 225x5" → 253 lb, Epley, with the formula |
| **Unit conversion** | "100 kg" → 220.5 lb |
| **Recents & frequency ranking** | Learns what this coach actually uses |
| **Multi-step commands** | "new client" → inline form in the palette, no page change |
| **Quick capture** | "note: Sam mentioned shoulder tightness" → files to the right client |
| **Settings & help** | Jump to any setting; search the Guide |

### 2.2 Design

```ts
interface Command {
  id: string
  title: string; subtitle?: string
  group: CommandGroup
  keywords: string[]              // localized
  icon: ReactNode
  when?: (ctx: AppContext) => boolean   // edition + capability aware
  shortcut?: string
  run: (ctx, args?) => void | Promise<void>
  argSchema?: ArgSchema            // enables multi-step
}
```

- **Providers register commands**; the palette never imports feature code directly. Adding a feature adds its commands automatically.
- **Ranked**: exact > prefix > fuzzy > semantic, blended with recency/frequency.
- **Async, cancellable, debounced** — searching 3,000 exercises must never block typing.
- **Never leaves you stranded**: an empty result offers "search the Guide" and "create it".
- **Full a11y**: proper combobox roles, focus trap, screen-reader announcements.

### 2.3 Keyboard system generally

A proper shortcut layer, not ad-hoc listeners: `Ctrl+K` palette · `Ctrl+/` shortcut cheatsheet · `g` then `c/p/e/f` (go to clients/programs/exercises/film room) · `n` new (context-aware) · `Esc` consistent dismissal · Film Room transport keys *(exists; extend to the reference clip — debt #13)* · fully **remappable**, stored per device.

---

## 3. "Make sure all the imports work"

Reading this as two things, both real:

### 3.1 Code imports — CI enforcement
The lazy-route split (S14) means a bad import now shows up as a *runtime* failure on a route nobody clicked during testing. Add to CI:
- `knip` or `ts-prune` — unused exports and files
- `eslint-plugin-import` — no cycles, no unresolved, no missing extensions
- **`madge --circular`** — circular imports are the likeliest cause of a lazy chunk exploding at runtime
- **A smoke test that mounts every route** and asserts no console errors — the cheapest guard against exactly the class of bug the code split introduced

### 3.2 Data imports — the user-facing feature
Today: CSV roster import + `.coachwright` backup + `.cwsync` + `.ssdata`. For professional feel:

| Import | Notes |
|---|---|
| **CSV — any competitor** | Exists. Extend the column-mapping guesser with saved profiles per platform. |
| **TrueCoach / Trainerize / PT Distinction exports** | Named presets over the generic mapper — the mapper stays generic, the presets are just saved mappings |
| **Strong / Hevy / FitNotes** *(Personal)* | Personal users arrive with training history. Importing it is the single strongest switching incentive. |
| **Apple Health / Google Fit / Garmin / Whoop / Oura** | Standard export formats → metrics, sleep, HRV. **Feeds readiness v2 directly.** File-based import only — no OAuth, no cloud, consistent with the doctrine. |
| **MyFitnessPal / Cronometer** | Nutrition history |
| **Video** | Bulk import into Film Room |

**Every import gets: a preview with a diff, an explicit "what will change" summary, and a one-click undo.** An import that silently mangles a roster is unrecoverable trust damage — and this app has no server-side backup to fall back on.

---

## 4. First-run experience

Three onboarding flows (one per edition — see [08](08-CLAUDE-DESIGN-PROMPTS.md)), sharing:

1. **System check** ([02](02-LOCAL-AI.md) §4) — honest hardware read + optional installs
2. **Locale & units** — detected, confirmed, changeable
3. **Identity/brand** — name, business, logo *(exists)*
4. **What matters to you** — pick tracks; configures defaults instead of dumping every feature on them
5. **Optional modules** — the existing `hiddenModules` grid, framed as "turn on what you need"
6. **Import** — bring existing data in *before* the app looks empty
7. **Sample data** *(exists)* — with a genuinely one-click purge
8. **First win in under 5 minutes** — first client added, or first workout logged

**Resumable, skippable, re-runnable.** Never a 12-step wizard nobody finishes.

---

## 5. Professional polish — the "fill in the blanks" list

The gap between "works" and "feels like professional software":

| Area | Work |
|---|---|
| **Empty states** | Every list needs a purposeful empty state with one clear action. *(Partly done — audit all.)* |
| **Loading states** | Skeletons matching final layout, not spinners. No layout shift. |
| **Error states** | Every failure says what happened, why, and what to do. Extends the S14 boot/route error screens. |
| **Undo** | Anything destructive gets undo, not a confirm dialog. Confirm dialogs train people to click through. |
| **Optimistic UI** | Local writes are instant; never spin on IndexedDB. |
| **Autosave everywhere** | With a visible "saved" state. Never lose a half-written program. |
| **Bulk operations** | Multi-select on every list — archive, tag, assign, export |
| **Keyboard-complete** | Every action reachable without a mouse |
| **Accessibility** | WCAG 2.2 AA: focus order, contrast, labels, live regions, reduced motion *(done S14)*, screen-reader pass |
| **Print** | *(exists)* — extend to every report |
| **Onboarding tooltips** | Once, dismissible, never again |
| **Density toggle** | `Trainer.density` exists — honour it everywhere |
| **Dark mode** | *(exists)* — audit new surfaces |
| **Offline indicator** | Honest, non-alarming; the app works offline by design |

---

## 6. Performance targets

Enforced by CI, not by hope. At 3k exercises + 500 clients + 5 years of logs:

| Metric | Target |
|---|---|
| Cold start → interactive | < 2.0 s |
| Route transition | < 150 ms |
| Exercise search keystroke → results | **< 50 ms** |
| Program builder drag frame | 60 fps |
| Film Room tracking | ≥ 30 fps @ Standard |
| Main bundle | **< 400 kB gz** *(currently 151 kB — protect it)* |
| Memory, 8-hour session | < 500 MB, no growth trend |
| Library seed | < 10 s, backgrounded |

**Specific risks to fix:** several call sites `toArray()` whole tables (fine at 277 rows, wasteful at 3k and fatal as logs accumulate) — audit and paginate. The attention queue is O(all logs) (debt #1) — index it. Add a virtualized list primitive before the library lands, not after.
