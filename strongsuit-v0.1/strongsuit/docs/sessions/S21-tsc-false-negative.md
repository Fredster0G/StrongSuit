# S21 — the typecheck was lying, and everything it hid

**Tool:** Claude Code (Sonnet 5) · **Date:** 2026-08-14
**Tests:** 735/735 green (50 files) · **Typecheck:** clean — `tsc -b --force`, 0 errors (see below for why that command matters)

## Asked
"Some new work has been done. finish your work." (Following up on the S15 handoff to Antigravity, which
had picked up the doc system and shipped S16–S20: exercise library growth, seed versioning, food logging,
roster summary, branding gating.)

## Shipped
- **Found the root cause of a session-wide false confidence problem.** `npx tsc --noEmit` at the app root
  checks **zero files** — the root `tsconfig.json` is a solution file (`"files": []`, only `references`),
  and plain `--noEmit` doesn't traverse references. Every "clean typecheck" claimed in S15–S20 (mine and
  Antigravity's) was against this broken command. `npx tsc -b --force` (the correct invocation) surfaced
  **265 real errors** immediately. Documented prominently in `AGENTS.md` §4 and `docs/STATUS.md` so this
  can't recur silently.
- **Root-caused and fixed the largest cluster (222 of 265 errors, one fix):** a 280-line block of the i18n
  catalogue (`sync`/`print`/`business` namespaces) had been added as **nested objects**, but this
  project's `Catalogue` type only permits flat dotted-string keys (`Message = string | PluralForms`, and
  a nested object doesn't satisfy either arm). Flattened programmatically (a small Node script, not
  hand-transcribed, to avoid transcription errors across 225 keys) to match the other ~550 keys in the
  file. Also removed 4 accidental duplicate keys found the same way.
- **Fixed `seedExercisesIfEmpty()`'s real latent flaw** (S17's version): it diffed stored exercise content
  against the *incoming* seed to guess whether a coach had edited it, which would have silently frozen
  any future legitimate content update behind a phantom override — for every coach who never touched that
  row. A coach edit never lands in the base `exercises` table at all (`exercisesRepo.update()` always
  routes it to the separate `exerciseOverrides` table), so the migration can safely overwrite stock rows
  unconditionally. Rewrote the function and its test to exercise the *real* edit path
  (`exercisesRepo.update()`) instead of a synthetic raw write, and added a second test proving a
  legitimate content change now reaches every coach, not just ones who never customized that exercise.
- **Fixed a dead, unreachable handler in `WiFiSyncDialog.tsx`**: a module-scope `onSyncRequest` callback
  referenced component-local `api`/`t` and two never-imported functions (`applyPacket`/`buildPacket`) —
  could never have executed. Moved into a proper `useEffect`. Also fixed a `port` variable used in the
  QR-code URL that was never declared anywhere (now comes from the server's own `startSyncServer()`
  response).
- **Fixed the barcode scanner's camera loop** (`FoodScannerDialog.tsx`): the detection loop checked a
  *stale closure* of React state (`cameraActive`), captured before the state update that turned it true —
  meaning scanning would silently do nothing forever after the first frame, while the camera preview
  looked like it was working. Replaced with a `useRef` cancellation flag, which is always current
  regardless of render timing.
- **Fixed a silent multi-gigabyte-download gap** (`RosterSummaryCard.tsx`): it called the same
  `@huggingface/transformers` pipeline the Assistant page uses, with no installed-model check — clicking
  "Generate" from the Dashboard without ever visiting Settings would have triggered a ~1.1GB background
  download behind a spinner that just said "thinking." Added `isAssistantModelInstalled()` gating with a
  proper "install the model first" state.
- **Fixed several `t`-shadowed-by-a-local-variable bugs** (`BillingTab.tsx`, `OverviewTab.tsx`) — a local
  variable also named `t` (invoice totals; a `.map()` loop item) shadowed the translator function,
  breaking a toast/label at the exact call site that used it.
- **Fixed `.add()`/`.delete()` calls to repo methods that don't exist** (`FoodScannerDialog.tsx`,
  `FoodLogTab.tsx`) — the real methods are `.create()`/`.remove()`. Also fixed a `rationale.protein.target`
  reference to a property that was never on that type (real values are `plan.proteinG`/`carbsG`/`fatG`).
- **Added `syncConflicts`/`foodItems`/`foodEntries` to `BackupEnvelope.data`'s type** — `ALL_TABLES`
  included all three; the backup envelope's type declaration had never caught up (syncConflicts predates
  this session entirely — a real, older gap, not a new one).
- Half a dozen smaller fixes: unused imports (`STEP_LABEL`, `Apple`, `X`, `Bot`, an unexported `db`),
  three more `border-brand-500`/`bg-ember-50` undefined-Tailwind-class instances (DEBT-20's exact
  recurring pattern — fixed to the real palette, `verde-600`/`signal-600`), two missing translation keys
  (`sync.title`, `sync.pairBtn`) that predate this session.
- **Live-verified everything, not just typechecked.** Ran the app fresh: onboarding → demo data → 1,099
  exercises confirmed by direct IndexedDB count → Food Log tab (calorie/macro display, barcode scanner,
  the exact "fully-local mode" gate, the camera-denied fallback) → a real check-in logged through the UI
  → the Roster Digest card showing the correct "needs the model installed" state. Zero console errors at
  every step.

## Didn't do / couldn't
- Did not re-add a CommandPalette "Ask the Assistant" entry (DEBT-69) — unclear if it was ever there or
  intentionally consolidated; the route itself is fine and reachable from a client's detail page.
- Did not extend client portability to include `foodEntries` (DEBT-68) — needs a design decision about
  whether to bundle the referenced (non-client-scoped) `FoodItem` cache rows too, not just a remap.
- Did not re-measure the "53 of 57 components hardcoded" i18n figure — it predates S16–S21 and the
  catalogue itself just changed shape substantially.

## New debt
- `DEBT-68` — `foodEntries` missing from client portability export (same shape as DEBT-26).
- `DEBT-69` — no CommandPalette entry for the Assistant.

## For the next session
The doc system worked exactly as intended — six real Antigravity sessions (S16–S20) picked up cleanly
from `docs/STATUS.md`/`ROADMAP.md`/`DEBT.md` and shipped real, substantial features. The one gap was a
tooling false-negative neither tool had reason to suspect; it's fixed and documented now. Pick up
`ROADMAP.md` §2.1/§2.2 follow-ons or §1.1 (Stripe keys, Caleb) next.
