# S15 — membership pivot, roster triage, doc-system rebuild

**Tool:** Claude Code (Sonnet 5) · **Date:** 2026-08-14
**Tests:** 729/729 green (48 files) · **Typecheck:** clean (app + electron + sync-server)

## Asked
Wire Film Room into the assistant's grounding. Then: switch pricing to $29/mo memberships with a free
tier of 1–3 clients, benchmark against quickcoach.fit, "make us more like a better SaaS." Later: target
pain points from an /r/personaltraining thread about feature bloat. Finally: rebuild the logging system,
write a real roadmap, and prep for handing off to Antigravity.

## Shipped
- **Film Room → Assistant grounding.** `lib/assistantContext.ts` now surfaces the latest Film Room
  analysis per client, found via the literal prefix `buildFilmRoomSummary()` emits (Film Room's video
  data is never persisted — the message is the only durable trace). 2 new tests.
- **Membership model.** `lib/membership.ts` — a second signed-token type (`CWM1.` prefix) alongside
  `lib/licence.ts`'s **untouched** one-time keys (`CW1.`). Deliberately a separate module, not a new
  field, so no already-issued licence can be invalidated. `FREE_TIER_CLIENT_LIMIT = 3` +
  `canAddClient()` gate `NewClientDialog` and `ImportCsvDialog` (the CSV path would otherwise bypass the
  cap entirely). 22 tests.
- **Stripe billing** in `sync-server/` — Checkout, webhook (raw-body signature verification, registered
  before `express.json()`), status/refresh, billing portal, `memberships` table. `membershipTokens.ts`
  mints tokens server-side. **Cross-verified for real:** minted a token from a live server against a
  throwaway keypair and confirmed the app's own `verifyMembershipToken` accepts it — proving the two
  implementations agree byte-for-byte.
- **`MembershipCard.tsx`** — upgrade/status/manage-billing. `lib/membershipApi.ts` only ever mutates
  state on a *positive verified* response; offline or a down server leaves the cache alone, so a coach
  without internet keeps access until the token's own `expiresAt`. 4 tests.
- **Latent Electron bug found and fixed.** `setWindowOpenHandler` denied every `target="_blank"` with no
  fallback — Stripe Checkout, video links, and print-preview were all **silent no-ops in the packaged
  desktop app**. Now routes http/https to `shell.openExternal`.
- **Roster-triage rules** (`checkin-cadence-slipping`, `completion-trend-declining`) in
  `lib/automations.ts` — trend-based, not threshold-based, answering the Reddit thread's real complaint
  (consolidation beats generation). Slotted into the existing "Needs attention" panel rather than adding
  a page. 16 tests.
- **Free-tier default.** New installs now start `edition: 'personal'` (was `'independent'`);
  `PERSONAL.clients` flipped `false`→`true` since free now means *capped* coaching, not none. Existing
  trainer rows are untouched by both changes.
- **Docs.** New `docs/MEMBERSHIP.md` (reasoning + copy-pasteable Stripe runbook), `PRODUCT_OVERVIEW.md`
  rewritten (pitch, pricing, 5-year math, brand promise), `SERVER_STRATEGY.md` §2.6, and in-app
  `Guide.tsx` corrected — it was telling real users "no subscription for the app itself."
- **New doc system** — `AGENTS.md` + `CLAUDE.md` (one protocol, tool-agnostic), `docs/STATUS.md` (82
  lines, read-first), `docs/ROADMAP.md`, `docs/DEBT.md` (open items only, unique ids), `docs/sessions/`
  (append-only, one small file each). `PROGRESS.md` frozen as an archive in both locations — the two
  copies had already **silently diverged** about what shipped.
- **`docs/LIBRARY_GROWTH.md`** — how to get 277 → 3,000 exercises for $0 and legally. Four stacked
  engines (public-domain import → taxonomy composition → AI-authored prose → coach contributions), the
  copyright line stated once, and three traps specific to exercise DBs (CC-BY-SA copyleft, trademarked
  equipment names, video hosting). Includes the coach-override data model.
- **Roadmap §2.5 — Stripe Connect analysis.** 1% platform fee is viable and genuinely cheaper than
  competitors' 2–3%, but it contradicts a current headline claim (`SERVER_STRATEGY.md` §3's "no platform
  markup") which must be rescoped, not ignored; and it should use **Connect Standard** so the coach stays
  merchant of record.

## Found while auditing (real bugs, not shipped fixes)
- **DEBT-67:** `seedExercisesIfEmpty()` returns early on `count > 0`, so **existing installs can never
  receive new exercises.** Verified by reading the source. This silently blocks the entire library growth
  plan from reaching anyone who has already opened the app. Prerequisite, not a nice-to-have.
- **The "3,000-exercise library" claim is false** — there are 277, and `06-EDITIONS-PRICING.md` uses the
  number as *pricing justification*.

## Didn't do / couldn't
- **No real Stripe keys were created or used** — correctly, that's Caleb's own account. Billing is
  code-complete and commercially non-functional until §1.1 of the roadmap is done.
- `MEMBERSHIP_SERVER_URL` still points at an undeployed placeholder (`relay.coachwright.app`).
- `BRANDING_PLAN.md`, `STRONGSUIT_MASTER_SPEC.md`, `HOW-TO-OWN-IT.md` and the pitch deck still carry old
  `$60`/one-time framing. `PRODUCT_OVERVIEW.md` + `docs/MEMBERSHIP.md` are the current source of truth.

## New debt
- `DEBT-66` — the free-tier client cap is soft (local IndexedDB check). Fine by design, but it now
  guards revenue rather than cosmetics. Named honestly rather than assumed to be enforcement.

## For the next session
Roadmap §1.1 (Stripe keys, Caleb) unblocks revenue; §1.2 (exercise library 277 → 1,000+) is the biggest
real gap and the best Antigravity task in the project. Barcode/food logging (§2.1) is the highest-value
competitor-parity gap — QuickCoach charges $10.75/mo extra for it.
