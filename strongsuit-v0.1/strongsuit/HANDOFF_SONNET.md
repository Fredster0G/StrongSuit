# HANDOFF — CONTINUATION BRIEF FOR CLAUDE SONNET (or any AI)
You are continuing a commercial build. Read this file completely before writing any code.
Reading order: **this file → PROGRESS.md → STRONGSUIT_MASTER_SPEC.md §0, §7, then the § for your phase.**

## 1. Prime directives (compressed from spec §0 — violations = rework)
- Zero backend, zero network at runtime. Data = IndexedDB via Dexie only, through `src/db/repo/` — components NEVER import Dexie directly.
- Banned: emoji-as-icons · purple/indigo gradients · glassmorphism · `window.alert/confirm/prompt` · lorem ipsum · unstyled empty states · inconsistent radii (use `rounded-ctl`/`rounded-card` only).
- Every screen designs its empty/loading/error states with real copy in the product voice (spec §7.6: plain, capable, sentence case, button = outcome, e.g. "Save program" → toast "Program saved.").
- All numerals in data contexts get `font-mono tnum`.
- Colors ONLY via token classes (`text-ink`, `bg-surface`, `border-line`, `text-verde-600`, `text-ember-600`, `bg-verde-100`, `text-faint`, `text-muted`, `bg-surface2`, `text-signal-600`). Never raw hex in components.

## 2. Codebase map (what exists, where to wire)
```
src/design/           controls.tsx (Button, IconButton, Input, Select, Textarea, Field, Label)
                      surfaces.tsx (Card, SectionHeader★, EmptyState, Stat, Tag, PRTag★, Kbd, Avatar, InjuryRibbon)
                      overlay.tsx  (Dialog [native <dialog>], toast()/toastError()/Toaster, Tabs, Table)
                      index.ts     barrel — import everything from '@/design'
src/db/types.ts       ALL entity + program-structure types. Extend here first, always.
src/db/schema.ts      Dexie v1. Schema changes = APPEND this.version(2).stores({...}).upgrade() — never edit v1.
src/db/repo/          base.ts (makeRepo factory + mergeUpsert) · index.ts (all entity repos; domain queries live here)
src/db/backup.ts      export/import/encrypt/panicDump/downloadText — DONE, don't touch without running tests
src/db/seed/exercises.ts  48/350 seeded — EXPANSION POINT marked in-file, keep the SeedRow shape
src/lib/core.ts       newId, stamp, e1rm, setTonnage, units, fmtLoad, fullName, initials, daysSince, today
src/app/Shell.tsx     left rail + BackupHealth. router.tsx: hash router, all routes registered.
src/features/         dashboard/ clients/ settings/ library/ programs/ logging/ calendar/
                      business/ reports/ companion/ shell/ onboarding/ filmroom/ = all real.
                      placeholders.tsx only still exports KitchenSink (#/kitchen-sink) + dead CalendarPage stub.
src/lib/progression.ts  Progression engine (spec §4.14): suggestNext(policy,…) for the 3 ProgressionPolicy kinds
                      + suggestHeuristic(history, units) policy-free fallback. Pure + unit-tested. Every
                      Suggestion carries a `reason` string — NEVER surface a number without its reason.
src/lib/business.ts   Profit Planner math (spec §4.17): expenseAppliesTo/expensesForMonth/incomeForMonth/profitPlan.
                      Pure + unit-tested. UI = BusinessPage. Expense entity is Dexie v3; envelope schemaVersion is now 2.
src/features/filmroom/FilmRoomPage.tsx  Film Room (spec §4.16) — local video analysis. Session-only object URLs,
                      never persist video blobs to IndexedDB.
src/lib/pose.ts       Pose analysis math (spec §4.16b): jointAngle, RepCounter, FocusJointPicker,
                      depthPct, symmetryPct, BONES. Pure — MediaPipe never imported here.
src/features/filmroom/tracker.ts  MediaPipe PoseLandmarker wrapper. LAZY dynamic import only —
                      never import it statically or the main bundle eats 132KB. Model+wasm live in
                      public/mediapipe/ (bundled, offline); if you touch them, verify the 3 files
                      still load from local origin.
src/lib/nutrition.ts  Nutrition engine (spec §4.18a) + warmupRamp. Every output has {text, source}.
src/lib/readiness.ts  Readiness score (spec §4.18b). Check-in mood/energy are 1–10 scales.
src/features/clients/NutritionTab.tsx  Client nutrition tab (profile fields live on Client, unindexed).
```
★ = brand signature elements (spec §7.4). Use them; don't invent parallel patterns.

## 3. Established conventions (match these exactly)
- Live data: `useLiveQuery(() => repo.xxx(), [deps], initialValue)` from dexie-react-hooks. `undefined` = loading state.
- Mutations: call repo → `toast('Outcome.')`. Errors → `toastError('What happened — how to fix.')`.
- Forms: local `useState` object + `set(key)` curried handler (see `NewClientDialog` for the canonical pattern). Persist-on-blur for settings-style fields (see `BrandCard`).
- Dialogs: controlled `open`/`onClose` on the native-dialog `Dialog` primitive.
- Page skeleton: `SectionHeader` with optional action button → content. Loading = pulsing Card. Empty = `EmptyState` with a real next action.
- Files: one feature folder per spec §2.3; pages named `XxxPage.tsx`;
- Schema changes (the S6 recipe — follow exactly): add type to `types.ts` → APPEND `this.version(N+1).stores({...})` in `schema.ts` → add table property + `ALL_TABLES` entry → add to `BackupEnvelope.data` (optional field, comment which envelope version introduced it) → bump `SCHEMA_VERSION` → repo in `repo/index.ts`. Older apps then correctly refuse newer backups.
- Progression suggestions: never show a suggested number without its `reason` line (tooltip or subcaption). Deterministic + explainable is the product promise (spec §4.14).
- Pure math lives in `src/lib/*.ts` with unit tests (see `progression.test.ts`, `engines.test.ts`); pages only format and render it.
- Evidence rule (extends the reason rule): any AI/nutrition/readiness output shows its rationale AND source citation in the UI. New engines must follow `RationaleLine {text, source}`.
- On-device AI rule: no API keys, no external model hosts, ever. Models ship in `public/` at build time; heavy runtimes load via lazy `import()` behind an explicit user action; detection loops ride presented-frame callbacks, never `setInterval`.
- ALWAYS run npm/vitest/build from `strongsuit-v0.1/strongsuit/` — running from the repo root half-works (files resolve, aliases don't) and once scattered npm artifacts at the root (fixed in S7).

## 4. YOUR TASK QUEUE (in order — do not reorder; spec § refs are the contract)

### T1 — Printable/branded documents (spec §4.8 — the oldest unbuilt P0)
Print routes + `@media print` stylesheets in `src/print/`: (a) Program PDF (trainer logo from Brand Kit, program overview, week grids), (b) Progress report PDF (e1RM/tonnage charts as inline SVG, PR feed, adherence % for a date range — reuse `lib/analytics.ts`), (c) blank session sheet + PAR-Q intake. "Download PDF" = designed window.print() guidance. Wire entry points: Program Builder header, client Overview tab, Reports page.

### T2 — Progression engine completion (spec §4.14; core is BUILT in `lib/progression.ts`)
a. Policy editor: attach a `ProgressionPolicy` to a Program in the Builder (small Select + params popover on the program header; type already exists on `Program.progressionPolicy`).
b. Ghost values in SessionLoggerPage: when the day's program has a policy, prefill suggested load/reps as ghost text via `suggestNext` + that exercise's history (`logsRepo.exerciseHistory`), with the reason line as a tooltip. Match the "Suggested next" card pattern already in `ExerciseHistoryDrawer.tsx`.
c. Use the policy (not the heuristic) for duplicate-week auto-progression in the builder if not already consistent.

### T3 — Coaching message log (spec §4.19 — answers the "no messaging" objection)
New entity `CoachMessage { clientId, date, body }` (Dexie v4 — APPEND version; bump envelope SCHEMA_VERSION to 3 and add table to ALL_TABLES + BackupEnvelope, mirroring how S6 added expenses). Per-client "Messages" tab: timestamped log, exportable branded HTML digest (reuse companion/export.ts brand-injection pattern), optional read-only "From your coach" section in the Companion export.

### T4 — Film Room + tracking polish (spec §4.16/4.16b — core is BUILT)
a. **Manual QA with real phone footage first** (portrait, 60fps, squat + press): verify skeleton alignment, sync-lock accuracy, and rep-counter thresholds (debt #10) — tune `RepCounter` constants or add One-Euro smoothing in `lib/pose.ts` if jittery; thresholds are unit-tested so tune tests alongside.
b. Per-rep results table + "copy to session notes"; PNG snapshot export of stage+annotations.
c. Reference-clip tracking + client-vs-reference angle deltas (the killer demo).
d. Register `/film-room` in CommandPalette. Keep videos session-only.

### T4b — Intelligence surfacing (small, high-value)
Readiness on the Dashboard attention queue ("2 clients red today" → deep-link); nutrition targets included in Companion export + printable docs (T1 ties in); gym-cut line item on the printable income summary.

### T5 — Phase 9: Hardening & release (spec §8)
vite-plugin-pwa, error boundaries per route, **fix known debt #6** (first-boot getOrCreate ConstraintError race — make it `put()` or catch), code-split builder + film room (debt #8), reduced-motion pass, Lighthouse, cross-browser, `HOW-TO-OWN-IT.md`.

### Marketing track (parallel, non-code)
`BRANDING_PLAN.md` at repo root is the contract for all naming/copy: features are called **Film Room**, **Companion**, **Profit Planner**, **The Ledger**. Landing-page savings calculator mirrors `lib/business.ts` math.

## 5. Honesty ledger
Two contained `as any` at Dexie generic boundaries (documented in PROGRESS.md). Attention-queue is O(all logs) — acceptable until Phase 5. If you cut a corner, write it in PROGRESS.md "Known debts" — silent debt is the only unacceptable kind.

## 6. Definition of "session done"
Build green · tests green · PROGRESS.md table + session log updated · new conventions appended to §3 of this file · this file's task queue re-pointed at the true next task.
