# DEBT — open items only

**Original numbering preserved** so older docs' cross-references still resolve. **Never reuse an id** —
duplicate ids have already caused a fixed bug to be "rediscovered" and re-fixed a session later.
Next free id: **70**.

Closed debts are *not* listed here. They live in the frozen `PROGRESS.md` archive; grep it by number.

**Status key:** 🔴 active risk · 🟡 known limitation, accepted for now · ⚪ cosmetic / cleanup · ✅ deliberate won't-do

---

## 🔴 Active risk

**9 · Docs were duplicated at repo root and in the app dir, and diverged.** By S15 the two `PROGRESS.md`
copies disagreed about what had shipped. **Partially resolved S15** — live docs now exist only in
`strongsuit-v0.1/strongsuit/docs/`, root copies frozen as archives. *Remaining: don't recreate the
pattern. See `AGENTS.md` §2.*

**17 · Android has never been compiled.** `android/` is a real generated Capacitor project, but no SDK
has existed in any build environment. "Next step ready," not "done."


**7 / 10 / 61 · Film Room has never seen real human footage.** Rep-counter thresholds (35%/12% of
observed ROM, 10-sample warm-up, 25° min range) are unit-tested against *synthetic* series only. Expect
a tuning pass after real-footage QA. Same gap in Companion, and nothing has been measured on a real
mid-range phone.

---

## 🟡 Known limitation

**11 · Distribution carries ~22MB of wasm + pose models** in `public/mediapipe/`. Must stay bundled
(offline doctrine). Could prune to SIMD + nosimd only.

**21 · `sessionsRemaining` is an estimate**, not a decrementing pack ledger — it's `purchased credits −
all-time logged sessions`. Fine as a nudge; do not present it to a buyer as exact. *Now that money is
involved, worth making real.*

**24 · Responsive unverified** on Film Room's dual-video stage (will not fit 375px side-by-side),
Calendar, Business/Billing tabs, and Settings. Verified fine: Dashboard, Clients, Programs, Builder.

**26 · Client portability excludes** invoices/expenses/challenges — a ported client's payment ledger
doesn't travel. Documented scope choice, not an oversight.

**68 · (S20/S21, NEW) Client portability also excludes `foodEntries` — same shape as DEBT-26, not yet
documented as a choice.** `db/portability.ts`'s `exportClientPackage`/`rekeyClientPackage` never gained a
food-log branch when the food feature shipped. A client's diet history doesn't travel with them to a new
coach or a rekeyed package. Real health data, worth closing deliberately rather than leaving silent —
note `FoodEntry.foodItemId` points at a *shared*, non-client-scoped `FoodItem` cache row (keyed by
barcode), so a correct fix needs to decide whether to bundle the referenced `FoodItem`s into the package
too, not just remap `FoodEntry` the way `habitEntries` remaps `habitId`.

**29 · GPU→CPU delegate fallback never tested** on hardware actually lacking WebGL2. The fallback path
is structurally sound; the GPU path is what's been verified.

**48 · Dual-clip tracking's hardware cost is unmeasured.** `'both'` mode runs two concurrent MediaPipe
instances. It's opt-in *because* of this, but never tested on hardware marginal for even one.

**49 · `vite-plugin-pwa` blocked** by its Vite `^6` peer cap; both apps are on Vite 8. Manifest + service
worker are hand-rolled instead. Revisit when the plugin supports Vite 8.

**54 · Electron LAN sync loop needs one two-device pass.** Contract-verified against a stub and the IPC
response bug is fixed, but the real GUI-hosting-a-phone-sync loop has never run.

**57 · Web Push needs one real-device round trip.** Server side fully verified via curl; the
grant→subscribe→deliver→notification path can't be exercised in a sandbox that hard-denies prompts.

**57b · Reminders are pull-only by design** — released when Companion next opens and syncs, not at the
minute. UI says so. Minute-accuracy needs the Capacitor wrap.

**58 · Lighthouse and cross-browser never run.** One browser engine available, no Lighthouse CLI.
Unmeasured, not failing.

**60 · `sync.ts`, `pose.ts`, `core.ts`, `singleFlight` duplicated** across the two apps — separate npm
projects, no shared package. Three copies was the stated trigger for extracting a workspace. We're past it.

**62 · Service worker is cache-first with background revalidate**, so the first load after an update can
serve the previous build. "Reload twice" is the honest answer. Bump `CACHE` in `public/sw.js` on
releases where it matters.

**64 · i18n: ~53 of 57 components still hold hardcoded English.** Layer + RTL are done and the pattern
is proven. `es.json`/`ar.json` are **seed translations** marked in their own `_meta` — must not ship to
customers as finished locales.

**65 · `symptomReadinessContribution()` has zero callers.** Correct and tested, but the only device with
cycle data is Companion, which has no readiness engine, and cycle rows are kept out of the sync payload
by construction. **Do not close this by adding cycle rows to the payload** — a test forbids it. Needs a
product decision: build readiness in Companion, or a per-field opt-in sharing only this number.

**69 · (S21, NEW) `CommandPalette.tsx` no longer has an "Ask the Assistant" entry.** The `/assistant`
route and `AssistantPage.tsx` are still fully wired in `router.tsx` and reachable by URL, but the
palette's `Bot` icon import was unused (removed as part of this session's compile-error cleanup) and no
`t('...')`/assistant search result exists anywhere in the file. Either this was intentionally dropped at
some point and the dead import is the only leftover, or it's a real, if minor, discoverability
regression. Wasn't rebuilt blind without knowing which — worth 10 minutes to decide and, if it should
come back, re-add one entry matching the palette's existing pattern.

**66 · (S15, NEW) The free-tier client cap is soft.** `canAddClient()` checks the coach's own IndexedDB;
a determined user can edit it. This was fine when licensing was cosmetic — it now guards revenue.
Unfixable without server-authoritative accounts, which would mean a different product. Accepted, but
name it honestly rather than assuming it's enforcement.

---

## ⚪ Cosmetic / cleanup

**1** Dashboard attention-queue scans all logs in memory — fine at current scale.
**2** Two `as any` casts at Dexie generic boundaries — documented, contained.
**3** No ESLint flat-config customization yet.
**5** `CalendarPage` placeholder export still in `placeholders.tsx` — dead, unimported.
**13** Keyboard transport (Space/←/→) drives only the master video; the Reference bar is mouse-only.
**14** Spec/doc *filenames* still say STRONGSUIT (`STRONGSUIT_MASTER_SPEC.md`). Product is Coachwright.

---

## ✅ Deliberate won't-do

**59 · No live relay messaging or WiFi sync in `companion/template.html`.** The request rested on a false
premise — that file has no keys and is not a paired Device. Doing it would mean either baking a private
key into an emailed file, or reimplementing the pairing handshake in vanilla JS against `file://`.
Chose neither. The broken WiFi button (which POSTed plaintext to an endpoint requiring a sealed packet,
failing at two layers) was removed, along with a CDN `<script>` that violated offline doctrine.
**Precedent: no CDN scripts, anywhere.** Revisit only if the HTML export needs live sync badly enough to
justify on-device key generation.
