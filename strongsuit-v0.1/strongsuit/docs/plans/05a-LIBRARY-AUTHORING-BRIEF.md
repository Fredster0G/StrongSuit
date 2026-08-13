# 05a — Exercise library authoring brief

> ## 📌 PINNED — DEFERRED WORK, NOT STARTED
>
> **This is a self-contained brief for a future AI (or human) session to author
> the ~3,000-entry exercise library.** Caleb has explicitly deferred it
> (2026-07-27) so the rest of the app can be built first.
>
> **Nothing here is built yet.** The schema and tooling land with the library
> work, not before — don't half-build them and leave a broken migration.
>
> **To pick this up:** read [05-EXERCISE-LIBRARY.md](05-EXERCISE-LIBRARY.md)
> for the reasoning, then this document for the exact contract.

---

## 1. The job in one paragraph

Author ~3,000 exercise entries at uniformly high quality — real description, 2–3 imperative coaching cues, 2–3 common faults, contraindications where they exist, and a relationship graph (easier/harder/substitute) — plus curate exactly two verified demonstration links each. The existing 277 entries in `src/db/seed/exercises*.ts` set the voice and quality bar. **Match them; don't dilute them.**

---

## 2. Non-negotiables

1. **Original writing only.** Never copy descriptions or cues from ExRx, MuscleWiki, NSCA manuals, or any competitor app. Read them, understand the movement, write our own words. This is both a legal requirement and the product's differentiator.
2. **Imperative coaching voice.** *"Brace before you descend."* Not *"The lifter should brace."* Compare against the existing seed rows.
3. **No filler.** If an entry can't justify 2 real cues and 2 real faults, it probably shouldn't be a separate entry.
4. **Every claim must be defensible** to a CSCS reading over your shoulder.
5. **Contraindications are not medical advice.** *"Avoid if overhead pressing reproduces shoulder pain — refer out"* is fine. Diagnosing is not.
6. **No exercise gets zero links.** Two verified, or one verified plus the resolver fallback.

---

## 3. Target composition (~3,000)

| Group | Count |
|---|---|
| Core barbell / dumbbell / kettlebell | ~700 |
| Machine & cable *(deliberately deep — competitors are thin here)* | ~550 |
| Bodyweight & calisthenics *(full progression ladders)* | ~350 |
| Olympic lifting & derivatives *(full teaching progressions)* | ~180 |
| Plyometric / power / jumps / throws | ~180 |
| Conditioning & cardio modalities | ~200 |
| Mobility, activation, warm-up | ~300 |
| Core & anti-rotation | ~220 |
| Rehab / prehab / corrective *(referral-framed)* | ~180 |
| Sport-specific drills *(tied to training tracks)* | ~140 |

**Author base patterns first (~220).** Every entry maps to one; they carry the shared illustration and the "show me alternatives" behaviour.

---

## 4. The schema to author against

```ts
interface Exercise {
  id: string                        // ULID, generated
  name: string                      // canonical, title case
  aliases: string[]                 // lowercase, what people actually type
  basePatternId: string             // REQUIRED — every entry maps to a pattern
  category: ExerciseCategory
  primaryMuscles: MuscleId[]        // controlled vocabulary, 1–3
  secondaryMuscles: MuscleId[]      // 0–4
  equipment: EquipmentId[]          // controlled vocabulary
  tags: TagId[]                     // controlled, ~180 — see §5
  description: string               // 2–4 sentences. What it is, what it trains, when to use it.
  cues: string[]                    // 2–3, imperative
  commonFaults: string[]            // 2–3
  contraindications?: string[]      // only where genuinely warranted
  setup?: string[]                  // step-by-step for unfamiliar movements
  tracking: TrackingType            // weight_reps | reps | time | distance | …
  difficulty: 1 | 2 | 3 | 4 | 5
  unilateral: boolean
  plane: 'sagittal' | 'frontal' | 'transverse' | 'multi'
  links: ExerciseLink[]             // exactly 2 — see §6
  regressions: ExerciseId[]         // easier — THE highest-value field
  progressions: ExerciseId[]        // harder
  substitutes: ExerciseId[]         // same stimulus, different equipment
  trackAffinity: TrackId[]          // which training tracks surface this
  filmRoomPreset?: EquipmentPresetId // occlusion handling — see 04-FILM-ROOM-V2 §2
  isCustom: false
}
```

**`regressions` / `progressions` / `substitutes` are the most valuable fields in the schema.** *"My client can't do a pull-up"* and *"the leg press is taken"* are daily coaching problems. Build the graph **while authoring**, not as a later pass — retrofitting it across 3,000 entries is far more expensive.

---

## 5. Controlled vocabularies

Define these **before** authoring begins; ad-hoc strings will make the library unsearchable:

- **Muscles** — anatomical names, ~60 entries, mapped to a body-region grouping
- **Equipment** — ~45
- **Tags** — ~180: goal · experience · setting (home/hotel/full gym/outdoor/minimal) · time cost · **joint-friendliness** (knee-/shoulder-/low-back-/hip-/wrist-friendly) · position · impact · skill demand · warm-up/main/accessory suitability · compound vs isolation · sport affinity · youth-appropriate · masters-appropriate · pregnancy-appropriate *(referral-gated)* · equipment-substitutable
- **Base patterns** — ~220
- **Training tracks** — ~45, from [03-SCIENCE-ENGINES.md](03-SCIENCE-ENGINES.md) §5

Ship each as a typed const with a test asserting no entry references an unknown id.

---

## 6. Link curation standard

Two links per exercise, complementary, **from different creators** so one death never orphans an entry:

| Slot | Purpose |
|---|---|
| 1 — Technique | Clear demonstration, correct camera angle for the movement's key plane |
| 2 — Coaching depth | Cues, faults, or the "why" |

**Accept:** credible source (recognised coach, university, governing body) · clear angle · no paywall · no ad-wall · stable channel with history.
**Reject:** 30-second clips with no instruction · anything behind a login · channels with no track record · videos demonstrating technique we'd flag as a fault.

Stored in a versioned `link-pack.json`, **separate from code**, so links can be updated without an app release. A monthly CI job re-checks every URL.

**Effort:** ~25 curated links/hour including verification → **~240 hours for 6,000.** Budget it explicitly.

---

## 7. Suggested working method for whoever picks this up

1. Author the ~220 base patterns to final quality. Everything inherits from them.
2. Lock the controlled vocabularies. Add the id-validation test.
3. Author in **base-pattern batches**, not alphabetically — all rows for one pattern together keeps voice and the relationship graph coherent.
4. Build `regressions`/`progressions`/`substitutes` within each batch as you go.
5. Curate links per batch, immediately after authoring that batch.
6. **Review gate every batch** against §2 before moving on. A 3,000-entry library with drifting quality is worse than 1,500 consistent ones.
7. Run the id-validation, duplicate-name, and link-check tests continuously.

---

## 8. Lawful sources

| Source | Licence | Use |
|---|---|---|
| Free-Exercise-DB | Public domain / MIT ✅ | Cross-check names, muscles, equipment |
| wger exercise DB | CC-BY-SA ✅ | Cross-reference *(attribution; check share-alike before embedding text)* |
| Wikidata / Wikipedia anatomy | CC-BY-SA ✅ | Muscle and joint reference |
| NSCA *Exercise Technique Manual* | © | **Reference only — write our own words** |
| ACSM / NSCA position stands | © | Informs classification, never copied |
| ExRx, MuscleWiki, competitor apps | © | **Do not scrape, do not copy.** Research only. |

---

## 9. Done means

- [ ] ~220 base patterns authored and reviewed
- [ ] Controlled vocabularies locked, id-validation test green
- [ ] ~3,000 entries authored, every one passing the §2 quality bar
- [ ] Relationship graph complete — no orphan with zero regressions *and* zero substitutes
- [ ] 6,000 links curated and verified; CI link checker green
- [ ] Seed performance: < 3 s, benchmarked in CI
- [ ] Search: < 50 ms keystroke-to-results, benchmarked in CI
- [ ] Localization: base patterns + modifier vocabulary translated ([07-PLATFORM.md](07-PLATFORM.md) §1.4)
