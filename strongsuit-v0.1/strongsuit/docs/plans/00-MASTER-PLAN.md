# Coachwright v2 — Master Plan

**Status:** planning only. Nothing in this folder is built yet.
**Written:** 2026-07-26, after S14 closed the v1 queue (all 9 phases done).

---

## 0. What you asked for, restated

So we agree on scope before anything gets built:

| # | Ask | Doc |
|---|---|---|
| 1 | Connectivity that works identically on localhost / self-hosted / our cloud / P2P | [01-CONNECTIVITY.md](01-CONNECTIVITY.md) |
| 2 | Optional **local** AI features, peer-reviewed, genuinely useful | [02-LOCAL-AI.md](02-LOCAL-AI.md) |
| 3 | Menstrual cycle + other optional context; far more advanced nutrition; far more rigorous readiness | [03-SCIENCE-ENGINES.md](03-SCIENCE-ENGINES.md) |
| 4 | Film Room: fix occlusion (machines blocking the body), add more optional models | [04-FILM-ROOM-V2.md](04-FILM-ROOM-V2.md) |
| 5 | Exercise library (3k curated) + training tracks & labels | [05-EXERCISE-LIBRARY.md](05-EXERCISE-LIBRARY.md) · 📌 **authoring deferred** → [05a-LIBRARY-AUTHORING-BRIEF.md](05a-LIBRARY-AUTHORING-BRIEF.md) |
| 6 | Three editions (Personal / Independent / Studio) + pricing | [06-EDITIONS-PRICING.md](06-EDITIONS-PRICING.md) |
| 7 | Every major language; first-run system check + optional installs; advanced Ctrl+K; imports that work; optimization | [07-PLATFORM.md](07-PLATFORM.md) |
| 8 | Claude Design prompts for each edition's UI/ecosystem | [08-CLAUDE-DESIGN-PROMPTS.md](08-CLAUDE-DESIGN-PROMPTS.md) |

---

## 1. The three things that will actually decide whether this works

Everything else is execution. These three are where the project can genuinely fail, so they're stated up front rather than buried.

### 1.1 The library is ~3,000 fully curated entries — **decided**

The original ask was 25,000. There aren't 25,000 distinct exercises in the world (major commercial libraries top out at 1,300–1,500), so hitting that number meant generating *movement variants* and templating most of their content.

**Decision (2026-07-27): ~3,000 exercises, every one fully curated** — real description, real cues, common faults, contraindications, and **two verified links each**.

This is the better product. 3,000 curated entries is roughly **double the largest commercial library** while being materially better per entry, the 6,000 links are actually verifiable (50,000 were not), and the modifier system moves to *prescription* (`Back Squat` + `3s eccentric` on the set) where it belongs — which also stops fragmenting a client's training history across near-duplicate rows. See [05](05-EXERCISE-LIBRARY.md).

**The cost is real and must be budgeted:** ~2,700 new entries of subject-matter writing and ~240 hours of link curation. Recommendation is a contract CSCS author, credited in-app.

### 1.2 Local AI: no size ceiling — hardware recommends, edition gates — **decided**

A useful local LLM is 2–8 GB; pose models are 5–50 MB. The app already ships ~38 MB of MediaPipe.

**Decision (2026-07-27): no arbitrary download cap.** A real hardware probe at first run classifies the machine and *recommends the tier it can run comfortably* (never the biggest it can technically load), and **edition gates which models are licensed at all** — Studio gets larger models, multi-person pose, batch roster inference, and a shared model cache across staff machines. See [02](02-LOCAL-AI.md) §3.

Nothing AI-related downloads unless the user opts in, and **every AI feature degrades to a deterministic non-AI path.** The cited engines stay the product; AI is an accelerant, never a dependency.

### 1.3 Cycle-aware training is where "only the best research" means *claiming less*

You asked for only world-class evidence. Applied honestly, that cuts against the most marketable version of this feature.

The 2023–2024 meta-analyses (McNulty et al.; Colenso-Semple et al.) find **low-quality, highly heterogeneous evidence** for menstrual-phase-based programming. There is *good* evidence for **symptom tracking and autoregulation**, and for hormonal-contraceptive-aware expectations.

So: we build **cycle-aware autoregulation and symptom logging**, not "train heavy in your follicular phase." That's the defensible product, and it's the one that won't embarrass you in front of a sports dietitian. Full reasoning in [03](03-SCIENCE-ENGINES.md) §4.

---

## 2. Architecture principles for v2

Carried from v1 (they've held up) plus new ones this scope forces:

1. **Offline is the floor, not a mode.** Every feature works with the network unplugged, or it degrades to something that does and says so.
2. **No number without its reasoning.** Every computed recommendation carries a citation and plain-language rationale. Already true of nutrition/progression; extend to readiness, cycle, AI output.
3. **AI is optional, local, and replaceable.** No cloud inference, ever. No feature is AI-only.
4. **One payload, one merge function, many transports.** v1's best architectural decision — generalize it ([01](01-CONNECTIVITY.md)).
5. **Editions are capability flags, not forks.** One codebase. A `Personal` build is the `Studio` build with capabilities off. Never maintain three apps.
6. **The library is generated and verifiable.** No 25,000-row hand-maintained blob. A generator + curation layer + tests.
7. **Every string is translatable from day one of v2.** Retrofitting i18n across 60+ components is the single most tedious task in this plan — so it goes first, not last.

---

## 3. Sequencing

Ordered by *dependency and risk*, not by excitement. Each phase leaves the app shippable.

### Phase A — Foundations (must precede everything else)
Doing these later means redoing work.

| Task | Why first |
|---|---|
| **i18n extraction + framework** | Every subsequent feature adds strings. Retrofit cost grows daily. |
| **Edition/capability system** | Determines what every new feature checks against. |
| **Transport abstraction** ([01](01-CONNECTIVITY.md) §3) | All sync work builds on it. |
| **Import audit** ("make sure all imports work") | Cheap, and a broken import surfaces as a runtime crash in a lazy route. |
| **Model manager + system check skeleton** | Every AI feature plugs into it. |

### Phase B — The science layer
| Task | Notes |
|---|---|
| Nutrition v2 (periodized, cycle-aware, sport-specific) | Extends existing cited engine |
| Readiness v2 (multi-domain, ACWR, monotony/strain) | Replaces the 4-input model |
| Cycle & symptom tracking | Health data — needs the privacy design in [03](03-SCIENCE-ENGINES.md) §4.5 |
| Training tracks & athlete labels | Feeds programming + library filtering |

### Phase C — Exercise library — 📌 **DEFERRED (2026-07-27)**
Caleb has parked the authoring work for a later dedicated session. The brief is written and self-contained: **[05a-LIBRARY-AUTHORING-BRIEF.md](05a-LIBRARY-AUTHORING-BRIEF.md)**. The 277 existing entries stay in place meanwhile; nothing else in the plan depends on this landing first.
| Task | Notes |
|---|---|
| Taxonomy + generator | The 25k decision |
| Curation pass (top ~2,000) | Human-quality cues/descriptions |
| Link resolver + curated link set | The 50k-URL problem |
| Search/index rebuild | 25k rows breaks the current in-memory fuzzy search |

### Phase D — Film Room v2
| Task | Notes |
|---|---|
| Occlusion handling | The specific defect you named |
| Optional model tiers | Heavy/light selection |
| Machine-context presets | Where occlusion is worst |

### Phase E — Local AI features
Last, because everything above must work without it.

### Phase F — Editions, packaging, pricing, launch
Three installers, three onboarding flows, licensing, store listings.

---

## 4. Decisions made (2026-07-27)

| # | Question | Decision |
|---|---|---|
| 1 | Connectivity | **Build true WebRTC P2P *and* LAN discovery.** Five transports behind one broker. Signalling rides the existing relay; TURN fallback is tier-gated. ([01](01-CONNECTIVITY.md) §6) |
| 2 | Local AI size | **No fixed ceiling.** Hardware probe recommends the comfortable tier; **edition gates** which models are licensed. ([02](02-LOCAL-AI.md) §3) |
| 3 | Library scope | **~3,000 fully curated**, not 25,000 generated. Modifiers move to set-level prescription. ([05](05-EXERCISE-LIBRARY.md)) |
| 4 | Pricing | **$249 one-time ($179 launch)** · Personal free · Studio $199/seat. **No paid version upgrades — updates free forever.** Plus loyalty, referral, community-contribution credits and a tasteful donation ask. ([06](06-EDITIONS-PRICING.md) §4) |

### Still open

1. **Editions structure** — [06](06-EDITIONS-PRICING.md) §1 recommends two codebases marketed as one three-tier ecosystem, with shared `packages/`. Needs a yes.
2. **Cycle features** — confirm the evidence-honest framing ([03](03-SCIENCE-ENGINES.md) §4): symptom-driven autoregulation, *not* phase-based programming, because the meta-analyses don't support the latter.
3. **Library authoring resource** — ~2,700 entries + 6,000 links is the schedule's critical path. Contract a CSCS author, or absorb it internally?

---

## 5. Honest risk register

| Risk | Severity | Mitigation |
|---|---|---|
| **Library authoring is the critical path** (~2,700 entries + 6,000 links) | **High** | Budget it explicitly; contract a credentialed author; start in Phase A, not Phase C ([05](05-EXERCISE-LIBRARY.md) §9) |
| **WebRTC NAT traversal fails on gym/corporate WiFi** | **High** | Broker falls through to relay automatically; UI always shows the live path; TURN for the paid tiers ([01](01-CONNECTIVITY.md) §6.2) |
| **Lifetime free updates removes upgrade revenue** | **High** | Cloud attach rate, Studio seat expansion, optional *content* packs (never features), community contribution credits ([06](06-EDITIONS-PRICING.md) §4.5) |
| Local LLM too slow/large on a coach's mid-range laptop | **High** | Hardware probe recommends comfort not maximum; always-available deterministic path |
| Link rot across 6,000 curated links | Medium | Two links per exercise, monthly CI check, resolver floor, community replacement credits |
| Cycle data is sensitive health data (GDPR special category) | **High** | Local-only by default, never in sync payload without explicit opt-in ([03](03-SCIENCE-ENGINES.md) §4.5) |
| Three editions triple QA surface | Medium | Capability flags + one codebase + edition matrix tests |
| Giving nutrition/health advice creates liability | **High** | Existing "not medical advice" posture extended; scope-of-practice guardrails ([03](03-SCIENCE-ENGINES.md) §6) |
| i18n retrofit stalls the whole plan | Medium | Phase A, automated extraction, machine translation + native review pass |
