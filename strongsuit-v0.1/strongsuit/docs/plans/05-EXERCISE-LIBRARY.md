# 05 — The exercise library

> **DECIDED (Caleb, 2026-07-27): ~3,000 exercises, every one fully curated.**
> Quality over volume. This replaces the earlier 25,000-generated-variant plan.

---

## 1. Where we are, and what changed

277 seeded exercises across 4 files, hand-written, with real coaching cues. The voice is good — that's the standard we scale to.

**The decision:** rather than generate 25,000 variants and curate a fraction of them, we build **~3,000 exercises where every single row is held to the same standard as the best 500**. Every row gets a real description, real cues, common faults, contraindications, and **two verified video links**.

### Why this is the better call

| | 25k generated | **3k fully curated** |
|---|---|---|
| Links needed | 50,000 (impossible to verify) | **6,000 (genuinely achievable)** |
| Quality floor | Templated for ~22,500 rows | **Human-written for all** |
| Search experience | Long tail of near-duplicates crowding results | Every result is a real, useful entry |
| Localization | 25k names to translate | **3k — or ~400 via composition** |
| Maintenance | Unbounded | Bounded and auditable |
| Perf risk | High (index, virtualization, seed time) | **Low — 3k is comfortable** |

3,000 curated entries is **roughly double the largest commercial library** (most top out at 1,300–1,500) while being materially better per entry. That's a defensible "best in the world" claim; 25,000 templated rows was not.

### What we give up, stated plainly

A coach searching a very specific stacked variant — *"paused close-grip incline dumbbell press with a 3-second eccentric"* — won't find a dedicated row. **Mitigation:** the modifier system (§3) stays, applied at *programming* time rather than *library* time. The coach picks `Incline Dumbbell Press` and attaches tempo/grip/pause as **prescription modifiers on the set**, which is where they actually belong — they're properties of *how you're programming it today*, not of a distinct exercise. This is the more correct data model anyway.

---

## 2. What 3,000 is made of

| Group | Count | Notes |
|---|---|---|
| **Core barbell / dumbbell / kettlebell** | ~700 | The bread and butter, exhaustively covered |
| **Machine & cable** | ~550 | Deliberately deep — this is where most gen-pop clients live, and where competitors are thin |
| **Bodyweight & calisthenics** | ~350 | Including full progression ladders |
| **Olympic lifting & derivatives** | ~180 | Full teaching progressions |
| **Plyometric / power / jumps / throws** | ~180 | |
| **Conditioning & cardio modalities** | ~200 | Erg, bike, ski, sled, carries, intervals |
| **Mobility, activation, warm-up** | ~300 | CARs, stretches, drills |
| **Core & anti-rotation** | ~220 | |
| **Rehab / prehab / corrective** | ~180 | Referral-framed, never prescriptive |
| **Sport-specific drills** | ~140 | Tied to training tracks |

**~3,000.** Every one hand-written.

---

## 3. Structure: patterns + modifiers (still, but used differently)

The taxonomy work isn't wasted — it moves from *generating rows* to *organising and localizing them*.

### 3.1 Base patterns (~220)

Still authored first, and still the backbone. Each declares: canonical name, aliases, primary/secondary muscles, movement plane, joint actions, default tracking type, coaching cues, common faults, contraindications, regression/progression pointers.

**Each library exercise belongs to a base pattern.** That's what powers "show me alternatives", "easier version", "same pattern, different equipment", and the shared SVG illustration (§6).

### 3.2 Modifiers move to prescription

```ts
// Modifiers are no longer library rows. They're set-level prescription.
interface SetPrescription {
  reps: string; load?: number; rpe?: number
  tempo?: TempoSpec            // 3-1-1-0
  grip?: GripId                // close, wide, neutral…
  stance?: StanceId
  romConstraint?: RomId        // paused, deficit, to-box, partial
  laterality?: LateralityId
  cue?: string
}
```

This is a **better data model**: `Back Squat @ 3-second eccentric` is the same exercise programmed differently, and its history should aggregate with your other back squats — which it can't if they're separate library rows. The 25k plan would have fragmented every client's training history.

### 3.3 Per-row data

```ts
interface Exercise {
  id: string
  name: string; aliases: string[]
  basePatternId: string
  category: ExerciseCategory
  primaryMuscles: MuscleId[]; secondaryMuscles: MuscleId[]
  equipment: EquipmentId[]
  tags: TagId[]                     // §4
  description: string               // hand-written, 2–4 sentences
  cues: string[]                    // 2–3, imperative voice
  commonFaults: string[]            // 2–3
  contraindications?: string[]
  setup?: string[]                  // step-by-step, for the unfamiliar
  tracking: TrackingType
  difficulty: 1 | 2 | 3 | 4 | 5
  unilateral: boolean
  plane: 'sagittal' | 'frontal' | 'transverse' | 'multi'
  links: ExerciseLink[]             // exactly 2, verified — §5
  regressions: ExerciseId[]         // easier
  progressions: ExerciseId[]        // harder
  substitutes: ExerciseId[]         // same stimulus, different equipment
  trackAffinity: TrackId[]
  filmRoomPreset?: EquipmentPresetId // ties to 04-FILM-ROOM-V2 §2 Layer 4
}
```

**`regressions` / `progressions` / `substitutes` are the highest-value fields in the schema** and only become practical at 3,000 rows. "My client can't do a pull-up" or "the gym's leg press is taken" is a daily coaching problem, and a curated graph solves it in one click. A generated 25k library could never have a trustworthy graph.

---

## 4. Tag vocabulary (~180 controlled tags)

Goal (strength/hypertrophy/power/endurance/mobility/stability/rehab) · Experience level · Setting (home/hotel/full gym/outdoor/minimal) · Time cost · **Joint-friendliness** (knee-, shoulder-, low-back-, hip-, wrist-friendly) · Position · Impact · Skill demand · Warm-up / main / accessory suitability · Compound vs isolation · Sport affinity · Youth-appropriate · Masters-appropriate · Pregnancy-appropriate *(referral-gated)* · Equipment-substitutable · Unilateral · Bilateral-deficit-friendly.

Tags are what turn a library into an answer engine: *"shoulder-friendly horizontal press, hotel room, under 20 minutes."*

---

## 5. Links — now genuinely solvable

**3,000 × 2 = 6,000 links.** Unlike 50,000, this is real work but entirely achievable.

### 5.1 Curation standard

Every exercise gets **exactly two** links, chosen to complement rather than duplicate:

| Slot | Purpose |
|---|---|
| **1 — Technique** | A clear, well-shot demonstration from a credible source (recognised coach, university, professional org) |
| **2 — Coaching depth** | Cues, common faults, or the "why" — a different creator, so a dead link never orphans an exercise |

**Selection criteria:** credible source · clear camera angle for the movement's key plane · no paywall · no autoplay ad-wall · stable channel with history · not a 30-second clip with no instruction. Prefer creators with a track record (Barbell Medicine, Squat University, Renaissance Periodization, Juggernaut, university strength programmes, national governing bodies).

### 5.2 Effort estimate (honest)

At a sustainable ~25 curated links/hour including verification, **6,000 links ≈ 240 hours**. That's one focused contractor-month, or a spread effort across a release cycle. **This is real budget and it must be planned, not absorbed.**

### 5.3 Keeping them alive

- **`link-pack.json`** — versioned, separate from code, updatable without an app release.
- **Monthly CI link check.** Any 404/private/removed link raises an issue *before* a user finds it.
- **Two links per exercise means one death is never fatal** — the UI degrades to one link plus the resolver.
- **Deterministic search resolver** as the permanent floor: a canonical "find more demos" search URL for every exercise. Never rots, needs no API key.
- **Coach-supplied links** (`videoLinks[]`, exists since S11) always rank above ours — their own demo is the best possible link.
- **Optional link-pack updates** downloaded like a model. Never required; the app is fully functional offline with what ships.

---

## 6. Illustrations — still worth building

~220 scripted SVG animations, one per base pattern, generated from the joint-action data each pattern already declares.

- **Covers all 3,000 rows** (every exercise maps to a pattern), costs ~2 MB, is ours, works offline forever, never rots.
- Immune to link death — the *primary* visual, with video as the supplement.
- Localization-free (no text).
- Renders in print, in the Companion export, and on the TV workout display.

---

## 7. Performance — much easier now

3,000 rows is comfortable where 25,000 was a design constraint. Still worth doing properly:

| Concern | Approach |
|---|---|
| Bundle | ~3 MB gz shipped as a lazy asset, seeded to IndexedDB on first run (extends the S14 lazy-seed pattern) |
| Seed time | Chunked bulkAdd, target < 3 s |
| Search | Existing `lib/fuzzy.ts` likely survives; add an inverted index if the benchmark says so. Target < 50 ms. |
| Semantic search | Embeddings ([02](02-LOCAL-AI.md)) — now a *quality* upgrade, not a rescue |
| Rendering | Virtualized list (still worth it — 3,000 rows is plenty to jank a DOM) |
| Memory | Audit `toArray()` call sites regardless; the habit matters more than this number |

**Benchmark test in CI** with a hard fail on regression.

---

## 8. Sourcing — lawful and original

| Source | Licence | Use |
|---|---|---|
| **Free-Exercise-DB** | Public domain / MIT ✅ | Cross-check names, muscles, equipment |
| **wger exercise DB** | CC-BY-SA ✅ | Cross-reference (attribution; check share-alike before embedding text) |
| **Wikidata / Wikipedia anatomy** | CC-BY-SA ✅ | Muscle and joint reference |
| **NSCA *Exercise Technique Manual*** | © | **Reference only — read it, write our own words** |
| **ACSM / NSCA position stands** | © | Informs classification, never copied |
| **ExRx, MuscleWiki, competitor apps** | © | **Do not scrape, do not copy.** Research only. |

**Every description and cue is original work.** That's the legal requirement *and* the differentiator — the existing 277 entries already read better than any scraped database, and preserving that voice across 3,000 is exactly what makes this library the best available.

**Recommendation: hire a strength coach as a contract author.** ~2,700 new entries at a realistic 12–15/hour of genuine quality is ~200 hours of subject-matter writing. Doing this with a credentialed CSCS (credited in-app) is both better content and better marketing than doing it ourselves.

---

## 9. Build order

| Step | Work | Effort |
|---|---|---|
| 1 | Author ~220 base patterns to final quality | High — the foundation |
| 2 | Schema + tag vocabulary + relationship graph fields | Low |
| 3 | Move modifiers from library rows to `SetPrescription` | Medium — touches the builder and logger |
| 4 | Author the ~3,000 entries (contract SME + review) | **Highest — plan real budget** |
| 5 | Relationship graph (regressions/progressions/substitutes) | Medium — do it *during* authoring, not after |
| 6 | SVG illustration system (~220) | Medium-high |
| 7 | Link curation (6,000) + CI checker + resolver | **High — ~240 hours** |
| 8 | Search, index, virtualization, benchmarks | Medium |
| 9 | Localization via pattern composition ([07](07-PLATFORM.md) §1.4) | Medium |

**Steps 4 and 7 are the schedule.** Everything else is ordinary engineering; those two are content production and need to be resourced explicitly or they will silently become the critical path.
