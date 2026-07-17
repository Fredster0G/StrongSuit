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
src/lib/brand.ts      SINGLE SOURCE OF TRUTH for the product name (Coachwright) + backup format ids.
                      User-facing strings import from here. NEVER hardcode "Coachwright"/"Strongsuit"
                      in a component. Data-level ids (DB_NAME, BACKUP_APP_ID_LEGACY) keep 'strongsuit'
                      for backward compat — do not repoint without a migration.
src/features/settings/Guide.tsx  In-app manual (11 accordion sections). Add a section when you ship a feature.
--- S9 (undocumented — see PROGRESS.md S9 note) ---
src/features/onboarding/EulaScreen.tsx  Gates the app after onboarding, before first use (Shell.tsx checks
                      `trainer.eulaAcceptedAt`). Edit the legal text here if the buyer's lawyer wants changes.
src/db/types.ts       CoachMessage (schema v5) — clientId/date/direction/channel/content. MessagesTab.tsx.
src/features/print/PrintSessionSheet.tsx  Real printable program sheet, route `/print/program/:clientId/:programId`
                      — a SIBLING top-level route (outside <Shell/>, no chrome), same pattern TV mode uses.
electron/             main.ts (BrowserWindow, secure webPreferences, nav lockdown, IPC for WiFi sync server)
                      + preload.ts (contextBridge — only exposes get-local-ip/start|stop-sync-server/sync
                      request-response). This IS the Windows app — `npm run dev:electron` / `build:electron`.
src/features/sync/    SyncCenterPage.tsx (pairing, local `.cwsync` export/import, optional Cloud Sync Server
                      URL/API-key fields) + WiFiSyncDialog.tsx (Electron-only: hosts a LAN server via IPC,
                      QR-pairs a client). Guard EVERY `window.electronAPI` call — it's undefined in the web
                      build (see the `electronAPI()` helper in WiFiSyncDialog.tsx for the pattern).
sync-server/          Sibling directory (NOT inside src/), a standalone Express+SQLite relay prototype.
                      Self-host only, NOT wired to any hosted service by default. Its API key defaults to a
                      hardcoded string — never ship that default if this is ever actually deployed.
--- S10 ---
src/lib/automations.ts  Configurable local rule engine (spec §4.29): evaluateAutomations(clients, facts, rules,
                      today) + DEFAULT_RULES (always-on, not persisted/toggleable — see Settings→Automations).
                      `daysBetween(dateStr, today)` is the deterministic day-diff helper — do NOT use
                      lib/core's `daysSince` here, it reads the real wall clock and breaks testability.
src/lib/business.ts   + staffCommissionForMonth/totalCommissionsForMonth, couponDiscount/invoiceTotals/
                      clientBalance. Same file as the Profit Planner math — keep ledger-adjacent math here.
src/lib/leaderboard.ts  leaderboard({metric, clients, sessionLogs, metrics, start, end, participantIds?}) —
                      pure ranking over data already logged. Clients must opt in (`leaderboardOptIn`).
src/lib/habits.ts     currentStreak(entries, today) — consecutive-day streak ending today or yesterday.
src/lib/media.ts      resizeImageToDataUrl(file) — browser-only (Canvas/Image), not unit-tested for that
                      reason. Used by Progress Photos so backups don't balloon with full-res images.
src/features/team/TeamPage.tsx        Staff + Location rosters, commission-owed stat per staff. Route `/team`.
src/features/leads/LeadsPage.tsx      CRM pipeline (kanban-lite), convert-to-client. Route `/leads`.
src/features/leaderboard/LeaderboardPage.tsx  Cross-client ranking + Challenge creation. Route `/leaderboard`.
src/features/tv/TvWorkoutPage.tsx     Full-screen gym-floor display, sibling route `/tv/:clientId` (no chrome,
                      same pattern as PrintSessionSheet). Read-only — logging still happens in Session Logger.
docs/SERVER_STRATEGY.md   The honest line on payments/email/SMS/push/e-commerce. READ BEFORE building anything
                      that smells like it needs a server — it tells you whether to build it, bring-your-own-
                      account it, or point the buyer at a real external tool.
docs/ANDROID_STRATEGY.md  Why Capacitor; what's scaffolded (`android/`, real but unbuilt/untested — no SDK
                      in any environment used so far); what's left, in order, for a human with Android Studio.
Film Room dual controls: `useClip(ref, clipKey, fps)` = per-video transport state; `TransportBar` =
                      one control row. `linked` (overlay or sync-locked) → one master bar drives both;
                      else Client + Reference get independent bars. `mirrorA/mirrorB` = horizontal flip.
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
- Brand rule: the product is **Coachwright**. Never hardcode the name — import from `src/lib/brand.ts`. Data-level ids stay `strongsuit` for backward compat (see the file's warning). When you add a user-facing surface, pull the name from brand.ts and add a Guide section for the feature.
- **Tailwind token rule (S10):** if you write a color class, grep `tailwind.config.js`/`src/index.css` first and confirm it's a real token. `bg-brand`, `text-brand-500`, `hover:bg-ember-50`, `dark:hover:bg-ember-900/20` all shipped to production silently as no-ops (invisible, no error, no warning) before S10 caught them by reading rendered output — Tailwind does not warn on an unmapped class, it just drops it. Approved tokens are listed in §1 above; the ember/verde scale only has 500/600 steps (use `/10`, `/20` alpha suffixes for tints, e.g. `bg-ember-500/10`, not a nonexistent `ember-50`).
- **Zero-backend discipline (S10):** before building anything that smells like it needs a server (payments, bulk email/SMS, push, hosting), read `docs/SERVER_STRATEGY.md` §1 first. The rule: local-only → build it for real; a coach-owned external link (payment link, mailto:, videoUrl) → build the integration point, not the service; a standing service running while the app is closed → document it in that file, do not fake a button that doesn't work.
- **Update-the-docs discipline:** S9 built substantial, largely-good code and updated NONE of PROGRESS.md/HANDOFF_SONNET.md — S10 spent real time reconstructing what changed before it could safely continue. Whatever you build this session, the Definition of Done (§6 below) is not optional, even for a short session.

## 4. YOUR TASK QUEUE (in order — do not reorder; spec § refs are the contract)

### T1 — Close the WiFi sync loop (debt #16 — the highest-value half-finished thing in the codebase)
S9 built the coach-side Electron WiFi server + QR pairing (`WiFiSyncDialog.tsx`) but nothing on the Companion (client) side calls it. Add a "Sync over WiFi" screen/button to `companion/template.html` (vanilla JS, no dependency) that: (a) accepts/scans the coach's LAN address, (b) POSTs its local payload to `http://<ip>:<port>/sync/push`, (c) shows the coach's return packet applied. Keep the existing `.ssdata` file path working as the always-available fallback — WiFi is a convenience layer, not a replacement.

### T2 — Verify Windows & Android on a real machine (debts #17, #18 — cannot be done in this sandbox)
Windows: `npm run dev:electron` (live window) then `npm run build:electron` (NSIS installer) — first real GUI launch this app has ever had. Android: follow `docs/ANDROID_STRATEGY.md` exactly (`npm run android:sync` → `npm run android:open` → run in Android Studio) — expect a mobile-viewport QA pass to be needed (Program Builder drag-and-drop, Film Room controls were built desktop-first).

### T3 — Printable/branded documents completion (spec §4.8 — program sheet DONE in S9, rest still open)
`PrintSessionSheet.tsx` exists for programs. Still needed: (a) Progress report PDF (e1RM/tonnage charts as inline SVG, PR feed, adherence % for a date range), (b) blank session sheet + PAR-Q intake sheet (the PAR-Q questions already exist in `lib/parq.ts` if that module is present, or `CoachingTab.tsx`'s screening dialog — reuse, don't re-author). Same sibling-route pattern as `PrintSessionSheet`/`TvWorkoutPage`.

### T4 — Progression engine completion (spec §4.14; core is BUILT in `lib/progression.ts`)
a. Policy editor: attach a `ProgressionPolicy` to a Program in the Builder.
b. Ghost values in SessionLoggerPage via `suggestNext` + `logsRepo.exerciseHistory`, reason line as tooltip.
c. Use the policy (not the heuristic) for duplicate-week auto-progression in the builder if not already consistent.

### T5 — Coaching message log completion (spec §4.19 — entity + tab BUILT in S9)
`CoachMessage`/`MessagesTab.tsx` exist. Still open: exportable branded HTML digest (reuse `companion/export.ts` brand-injection pattern), optional read-only "From your coach" section in the Companion export.

### T6 — Film Room + tracking polish (spec §4.16/4.16b — core + dual controls BUILT in S8)
a. **Manual QA with real phone footage** (portrait, 60fps, squat + press): verify skeleton alignment, sync-lock accuracy, rep-counter thresholds (debt #10) — tune `RepCounter` constants or add One-Euro smoothing in `lib/pose.ts` if jittery.
b. Per-rep results table + "copy to session notes"; PNG snapshot export of stage+annotations.
c. Reference-clip tracking + client-vs-reference angle deltas (the killer demo).
d. Register `/film-room` and the new S10 routes (`/team`, `/leads`, `/leaderboard`) in CommandPalette.

### T7 — Phase 9: Hardening & release (spec §8)
vite-plugin-pwa, error boundaries per route, **fix debt #6** (first-boot ConstraintError — verify S9's `main.tsx` getOrCreate + Shell's `.get()` split actually closed this; it looks fixed but hasn't had a dedicated regression check), code-split builder + film room + the new S10 routes (main bundle is ~820KB now — debt #8 keeps growing), reduced-motion pass, Lighthouse, cross-browser, `HOW-TO-OWN-IT.md`. Prune `sync-server/`'s committed `coachwright.db` before any distribution packaging (debt #19).

### Marketing track (parallel, non-code)
`BRANDING_PLAN.md` at repo root is the contract for all naming/copy: features are called **Film Room**, **Companion**, **Profit Planner**, **The Ledger**, **Studio Link**, **Team**, **Leads**, **Leaderboards**, **TV Workout**. `docs/SERVER_STRATEGY.md` §5 has monetization guidance worth mining for marketing copy (the "you'd be paying $X/mo elsewhere" framing, the Companion-footer referral loop).

## 5. Honesty ledger
Two contained `as any` at Dexie generic boundaries (documented in PROGRESS.md). Attention-queue is O(all logs) — acceptable until Phase 5. If you cut a corner, write it in PROGRESS.md "Known debts" — silent debt is the only unacceptable kind.

## 6. Definition of "session done"
Build green · tests green · PROGRESS.md table + session log updated · new conventions appended to §3 of this file · this file's task queue re-pointed at the true next task.
