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
--- S11 ---
src/app/AppRoot.tsx   Boots the app: theme + durable storage + exercise seed, THEN mounts the router
                      (previously `main.tsx` fired this fire-and-forget while mounting immediately — a
                      real race). `BootScreen.tsx` fills the gap with an animated `Logomark`.
src/app/brand/Logomark.tsx  The actual Coachwright mark (three ascending bars + accent dot). Use this,
                      not a hardcoded SVG, anywhere the brand mark appears. `public/favicon.svg` mirrors
                      it in static hex (can't use CSS vars in a standalone favicon file).
src/db/portability.ts  Client-package export/import (spec: data portability). `exportClientPackage(id)`,
                      `rekeyClientPackage` (pure, testable — fresh ULIDs + cross-reference remapping),
                      `importClientPackageText`, `exportStaffClientBundle`. Deliberately excludes
                      invoices/expenses/challenges (business-level, not the client's own history) — see
                      debt #26 if that scope ever needs to grow.
src/lib/csv.ts        Pure CSV parser + column-mapping guesser for competitor roster imports (TrueCoach,
                      Trainerize, etc. — no per-platform schema hard-coded, the coach maps columns once).
                      `features/clients/ImportCsvDialog.tsx` is the UI; `ClientsPage.tsx`'s "Import
                      clients" button detects JSON (client-package) vs CSV and routes to the right flow.
src/lib/videoEmbed.ts  `classifyVideoUrl`/`exerciseVideos` — YouTube/Vimeo/direct-file/link classification
                      for `Exercise.videoLinks[]`. `features/library/VideoViewer.tsx` is the in-app player.
src/lib/metricPresets.ts  Research-cited testing-battery presets (`presetsForGoal`), chips on `MetricsTab`.
src/features/settings/CloudCard.tsx  3-tier hosting UI: local (free) / self-hosted (free) / managed ($15/mo,
                      `Trainer.cloudTier`/`managedLicenseKey`). `docs/SERVER_STRATEGY.md` does NOT match
                      this yet — see T9 below, do not treat the doc as authoritative until it's rewritten.
src/features/filmroom/tracker.ts  REWRITTEN (S11, later in the session — see "S11, continued: dual
                      tracking" below) from a module-level singleton to `createPoseTracker(): PoseTracker`,
                      a FACTORY. The bare `initTracker`/`detectFrame`/`resetTrackerTimeline`/`disposeTracker`
                      exports described in older notes below no longer exist — if you're looking for them,
                      this is why; use `const tracker = createPoseTracker()` then `tracker.init()`/
                      `.detectFrame(video)`/`.resetTimeline()`/`.dispose()` instead. Reason: Film Room can
                      now track the client AND reference clip at the same time (`trackTarget === 'both'`),
                      and each needs its OWN instance — MediaPipe VIDEO mode is stateful (uses the previous
                      call as a prior for the next), so sharing one instance across two unrelated clips
                      would corrupt its tracking, not just be slower. Every other behavior is unchanged:
                      `.resetTimeline()` must still be called whenever the bound `<video>`'s clip changes
                      (the timestamp guard is monotonic and per-instance, doesn't know a new clip started at
                      t≈0 otherwise); `.detectFrame()`'s `PoseFrame.error` flag still distinguishes a thrown
                      exception from an ordinary "no person in frame" miss; `.dispose()` still MUST be
                      called whenever a tracker is discarded (turning tracking off, or the 12-consecutive-
                      error auto-recovery path) — skipping it means the next "start" could hand back state
                      from a wedged instance instead of a fresh one.
src/lib/pose.ts  `replayHistory(counter, history, joint)` (S11) — call this exactly once, the moment a
                      focus joint is first identified, with every frame buffered since tracking started.
                      Without it, any rep completed during the RepCounter/FocusJointPicker warm-up window
                      (often the very first rep) is silently dropped — angle samples for an as-yet-unknown
                      focus joint were never pushed anywhere before this existed. See
                      `FilmRoomPage.tsx`'s `angleBuffer`/`hasReplayed` refs for the call site.
                      `FocusJointPicker` (S11) now also requires ≥60% visibility across all frames pushed
                      before a joint can win `best()` — pure range-of-motion alone lets equipment-occluded
                      noise (a limb glimpsed through a gap swings wildly, looks like big "motion") outrank
                      a genuinely well-tracked joint. Don't remove this gate without a replacement — it's
                      the fix for a real reported bug ("equipment blocking the body messes up tracking").
src/lib/filmRoomSummary.ts  `buildFilmRoomSummary` (plain text) / `buildFilmRoomStatsHtml` (escaped HTML
                      for a print window) (S11) — the natural-language client-facing summary generator for
                      Film Room notes/stats. Film Room's own state (reps, notes) is never persisted, so
                      the HTML path is opened via `window.open('', ...) + document.write(...)`, NOT a
                      normal Dexie-backed sibling print route — don't "fix" this into a route without also
                      solving where the underlying data would live first.
src/features/filmroom/FilmRoomPage.tsx  `trackTarget: 'A' | 'B'` (S11) picks which clip the tracker binds
                      to (client or reference, one at a time — NOT simultaneous dual-tracking, that's a
                      bigger future step, see spec §4.16b / debt #12). The sync-drift-correction effect
                      (a `timeupdate` listener re-snapping B to A's locked offset) is separate from
                      `alignB()` (which only fires on transport actions) — keep both, they cover different
                      failure modes. Bar-path point collection is throttled (`lastBarPathPushMs`, ~50ms) —
                      don't remove the throttle, pushing React state every tracked frame measurably
                      degraded both the tracking loop and video playback.
src/features/calendar/CalendarPage.tsx  Now has a real month-grid view (`MonthGrid`) behind a Month/List
                      toggle (S11) — the original chronological-agenda-list view is still there as "List,"
                      not removed. `OccurrenceCard` was extracted so both views share the same appointment
                      card (reschedule/skip/delete) rather than duplicating that JSX.
sync-server/server.ts  Now has messages/reminders/per-coach-keys (S11) alongside the original device
                      sync endpoints. `requireApiKey` accepts EITHER the legacy shared `API_KEY` (self-
                      hosted single-tenant, no cross-coach scoping) OR a per-coach key from `api_keys`
                      (sets `req.coachId`, enforced via `assertOwnsCoach` on every coach-scoped route).
                      `requireAdminKey` (separate `ADMIN_KEY` env var) gates `/keys/register`+`/revoke` —
                      operator-only, no payment webhook wired to it yet (manual provisioning, by design
                      for now). Reminders are poll-based (`GET /reminders/due` marks fetched rows sent)
                      — there is no push infra here, don't imply otherwise in UI copy.
src/features/sync/messageRelay.ts  Coach-side client for the message relay. `pushRelayMessage`/
                      `pullRelayMessages` reuse `lib/sync.ts`'s existing ECDH+AES-GCM pairing crypto
                      (same `sealSyncPacket`/`openSyncPacket` used for device sync) — a message is just
                      a `{content}` payload sealed with the same per-device shared key. Requires the
                      client to already be a paired `Device` (`devicesRepo.forClient(clientId)`) and
                      `Trainer.syncServerUrl` set. `MessagesTab.tsx`'s `LiveMessagePanel` is the UI.
docs/SERVER_STRATEGY.md  §2.5 (S11) is now the authoritative section on cloud hosting — read it before
                      touching anything relay/messaging/reminder-related. Supersedes older framing
                      elsewhere in the doc that calls managed hosting speculative.
--- S11, continued: real Companion sync + coach-side ingestion (see docs/CLIENT_APP_STRATEGY.md §7) ---
src/features/sync/syncApi.ts  `remapClientId()` (S11, exported, unit-tested in `syncApi.test.ts`) — the
                      ONE fix that makes Companion's synced data land under the right `Client` row,
                      regardless of whether it arrived via `doCloudSync`'s network pull or `DeviceRow`'s
                      file import, because `applyPacket()` calls it once for either path. Only rewrites
                      `clientId` for `device.role === 'client'` rows WITH a `device.clientId` link set — a
                      coach's own second device already sends correct ids and must never be touched by
                      this. If you add a new client-side app or transport later, route it through
                      `applyPacket` too rather than writing a parallel merge path — that's the whole point
                      of putting the remap here instead of in each caller.
--- S11, continued: branding pass round 2 (variant family + real bug fixes) ---
src/app/brand/Logomark.tsx  Full variant family now: `Logomark` (badge), `Wordmark`, `MonogramCW`,
                      `HorizontalLockup`, `Lockup`, plus `BrandMark` (dispatcher) + `BRAND_MARK_VARIANTS`
                      (registry, drives the Settings picker). `Logomark`'s badge auto-swaps ink/porcelain
                      tone via Tailwind `dark:` by default — pass `tone="dark"|"light"` ONLY for a fixed-
                      background context (printed paper, a raw HTML file outside dark: scoping) that
                      should never invert regardless of app theme. `Trainer.sidebarLogoVariant` (types.ts)
                      picks which variant `Shell.tsx` renders; Settings → `BrandMarkCard` is the picker UI.
src/features/programs/builder/DayCanvas.tsx  Fixed a real bug (S11): never call a state-updater
                      (`updateDay`/`addBlock`) and then read the SAME prop synchronously afterward
                      expecting it to reflect the update — it won't until next render. If you see a click
                      silently do nothing anywhere in this codebase, check for this pattern before
                      assuming it's something else (see PROGRESS.md debt #28).
src/features/filmroom/tracker.ts  `initTracker()` now tries GPU delegate then falls back to CPU (S11) —
                      previously GPU-only with no fallback, a real risk on hardware without WebGL2 (this
                      feature explicitly targets "low-tier laptops," per this file's own header comment).
                      Not yet tested on hardware that actually lacks GPU accel — see PROGRESS.md debt #29.
--- S11, continued: branding pass round 1 ---
src/app/brand/Logomark.tsx  THE brand mark, source of truth for the SVG path (a barbell collar seen
                      end-on; its negative space resolves into a hard "C"). `public/favicon.svg` and
                      `electron/splash.html` both hand-copy this exact path — if the mark ever changes,
                      update all three, plus the standalone brand-mark reference sheet Caleb owns
                      (`Coachwright Logo.dc.html`, not part of the repo). Display font is **Inter Tight**
                      (changed from Archivo, S11) — `font-display` Tailwind class, do not hardcode either
                      font name in a component. Motion keyframes (`cw-wipe`/`cw-word`/`cw-fade`/`cw-spin`/
                      `cw-bar`) live in `tailwind.config.js`, one easing curve everywhere
                      (`cubic-bezier(0.2,0,0,1)`, sharp, no bounce) — see spec §7.4b.
electron/splash.html + electron/main.ts  The splash was DEAD CODE before S11 (the `splashWindow` variable
                      existed but was never instantiated — `mainWindow` always showed immediately with
                      `show: true`). Now genuinely wired: `createWindow()` shows the splash first,
                      `mainWindow` starts `show: false` and swaps in on `ready-to-show`. If you touch
                      Electron window creation, keep this handoff intact — don't silently reintroduce the
                      immediate-show behavior.
--- S11, continued: advanced tracking, two-phase boot, cloud capability gating ---
src/lib/pose.ts       `LandmarkSmoother` (S11) — smooths raw landmark x/y positions (not angles; `RepCounter`
                      already had angle smoothing via `OneEuroFilter`, this closes the position-level gap).
                      Below `LOW_CONF_VISIBILITY` (0.7) it blends the filtered reading toward held history
                      proportional to confidence, down to the hard `MIN_VISIBILITY` gate (0.5) where nothing
                      is trusted at all. Call `.smooth(landmarks, timestampMs)` once per frame BEFORE
                      `frameAngles`/`barPathPoint` — `FilmRoomPage.tsx`'s `onFrame` is the call site, and
                      `landmarkSmoother.current.reset()` belongs in `resetAnalysis()` alongside the other
                      per-clip state. `OneEuroFilter`'s constructor uses explicit field assignment, not
                      parameter-property shorthand — this project's `erasableSyntaxOnly` tsconfig flag
                      rejects `constructor(private x = 1)` syntax (TS1294).
src/app/AppRoot.tsx   Rewritten (S11) into an explicit `'progress' | 'reveal' | 'done'` stage machine —
                      `BootScreen`'s determinate bar (real progress: 10/40/55/70/100% tied to actual boot
                      steps) now genuinely plays BEFORE the wipe-build mark/wordmark/tagline reveal, not
                      simultaneously or in whatever order happened to fall out of one flat component.
                      `MIN_PROGRESS_PHASE_MS`/`REVEAL_PHASE_MS`/`FADE_OUT_MS` control pacing — if you need
                      to visually verify boot-sequence changes, temporarily multiply these (this session
                      used 4000/4000) rather than trying to screenshot the real ~2.2s sequence, which is
                      faster than this environment's screenshot round-trip; DOM inspection via `read_page`
                      immediately after a reload is the reliable way to catch the `progressbar` element
                      before it's replaced by the reveal content. Revert the constants before finishing.
src/lib/cloudCapability.ts  NEW (S11) — `cloudCapabilities(trainer)` is THE single source of truth for what
                      a coach's hosting tier (`Trainer.cloudTier`) + a saved `syncServerUrl` unlocks
                      (`sync`/`messaging`/`reminders` booleans + `reasonUnavailable`). ANY feature gated on
                      cloud/relay availability must call this instead of inline `!!trainer.syncServerUrl` —
                      that pattern already caused one real bug this session (see `SyncCenterPage.tsx` below).
                      Critically: `tier === 'local'` short-circuits and ignores a leftover `syncServerUrl`
                      entirely (a coach can switch tiers back to local without also clearing the URL field)
                      — don't "simplify" this by checking `syncServerUrl` alone anywhere.
src/features/clients/MessagesTab.tsx  `LiveMessagePanel` (S11) now calls `cloudCapabilities()` and renders
                      one of two explanatory `Card` states (cloud not configured vs. this client not yet
                      paired) instead of silently returning `null` when the Live panel isn't available.
src/features/sync/SyncCenterPage.tsx  Fixed a real inconsistency (S11): `doCloudSync`/the Cloud Sync button
                      used to check only `trainer?.syncServerUrl`, never `cloudTier` — a coach who saved a
                      URL under self-hosted then switched back to fully local would still have a working
                      Cloud Sync button, contradicting "fully local = nothing leaves this device." Now gated
                      on `cloudCapabilities(trainer).sync`; the Cloud Sync Server config card also shows an
                      inline hint when tier is local explaining a saved URL isn't in effect yet. `trainer`
                      inside `DeviceRow`'s nested `doCloudSync`/inside the outer component's JSX needed
                      separate `cap = cloudCapabilities(trainer)` bindings per scope — TS doesn't narrow a
                      captured variable across a nested function declaration boundary, same pattern already
                      present in `MessagesTab.tsx`'s `send()`/`checkForReplies()`.
src/features/sync/messageRelay.ts  `relayConfigured()` REMOVED (S11) — it was `!!trainer?.syncServerUrl`,
                      now redundant with `cloudCapabilities().messaging`. If you're looking for it, it's
                      gone on purpose; use `cloudCapabilities()` instead.
src/features/settings/Guide.tsx  Updated (S11) with a new "Calendar & scheduling" section, a new "Cloud
                      sync — optional, in three flavors" section (mirrors `CloudCard.tsx`'s tier copy), CSV
                      import + Progress Report mentions, and expanded Film Room/Privacy sections. Whenever
                      you ship a feature or change what a claim like "no server, ever" actually means,
                      update this file in the same session — it drifted noticeably behind actual behavior
                      before this pass (the Privacy section still claimed unconditional no-server after the
                      3-tier cloud model had already shipped).
.claude/launch.json (repo root)  Has TWO configs now: `strongsuit-preview` (`vite preview`, port 4173 —
                      serves the static `dist/` build, source edits do NOT hot-reload) and `strongsuit-dev`
                      (`vite --port 5174`, added S11 — real HMR dev server). Use `strongsuit-dev` for any
                      live-verification that depends on seeing a source-code change reflected; the
                      pre-existing `strongsuit-preview` config will silently show stale bundled code.
--- S11, continued: real simultaneous dual-clip tracking ---
src/features/filmroom/tracker.ts  Factory-based now (`createPoseTracker()`) — see the entry higher up in
                      this map for the full why. Each call returns an independent `PoseTracker`; Film Room
                      creates up to two (one per clip) when `trackTarget === 'both'`.
src/features/filmroom/FilmRoomPage.tsx  `trackTarget` is now `'A' | 'B' | 'both'` — 'both' runs two
                      complete, independent analysis pipelines AT THE SAME TIME, not one after another.
                      The entire per-clip pipeline (rep counter, focus-joint picker, landmark smoother,
                      angle buffer + replay, bar-path collection, the `requestVideoFrameCallback` detection
                      loop) was extracted into `useClipTracking()`, a hook called exactly twice — `trackA`
                      and `trackB` — each bound to its own `PoseTracker` ref (`trackerARef`/`trackerBRef`,
                      created/init'd/disposed together in `toggleTracking`). If you're adding a new stat or
                      behavior to the tracking pipeline, add it inside `useClipTracking`, not the component
                      body — it now applies automatically to both clips. `primary = trackTarget === 'B' ?
                      trackB : trackA` is what single-target UI (notes, the classic Movement Analysis card)
                      reads from; don't reintroduce bare `pose`/`angles`/`reps`/etc. component state, they're
                      gone on purpose. `MovementAnalysisCard` and `ComparisonCard` (extracted components,
                      same file) render the per-clip stats and the cross-clip breakdown respectively.
src/lib/filmCompare.ts  NEW (S11) — pure comparison math, no MediaPipe/DOM. `compareReps(repsA, repsB)`
                      matches by ordinal (rep 3 vs rep 3), works even without sync-lock. `compareAngles(
                      samplesA, samplesB, offsetMs)` matches AngleSample histories in lockstep using the
                      SAME offset `syncOffset`/`effectiveOffset` already computes (seconds → convert to ms
                      before calling) — only call this once clips are actually time-aligned (`effectiveOffset
                      !== null`); comparing un-aligned timelines and calling the result "deviation" would be
                      dishonest. Both are unit-tested (`filmCompare.test.ts`, 7 tests).
```
--- NEW SIBLING PROJECT (S11): strongsuit-v0.1/companion-app/ — a second app, for clients, not coaches ---
**Read `docs/CLIENT_APP_STRATEGY.md` (in `strongsuit-v0.1/strongsuit/docs/`, same as the other strategy
docs) before touching this project — it has the full architecture decision, the exact client↔coach sync
flow, and the Personal Cloud pricing already worked out. Don't re-derive any of that from scratch.**

This is a SEPARATE Vite+React+Dexie project, sibling to `strongsuit/` and `sync-server/`, not a route
inside the coach app — different install target, different Dexie DB name, different `npm install`/`npm
run dev` (run everything from `strongsuit-v0.1/companion-app/`, same "wrong directory half-works" trap as
the coach app — see §3's `ALWAYS run npm/vitest/build from strongsuit-v0.1/strongsuit/` rule, which now
has a companion-app equivalent). `.claude/launch.json` (repo root) has a `companion-app-dev` config, port
5175.
```
companion-app/src/db/types.ts    CompanionProfile (singleton, no login — the profile IS the account, now
                      also holds `identity?: SyncIdentity`, lazily created), CoachLink (present only once
                      paired — `pending` should always be `false` by the time it's saved now, real pairing
                      requires the safety-number step to complete first), PersonalWorkout/PersonalMetric
                      (the standalone log), CoachMessage. Same repo-pattern discipline as the coach app
                      (`db/repo.ts`, never touch Dexie directly from components).
companion-app/src/lib/sync.ts    PORTED VERBATIM from the coach app's `lib/sync.ts` (S11) — same ECDH
                      P-256 + HKDF-SHA256 + AES-GCM, same wire format, same `PairingCode`/`SyncPacket`
                      shapes. Duplicated, not imported — the two apps share no package. **If the coach
                      app's crypto ever changes, this file must change identically or the two apps stop
                      interoperating.** No test file (pure Web Crypto API glue, same as the coach app's own
                      copy has none either — the coach app's IS covered by other tests indirectly through
                      `syncApi.ts`/`messageRelay.ts` usage; Companion's was verified live instead, see
                      PROGRESS.md debt #52).
companion-app/src/features/sync/PairingFlow.tsx  The REAL handshake (S11) — generates this device's
                      identity via `profileRepo.getOrCreateIdentity()`, shows its own pairing code, accepts
                      the coach's code, derives the shared key, and requires a safety-number confirmation
                      (matches the coach app's `PairDialog` UX almost exactly) before saving a real
                      `CoachLink` with a relay URL/API key the user enters (the pairing code itself carries
                      no server address — see strategy doc §3.5). Used from both `Onboarding.tsx` and
                      `CoachCard.tsx` (a solo client can pair with a coach later from Settings).
companion-app/src/features/sync/companionSyncApi.ts  The real transport (S11). `buildOutboundLogsPacket`
                      is the ONE payload-building step (shapes logged workouts/metrics into the coach app's
                      own `SessionLog`/`Metric` field names, tagged `source: 'companion-import'`) shared by
                      both ways the packet can travel: `pushLogsToCoach` POSTs it to `/sync/push` (self-
                      hosted/managed coaches — needs `CoachLink.relayUrl`), `exportLogsFile` hands back the
                      same sealed text for a file download instead (fully-local coaches — drops onto the
                      coach's existing "Local Import" button, no relay needed at all). The placeholder
                      `clientId` (this device's own `deviceId` — Companion has no way to know the coach's
                      real `Client.id`) is remapped on the COACH side now, not here — see `syncApi.ts`'s
                      `remapClientId()` in the coach app, T12 is done. `pushMessageToCoach`/
                      `pullMessagesFromCoach` mirror `messageRelay.ts`'s request shapes exactly
                      (`direction: 'client'`) — fully interoperable with the coach app's shipped code
                      TODAY, no coach-side change needed. `syncNow()` is the network "Sync now" button's one
                      call (push then pull) — only shown in the UI when `CoachLink.relayUrl` is set.
companion-app/src/features/settings/CoachCard.tsx  Real pairing entry point (for solo clients adding a
                      coach later), a message thread (send + received, both real), and TIER-AWARE sync
                      actions (S11): "Sync now" only renders when `coachLink.relayUrl` is set; "Export
                      packet" always renders, and is the primary action when it isn't. Don't add a "Sync
                      now" fallback that tries the network call anyway when there's no URL — the honest UI
                      for a fully-local coach IS the export button, not a button that will just error.
companion-app/src/features/settings/PersonalCloudCard.tsx  The $3.99/mo·$29/yr pricing UI from the
                      strategy doc §4, "Coming soon" and disabled — no card entry, no fake purchase flow.
                      When this gets wired for real, it's a Stripe Payment Link (or equivalent) the same
                      bring-your-own-account way the coach app's managed tier already works — see
                      `SERVER_STRATEGY.md` §3, not a payment processor built into this app. Unrelated to
                      coach-pairing sync above — see strategy doc §3.5 for why the two must stay separate
                      in any future UI copy.
companion-app/public/manifest.webmanifest + public/sw.js  Hand-rolled PWA plumbing (S11) — NOT
                      vite-plugin-pwa, which caps its Vite peer dep at ^6 and this project is on Vite 8
                      (real `ERESOLVE` conflict when installed, not a preference — see PROGRESS.md debt
                      #49). `sw.js` is a small cache-first app-shell worker, no Workbox. If
                      `vite-plugin-pwa` ships Vite 8 support later, that's a reasonable thing to switch to
                      (and to retroactively add to the COACH app too — its own PWA debt, #4, has been open
                      longer).
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
- **Tailwind tokens keep recurring as a bug class (S10 found 5 files, S11 found 10 more + 2 undefined animation/shadow classes).** This is not a one-time cleanup — it will keep happening because each session writes classes from training-data memory, not from reading `tailwind.config.js`. Before trusting ANY color/shadow/animation class you didn't just grep for, check `tailwind.config.js` + `src/index.css`. If you have time, adding `eslint-plugin-tailwindcss` (Phase 9 candidate) would catch this at lint time instead of by manual grep-hunting every session — flag it to the user if you're not going to do it yourself.
- **Verify AI/on-device features by actually running them, not just reading the code (S11).** Film Room's tracker had a real bug (timeline not reset on clip replacement) that code review alone could plausibly miss/over-think; it was found by scripting a synthetic canvas-recorded video into the file input via `DataTransfer` in the browser tool and watching console+network output. When a bug report is vague ("X is broken") and you can't get a real test asset (e.g. no sample workout video), synthesize a minimal one that exercises the actual code path rather than only re-reading source.
- **A file existing doesn't mean it's wired up (S11).** `electron/splash.html` looked like a real, finished feature — full CSS, real markup — but `splashWindow` was declared in `main.ts` and never once instantiated, so it never showed. Before "fixing the branding on X," grep for where X is actually used/rendered, not just where it's defined; a beautifully-styled dead file is a common trap.
- **Brand mark source of truth:** `src/app/brand/Logomark.tsx`'s SVG path is hand-copied into `public/favicon.svg` and `electron/splash.html` (three separate files, kept in sync manually — there's no build step that shares them). If the mark ever changes, all three need the same edit, or the app, browser tab, and native splash will visibly disagree.
- **Never build a fixed-tone color into anything that sits on a theme-toggling background (S11).** The brand mark's badge was hardcoded dark (ink bg) everywhere, including on `bg-surface2`-class backgrounds that themselves flip to a near-identical dark color in dark mode — the mark would have nearly vanished. Any "always this exact hex" color choice needs an explicit check against BOTH themes before shipping, not just light mode (which is what gets eyeballed by default).
- **The browser-preview tool's `computer.left_click` coordinates don't reliably map 1:1 to page CSS pixels when the viewport and the returned screenshot are different resolutions (S11).** Several Film Room/mobile-drawer interactions "silently failed" via `computer.left_click` and worked instantly via a direct DOM `.click()` or a `dispatchEvent` at coordinates computed from the element's own `getBoundingClientRect()`. When a click via the computer tool appears to do nothing, retry with a direct JS `.click()` before concluding the app is broken — rule out the tool before blaming the code.
- **React's `onChange` on `<input type=range|text>` listens for the native `input` event, not `change`; and dispatching two synthetic events back-to-back in the same synchronous script gives React no tick to flush state between them (S11).** Both bit this session while testing Film Room's sync-lock and the annotation tools — real user interaction always has natural delay between actions; synthetic test scripts need an explicit `await new Promise(r => setTimeout(r, ~150))` between dispatched events to be representative.
- **After building a feature, click through its actual first-use path once, live, before calling it done (S11).** `DayCanvas.tsx`'s empty-day "Add Exercise" button had shipped fully broken (a stale-closure bug, `if (!targetBlockId) return` silently no-op'ing) — the single most common first action in the entire Program Builder — and nothing caught it because nobody had actually clicked "new day → add first exercise" and watched what happened. `tsc`/`vitest`/`build` all passing does not mean a feature works; only driving it does.
- **When a reference design specifies an exact layout (an HTML mockup, a Figma export, prose with measurements), reproduce its actual structure — don't invent your own arrangement that's "in the spirit of it" (S11).** `Lockup`'s first version stacked the mark on top of the wordmark, centered — the reference sheet's actual "Primary Lockup" is a horizontal row with the icon on the left. Read the reference's own markup/measurements and match them (this session derived `Lockup`'s gap/wordmark/tagline ratios directly from the guide's own 132/40/59/13px numbers), rather than approximating from memory of "generally how a logo lockup looks."
- **A cached singleton (a lazily-created model/connection/tracker instance) needs an explicit dispose-and-recreate path wired to whatever the user's "reset" action is, or that action does nothing (S11).** `initTracker()`'s `if (landmarker) return landmarker` is correct for the common case, but `toggleTracking`'s off-branch not calling `disposeTracker()` meant the natural "turn it off and on again" recovery gesture silently returned the same (possibly broken) cached instance. When you add a cache-if-exists pattern, immediately ask "what's the user's path to force a fresh one, and is it actually wired to the dispose call."
- **Test sustained/ongoing behavior, not just the instant after an action (S11).** Film Room's sync-lock was verified (in an earlier session) by checking alignment right after a seek/step — it looked correct. The actual complaint ("videos stop playing together") only shows up during *continuous playback*, seconds after the last transport action, when two independently-decoding `<video>` elements drift apart with nothing re-correcting them. When a feature involves two things staying in sync over time (playback, polling, a cache), test it a few seconds into steady-state, not just at the moment of the triggering action.
- **Before building a requested feature, grep for whether it already exists (S11).** Was about to build a client "progress report" stats sheet from scratch (reusing `lib/analytics.ts`'s PR/tonnage functions) when a search turned up `PrintProgressReport.tsx` already built, already linked from `ClientDetailPage.tsx`, and more complete than the draft in progress. This project's history includes multiple untracked sessions (S9, and apparently at least one more between S10 and this one) whose work isn't in the session log — don't assume the feature list in PROGRESS.md's checklist is exhaustive; grep the actual codebase for a route/component name before writing a new one.
- **When testing a low-pass filter (One-Euro or similar), assert what it's actually supposed to do, not an idealized version of it (S11).** First test drafts for `LandmarkSmoother` asserted the filtered output was closer to a MOVING target's current value than the raw sample (wrong — any low-pass filter has lag on a moving trend by design) and that it converged to a new position within a single sample after an occlusion blip (wrong — that's the opposite of what smoothing means). Fixed by testing jitter reduction around a STATIONARY held position, and multi-sample convergence after a genuine change. If a filter test needs the implementation to get "faster" to pass, the test is probably asserting something a correct filter shouldn't do.
- **A ~2-second UI sequence (like a two-phase boot screen) is often faster than a screenshot tool's round-trip (S11).** `computer.screenshot` repeatedly returned after the sequence had already finished, or timed out outright. `read_page`/`javascript_tool` calls are much faster and can catch a specific DOM state (e.g. a `[role=progressbar]` element present, then absent) immediately after triggering a reload — use that to verify ordering/sequencing bugs instead of chasing a screenshot. If you need actual pixels, temporarily stretch the relevant timing constants (documented, then reverted) so the window is wide enough for a screenshot to land inside it.
- **Check `.claude/launch.json` for which config `preview_start` actually picked before trusting a live-verification (S11).** This repo has both a `vite preview` (static, no HMR) and now a `vite --port 5174` dev config; the tool defaulted to the static one until a dev config was added, so an early "verification" was actually looking at a stale pre-built bundle, not the edited source. If a source edit doesn't show up after reload, confirm which server is actually running before assuming the edit is wrong.
- **To verify E2EE/crypto code for real, run the actual server and decrypt with an independently-derived key — don't just trust that a function returned without throwing (S11).** Verifying Companion's pairing handshake meant: (1) generating a synthetic "coach" keypair via raw `crypto.subtle` calls in the browser console (no app code), (2) independently recomputing the safety number from both public keys and confirming it matched what the app displayed, (3) actually starting `sync-server` locally and pushing/pulling against it, and (4) decrypting the server's stored ciphertext using the synthetic coach's private key to confirm the exact original data came back. Any one of these steps skipped would have left a real risk (e.g., a shared key that derives differently on each side, or a payload shape that doesn't survive the round trip) unverified. `read_network_requests` + direct `curl` against the server's own storage is what makes step 3–4 possible — check the actual bytes that landed, don't just check that the fetch didn't throw.
- **When two separate apps must speak the same wire protocol, copy the crypto/wire-format file verbatim rather than re-deriving it from memory, and check the counterpart's existing endpoint code for the exact request shape it expects before writing the caller (S11).** Companion's `lib/sync.ts` is a byte-for-byte duplicate of the coach app's; `companionSyncApi.ts`'s message push/pull was written by reading `messageRelay.ts` and `sync-server/server.ts` first, matching field names (`direction`, `clientId`, `for`) exactly — this is why it interoperates with zero coach-side changes, rather than needing a second pass to reconcile two independently-invented shapes.

- **(S13) Relay payload keying: `sync_payloads` is keyed `(id, type)`, and the meaning of `id` differs by direction.** A client device pushes under its OWN device id (`type: 'client'`); a coach pushes the packet ADDRESSED TO a device under THAT device's id (`type: 'coach'`). Companion pulls `/sync/pull/coach/{its own deviceId}`; the coach pulls `/sync/pull/client/{device.id}`. Don't "simplify" this to one id-keying rule — the asymmetry is what lets one client device hold both directions without colliding, and `server.ts` has an in-place migration from the old single-column PK (which let coach pushes for different clients overwrite each other — a real bug fixed in S13).
- **(S13) One message id across every transport is a hard invariant.** A message row keeps the SAME id locally, on the relay (`message_relay.id`), and inside sync packets (`messages` table rows). Coach side sends its local `CoachMessage.id` into `pushRelayMessage`; pull paths use `mergeUpsert`/has-then-put instead of `create` so a message arriving twice (relay today, packet file next week) lands on one row. If you add any new message path, thread the id through — invent a fresh id at any hop and coaches get duplicate bubbles.
- **(S13) Each side only ships messages IT authored in outbound sync packets** (Companion sends only `to-coach` rows; the coach packet's `messages` merge only keeps `direction: 'outbound'` rows). This is what prevents echo loops without any tombstone bookkeeping. Keep that filter if you touch packet building/merging.
- **(S13) Electron IPC: `ipcRenderer.invoke` pairs ONLY with `ipcMain.handle`; `ipcRenderer.send` pairs with `ipcMain.on`.** Mixing them fails silently from the renderer's side (the main-process listener just never fires). This exact mismatch shipped in S9's LAN sync response path and sat unnoticed until S13 because nothing ever called the endpoint. When adding IPC, grep the other side's registration before assuming the channel works — and prefer request-scoped correlation ids (see `main.ts`'s `/sync/push`) over `ipcMain.once` for anything concurrent.
- **(S13, round 2) Battery doctrine for Companion is a hard rule: sync is event-driven, never timer-driven.** `lib/autoSync.ts` reacts to app-open/`visibilitychange`/`online` with a 15-minute throttle and contains deliberately zero `setInterval`/persistent sockets — a hidden app does no work. Closed-app notifications are Web Push's job (`lib/push.ts`, `sw.js`, relay `/push/*`), metadata-only payloads. If a future feature wants a background timer loop, it's wrong by doctrine — find the event, or it belongs in the Capacitor wrap (`CLIENT_APP_STRATEGY.md` §9).
- **(S13, round 2) Pairing codes may carry transport hints (`relay`/`relayKey`, optional fields on `PairingCode`)** — a coach's QR configures the client's sync in one scan. The hints are conveniences, never identity; the ECDH key + safety number remain the only authentication. If you touch `PairingCode`, edit BOTH `lib/sync.ts` copies identically (coach + companion), same rule as the rest of that file.
- **(S13, round 2) QR scanning uses the platform `BarcodeDetector` only — no decoding library.** Where it doesn't exist (iOS Safari, desktop Windows Chrome) `qrScanSupported()` hides the scan button and the paste path is the fallback; verified live that desktop hides it. Don't add jsQR/zxing without a real need — bundle weight is a feature here.
- **(S13, round 2) The browser pane hard-denies `Notification.requestPermission()`** — a push/notification flow can only be verified up to the graceful-denial branch in this environment; the grant→delivery leg needs a real device (debt #57). Also: pane click-coordinate scaling misfired again this round (an Unpair button two `computer` clicks missed, direct `.click()` worked) — the S11 lesson about retrying UI interactions through a reliable path before suspecting the app still applies.
- **(S13) To live-verify a transport whose real counterpart can't run in the session (e.g. the Electron LAN endpoint), stand up a stub that speaks the endpoint's exact request/response contract** (same route, same body fields, same response shape — `scratchpad` stub, not committed) and drive the REAL client UI against it. That's how `syncOverLan` was verified without a two-device setup; the remaining risk (the real Electron loop) is then explicitly scoped to T2's on-machine pass instead of silently untested.

- **(S14) Any check-then-insert against IndexedDB must be single-flighted AND tolerate losing the race.** `singleFlight()` (in both apps' `lib/core.ts`) coalesces concurrent callers; a `catch` that re-reads and adopts the winner's row covers the cross-tab case single-flight can't, because IndexedDB is shared between tabs. This bug class cost this project two separate "the app is broken on first launch" defects (coach: frozen boot screen; Companion: blank page) and was invisible on every launch after the first, because the row exists by then. **If you add a `getOrCreate`-shaped function, it needs both halves.**
- **(S14) Any boot-time async chain needs a `.catch` that renders something.** Both apps previously had a bare `.then()`; a rejection meant an infinite splash (coach) or `return null` forever (Companion), with no message and no way out. A boot path should always terminate in either the app or an error screen with a Retry — never in a spinner.
- **(S14) A `prefers-reduced-motion` block that only collapses `animation-duration` is not a reduced-motion pass.** It leaves infinite animations looping thousands of times a second (a busy blur, worse than the original motion) and leaves delays intact, so `animation-fill-mode: both` content stays invisible for its full delay. Cap `animation-iteration-count`, zero the delays, and decide deliberately what should still move (this app keeps a slowed spinner, because a frozen one reads as "hung").
- **(S14) Don't serialise a Tailwind-classed SVG to rasterise it.** The Film Room overlay colours strokes with utility classes backed by CSS custom properties; a standalone serialised SVG carries no stylesheet and renders with every stroke missing. Redraw from the same source data with the canvas 2D API instead (`filmroom/snapshot.ts`).
- **(S14) Reminder relay keying is NOT the same as message relay keying.** Reminders are keyed by the client's **device** id (`Device.id`, which pairing sets to the client's own `deviceId`) because that is what Companion polls `/reminders/due` with; messages are keyed by the coach's internal `Client.id`. Both are correct for their own endpoint. Don't "harmonise" one to the other without reading both sides.
- **(S14) The stated premise of a queued task can be wrong — check it before building.** T8/T1 said the HTML export "already has" pairing keys from the QR flow; `export.ts` injects data and no keys at all. Building on the stated premise would have meant embedding a private key in an emailed file. When a task's justification doesn't survive contact with the code, say so and record the decision (debt #59) rather than either implementing it anyway or silently skipping it.
- **(S14) An offline-first artifact with a CDN `<script>` is broken even though it looks fine.** `companion/template.html` pulled `html5-qrcode` from unpkg while promising to work with no connection — and leaked to that CDN every time a client opened their own workout. Grep any standalone export for `https://` before believing it's self-contained.
- **(S14) A GUI you have never launched is not verified.** The very first real Electron launch immediately surfaced a splash screen that had never worked (`splash.html` loaded from `dist-electron/`, where `tsc` never copies non-TS files). If you touch `electron/`, run it — `CW_SMOKE_TEST`-style temporary instrumentation plus `did-finish-load` is enough to assert on menus, bounds and IPC without a human watching the window. **Wait for `did-finish-load` plus the app's own boot, not a fixed delay** — the renderer is still loading several seconds in, and `executeJavaScript` simply never settles until it isn't.

## 4. YOUR TASK QUEUE (in order — do not reorder; spec § refs are the contract)

> ## ⚠️ READ THIS FIRST — S14 (2026-07-26) emptied this queue.
>
> Every task below is now DONE or explicitly declined with reasons. Phase 9 is
> complete; all nine phases are complete. **Do not start at T8 and work down —
> most of it is already built.** The real remaining work is short:
>
> **1. T2 — real-hardware passes. This is the only true blocker to shipping, and no AI session can do it.**
>   - `npm run build:electron` → NSIS installer, then install and run it. (The
>     Electron app now has had its first real GUI launch — S14 — so the dev path
>     works; the *packaged* path is still unproven. Debt #18.)
>   - Android via Capacitor, following `docs/ANDROID_STRATEGY.md`. Never built. (Debt #17.)
>   - A two-device LAN sync pass between the desktop app and Companion. (Debt #54.)
>   - One Web Push delivery on a real device. (Debt #57.)
>   - Companion Film Room against real footage on a real phone — the pipeline is
>     verified but rep counting on a human, and phone performance, are not. (Debt #61.)
>
> **2. Debt #58 — Lighthouse + a cross-browser pass.** Deliberately not run in
>    S14 rather than reporting a single-engine result as "cross-browser".
>
> **3. Decide the price.** `PRODUCT_OVERVIEW.md` still flags the unresolved
>    $59–99 range vs. the pitch deck's settled $60. Nothing ships with a price
>    on it until that's answered — this is a Caleb decision, not a code task.
>
> **4. Then it's product judgement, not queue-clearing.** Candidates, in no
>    particular order: the nutrition food-log module (4.18, still a v2
>    candidate), Companion's log-against-assigned-program prefill, and whatever
>    real coaches ask for once they have it in their hands.
>
> Anything you do next: read the S14 session-log entry in `PROGRESS.md` and
> debts #57b–62 first. Several of them record decisions that look like
> omissions if you only read the code.

### ~~T8 — Companion-side wiring for messaging + reminders~~ **DONE (app) / DECLINED (template.html), S14**
Messaging + reminder polling shipped in S13. S14 closed the coach-side scheduling half (debt #56) and **declined the `template.html` half with reasons — see debt #59**: the task text below assumes the HTML export already has pairing keys, and it does not (`export.ts` injects data only). Original text kept for context:
S13 update: `companion-app` now has full messaging — a dedicated Coach tab thread (`features/coach/CoachPage.tsx`), live relay send/pull when a relay exists, AND offline delivery on every other tier: messages ride inside sync packets both directions (`messages` added to `COACH_TO_CLIENT_TABLES`/outbound Companion payloads), with ONE message id across local row / relay row / packet row so no transport can double-deliver into either thread (see the new convention in §3). Round-2 update: (a) is DONE — `pullReminders` (`companionSyncApi.ts`) polls `/reminders/due` on every relay sync and surfaces results as "Reminder: …" messages + notifications. Still open: the COACH side has no scheduling UI at all (nothing calls `/reminders/schedule` — debt #56; payload contract is `{content}` sealed with the pairing key), and (b) `companion/template.html` (vanilla JS) still has none of this. Original context below:
*(original task text, kept for the template.html half)*
`sync-server/server.ts` now has `/messages/push`+`/pull`, `/reminders/schedule`+`/due`+`/upcoming`, and per-coach API keys (`/keys/register`, admin-gated) — all verified live via curl (S11). The coach side is wired: `features/sync/messageRelay.ts` (seals/opens messages with the same ECDH+AES-GCM pairing key as device sync, via `lib/sync.ts`'s `sealSyncPacket`/`openSyncPacket`) and a "Live" send/pull panel in `MessagesTab.tsx`. **Still needed:** `companion/template.html` (vanilla JS, no framework — that's why this wasn't done in the same pass as the TS-side work) needs (a) a compose box that POSTs a sealed reply to `/messages/push` with `direction: 'client'`, (b) a poll of `/messages/pull?...&for=client` to show what the coach sent, (c) a poll of `/reminders/due?clientId=...` on open, decrypting and displaying anything due. The client's ECDH keypair + the coach's public key already exist from the pairing step (`SyncCenterPage`/`WiFiSyncDialog`'s QR flow) — reuse them, don't invent new crypto. Mirror `messageRelay.ts`'s request shapes exactly (same field names) so the two sides interoperate without a version negotiation.

### T9 — ~~Rewrite `docs/SERVER_STRATEGY.md`~~ DONE (S11, same session as T8's server/coach-side half)
New §2.5 formalizes the 3-tier hosting model as doctrine, matching `CloudCard.tsx`.

### ~~T10 — Responsive/dynamic-sizing pass~~ **DONE (S14)**
Everything this task listed as genuinely unverified — Film Room's dual-video stage (it stacks), the Notes/export panel, Business/Billing, Settings' brand-mark grid, dense client tables — checked live at 375px AND 768px: no horizontal overflow, no clipped or sub-28px controls. Narrow-window Electron is moot now that the desktop window has a 900px `minWidth`. Original text:
`Shell.tsx` already has a working mobile drawer/hamburger header. Live mobile-viewport (375px) testing in S11 confirmed Dashboard, Clients, Programs list, the full Program Builder (outline → day canvas → exercise row → set editor), and — a later pass, same session — the new month-grid Calendar all render and function correctly. This IS real, load-bearing testing, not a rubber stamp: it's what found and fixed the empty-day "Add Exercise" bug (debt #28). **Still genuinely unverified:** Film Room's dual-video side-by-side stage (two videos side by side almost certainly doesn't fit 375px — probably needs a stacked or tabbed layout below some breakpoint; the Notes/export panel added this session was NOT checked at mobile width either), Business/Billing tabs, the Settings page itself (the brand-mark picker grid especially — untested narrow), and dense tables beyond the Clients roster. Narrow-window Electron (not just phone-width web) is untested either way. Don't claim this row is "done" until those are actually checked — a previous edit to this file (not from an AI session that logged itself) marked it done prematurely once already; that was wrong, see debt #24.

### ~~T11 — Electron polish~~ **DONE (S14)** — native menu (File/Edit/Go/View/Window/Help) driving the router over IPC, window geometry persisted with an off-screen-display guard, and a fixed splash path that had never worked. Verified in a real GUI launch. Original text:
Native menu bar (currently none) + window size/position persistence between launches (currently none) in `electron/main.ts`.

### ~~T12 — Companion app: coach-side ingestion of client-pushed data~~ DONE (S11)
`syncApi.ts`'s `remapClientId()` + the `applyPacket()` call site fixed this — see debt #53. A coach clicking the existing "Cloud Sync" button (`DeviceRow` in `SyncCenterPage.tsx`) on a paired client device, OR importing a `.cwsync` file that client exported, now correctly files the synced `SessionLog`/`Metric` rows under that device's linked `Client.id` instead of the client's own placeholder deviceId. No new coach-side UI was needed — the button, the file input, and the merge function all already existed; only the id-remapping step inside `applyPacket` was missing. Verified: 4 unit tests on `remapClientId` (`syncApi.test.ts`) plus a live decrypt-and-remap check against a real exported Companion packet.

### ~~T13 — Companion app: Film Room self-review~~ **DONE (S14)** — see debt #61 for what is verified vs. still needing a real phone. Original text:
Port the client-visible parts of `lib/pose.ts`/`filmroom/tracker.ts` into `companion-app/` — both are already pure/reusable with zero coach-specific logic in the tracking math itself. Free, on-device, no coach required — same reasoning as why the coach app's tracking is free (zero marginal cost, would be dishonest to paywall).

### ~~T14 — Companion app: pull an assigned program down to view~~ DONE (S13)
All three pieces landed, verified live: (a) `AssignedProgram`/`CoachExercise` tables in Companion (wire-format copies of the coach shapes), (b) `applyCoachPacket()` (`companionSyncApi.ts`) — ONE merge function for every inbound transport (relay `GET /sync/pull/coach/{deviceId}`, the LAN response, an imported `.cwsync` file), with the same seq replay-guard the coach side uses (`CoachLink.lastSeqFromCoach`), (c) a read-only Program viewer (`features/program/ProgramPage.tsx`, route `/program`) + Home-page program card. Coach-side keying bug fixed in the same pass: `doCloudSync` now pushes each device's coach packet under `id: device.id` (was `identity.deviceId` for every device — multiple clients overwrote each other on the relay), and `sync-server`'s `sync_payloads` moved to a composite `(id, type)` primary key (with an in-place migration) so a device's inbound and outbound payloads coexist. "Feeds into the PersonalWorkout logger" (log-against-program prefill) is still open — viewer first was the right cut.

### ~~T1 — Close the WiFi sync loop~~ **DONE (app, S13) / DECLINED (template.html, S14 — debt #59)**
S14 removed the template's WiFi Sync button entirely: it POSTed plaintext keyed by `Client.id` where the endpoint needs a sealed packet from a paired `Device.id`, so it could never have worked, and it dragged a CDN `<script>` into a file that must work offline. Original text:
S13 shipped the real client caller: `syncOverLan()` in `companion-app`'s `companionSyncApi.ts` + a "WiFi sync" control on the Coach tab (`CoachPage.tsx`) — POSTs the sealed packet to the coach desktop app's LAN endpoint and applies the coach's return packet from the same response; the address persists on `CoachLink.lanUrl`. Also fixed the coach side's response loop, which was silently broken: `preload.ts` sent the sync response with `ipcRenderer.invoke` but `main.ts` listened with `ipcMain.once` (invoke needs `handle()` — the response NEVER arrived, every LAN POST would have hung). Now `send`/`ipcMain.on` with a per-request `syncId` match + a 30s timeout, so two clients syncing at once can't steal each other's responses. Verified live against a stub speaking the endpoint's exact contract; **the real two-device Electron GUI pass is still pending (part of T2)**. Remaining half of the original task: `companion/template.html` (the no-install HTML export) still has no WiFi call — lower priority now that the installable app covers it, but keep the `.ssdata` file path as the fallback if it's ever added.

### T2 — Verify Windows & Android on a real machine (debts #17, #18 — cannot be done in this sandbox)
Windows: `npm run dev:electron` (live window) then `npm run build:electron` (NSIS installer) — first real GUI launch this app has ever had. Android: follow `docs/ANDROID_STRATEGY.md` exactly (`npm run android:sync` → `npm run android:open` → run in Android Studio) — expect a mobile-viewport QA pass to be needed (Program Builder drag-and-drop, Film Room controls were built desktop-first).

### ~~T3 — Printable/branded documents completion~~ DONE (S12)
`PrintSessionSheet.tsx` exists for programs. Still needed: (a) Progress report PDF (e1RM/tonnage charts as inline SVG, PR feed, adherence % for a date range), (b) blank session sheet + PAR-Q intake sheet (the PAR-Q questions already exist in `lib/parq.ts` if that module is present, or `CoachingTab.tsx`'s screening dialog — reuse, don't re-author). Same sibling-route pattern as `PrintSessionSheet`/`TvWorkoutPage`.

### ~~T4 — Progression engine completion~~ DONE (S12)
a. Policy editor: attach a `ProgressionPolicy` to a Program in the Builder.
b. Ghost values in SessionLoggerPage via `suggestNext` + `logsRepo.exerciseHistory`, reason line as tooltip.
c. Use the policy (not the heuristic) for duplicate-week auto-progression in the builder if not already consistent.

### ~~T5 — Coaching message log completion~~ DONE (S12)
`CoachMessage`/`MessagesTab.tsx` exist. Still open: exportable branded HTML digest (reuse `companion/export.ts` brand-injection pattern), optional read-only "From your coach" section in the Companion export.

### T6 — Film Room + tracking polish — **b and d DONE (S14); a and c DONE earlier; only real-footage QA remains**
S14 added the per-rep results table and PNG snapshot export (b). (d) was already done in an untracked pass — all four routes are registered in CommandPalette. (c) shipped in S11 as real dual-clip tracking. **(a) manual QA with real phone footage is still open** and is part of T2. Original text:
a. **Manual QA with real phone footage** (portrait, 60fps, squat + press): verify skeleton alignment, sync-lock accuracy, rep-counter thresholds (debt #10) — tune `RepCounter` constants or add One-Euro smoothing in `lib/pose.ts` if jittery.
b. Per-rep results table + "copy to session notes"; PNG snapshot export of stage+annotations.
c. Reference-clip tracking + client-vs-reference angle deltas (the killer demo).
d. Register `/film-room` and the new S10 routes (`/team`, `/leads`, `/leaderboard`) in CommandPalette.

### ~~T7 — Phase 9: Hardening & release~~ **DONE (S14)** except Lighthouse + cross-browser (debt #58). PWA, per-route error boundaries, code splitting (820KB→476KB), the first-boot fix, reduced motion, `HOW-TO-OWN-IT.md`, and pruning the committed relay `.db` all landed. Original text:
vite-plugin-pwa, error boundaries per route, **fix debt #6** (first-boot ConstraintError — verify S9's `main.tsx` getOrCreate + Shell's `.get()` split actually closed this; it looks fixed but hasn't had a dedicated regression check), code-split builder + film room + the new S10 routes (main bundle is ~820KB now — debt #8 keeps growing), reduced-motion pass, Lighthouse, cross-browser, `HOW-TO-OWN-IT.md`. Prune `sync-server/`'s committed `coachwright.db` before any distribution packaging (debt #19).

### Marketing track (parallel, non-code)
`BRANDING_PLAN.md` at repo root is the contract for all naming/copy: features are called **Film Room**, **Companion**, **Profit Planner**, **The Ledger**, **Studio Link**, **Team**, **Leads**, **Leaderboards**, **TV Workout**. `docs/SERVER_STRATEGY.md` §5 has monetization guidance worth mining for marketing copy (the "you'd be paying $X/mo elsewhere" framing, the Companion-footer referral loop).

## 5. Honesty ledger
Two contained `as any` at Dexie generic boundaries (documented in PROGRESS.md). Attention-queue is O(all logs) — acceptable until Phase 5. If you cut a corner, write it in PROGRESS.md "Known debts" — silent debt is the only unacceptable kind.

## 6. Definition of "session done"
Build green · tests green · PROGRESS.md table + session log updated · new conventions appended to §3 of this file · this file's task queue re-pointed at the true next task.
