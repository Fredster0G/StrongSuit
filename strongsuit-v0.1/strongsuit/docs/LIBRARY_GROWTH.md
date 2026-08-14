# LIBRARY GROWTH — 277 → 3,000, for $0, legally

Extends `docs/plans/05-EXERCISE-LIBRARY.md` §8, which is legally sound but budgets **~200 paid hours of
contract CSCS authoring**. This document answers the different question Caleb actually asked: *how do we
fill the library for free, stay legally clean in a commercial SaaS, and let coaches customize it?*

> Not legal advice. The principles below are well-established, but if this ever becomes a real business
> asset, a one-hour IP-attorney review of this page is cheap insurance.

---

## 1. The legal line, stated once

**Facts and procedures are not copyrightable. Specific expression is.** (17 U.S.C. §102(b).)

| This is free to use | This is not |
|---|---|
| That a back squat exists, and its name | Someone's *photo* or *video* of a back squat |
| Which muscles it trains, what equipment it needs | Someone's particular *phrasing* of cues |
| The mechanical sequence of performing it | A curated *selection and arrangement* (compilation copyright) |
| Classification: hinge/squat/push/pull, force, level | A database you copied wholesale, even of facts |

**The operating rule: take the facts from anywhere, write the words yourself.** That is both the legal
requirement and the reason the existing 277 entries read better than any scraped database.

### Three traps specific to exercise libraries

1. **CC-BY-SA is copyleft, and it bites commercial SaaS.** wger and Wikipedia are CC-BY-SA. Incorporating
   their *text* can obligate you to license your derived database under CC-BY-SA too. Use them for
   cross-*reference* only — never paste. (`05` §8 already says this; it matters more now that we sell a
   subscription.)
2. **Trademarked equipment names.** *Bosu, TRX, Hammer Strength, Keiser, Peloton, StairMaster* are
   trademarks; *Smith machine* and *barbell* are generic. Prefer the generic ("suspension trainer",
   "plate-loaded chest press"), or use nominative reference ("TRX-style"). Never imply endorsement.
   Cheap to get right up front, expensive to fix across 3,000 rows.
3. **Video: link, never host, never hot-link.** The existing link model is already correct. Official
   YouTube/Vimeo embeds are permitted by their ToS. Scraping the underlying media file is not. Do not
   change this.

---

## 2. The free path — four engines, stacked

### Engine A — import the public-domain factual scaffold ⏱️ days
**[Free Exercise DB](https://github.com/yuhonas/free-exercise-db)** — ~873 exercises, **Unlicense
(public-domain dedication)**. The cleanest license available: no attribution required, commercial use
explicit, no share-alike.

Import the **facts** (name, level, force, mechanic, equipment, primary/secondary muscles) as scaffolding
rows. **Rewrite every cue and description in our own voice** — not for legal reasons here (Unlicense
permits copying) but because their prose is mediocre and the whole differentiator is that ours isn't.

**277 → ~1,000 in one automated pass.** This is the single highest-leverage step in this document.

*Acceptance: schema-valid, deduped against existing 277 by normalized name + equipment, every imported
row flagged `needsAuthoring: true` until its prose is written.*

### Engine B — taxonomy composition ⏱️ weeks, mostly automated
The project's own documented design (`05` §3, `07` §1.4): **~220 base patterns × a controlled modifier
vocabulary**, composed into thousands of rows.

This is **100% original work** — zero legal exposure, zero sourcing cost — and it's the only approach
that also solves localization (translate ~400 strings instead of 3,000 hand-translated names). Compose
`{grip} {stance} {implement} {pattern} {tempo-or-range qualifier}` from a curated vocabulary; each
composed row inherits its pattern's illustration and relationship graph.

**Guardrail:** composition can generate nonsense ("seated barbell sprint"). Every pattern needs an
allow-list of legal modifiers, and the generator must refuse combinations outside it. Test this.

### Engine C — AI-authored prose, SME-reviewed ⏱️ ongoing
This replaces the ~200 contract hours. Legitimate, with real limits:

- ✅ **Good for:** mainstream barbell/dumbbell/machine/bodyweight entries, where the mechanics are
  uncontroversial and the existing 277 entries provide a strong voice exemplar to match.
- 🔴 **Do NOT ship AI-authored without human review:** rehab/prehab/corrective (~180), Olympic lifting
  progressions (~180), and anything with contraindications. These are **safety-critical** and a
  confidently wrong cue can injure someone. Flag them `requiresReview: true` and gate them out of the
  shipped seed until a credentialed human signs off.
- Generate in batches of ~100 against the voice/quality bar in `05a-LIBRARY-AUTHORING-BRIEF.md`, with a
  schema test per batch.

### Engine D — coach contributions ⏱️ ongoing, compounding
**Already designed and unbuilt.** `06-EDITIONS-PRICING.md` §4.6 specifies community contribution credits:
submit an exercise that passes review → credit + in-app attribution. Coaches value credited authorship in
a tool their peers use more than a discount.

This turns the library from a cost center into a moat that grows while you're in class. **Build the
submission + review queue once Engine A lands** — it needs a real library to contribute *to*.

---

## 3. Coach modifications — and a real bug in the way

**⚠️ Finding: growing the seed does nothing for existing users today.** `seedExercisesIfEmpty()` is
idempotent on *emptiness* — it seeds only when the table is empty. Every install that already booted will
**never receive new exercises**, no matter how many we author. Fixing this is a prerequisite for
Engines A–D to have any value to existing coaches, not a nice-to-have.

What's needed:

| Need | Design |
|---|---|
| **Seed updates reach existing installs** | Version the seed (`seedVersion` on `Trainer`). On boot, merge-upsert rows whose `seedVersion` is newer. Never touch `isCustom` rows. |
| **Coach edits survive updates** | Store coach changes as an **overlay**, not an in-place edit: `ExerciseOverride { exerciseId, cues?, name?, videoLinks?, hidden? }`. Reads merge stock + override. A seed update replaces the stock layer and leaves the override untouched. This is the whole ballgame — in-place edits *will* get clobbered. |
| **Coach's own exercises** | Already exists (`isCustom: true`). Keep it; never merge-upsert over it. |
| **Hide what they don't use** | `hidden` on the override — a coach with no machines shouldn't scroll past 550 machine entries. Mirrors the existing `hiddenModules` pattern. |
| **Their cues, their voice** | Override `cues` while keeping the stock entry's relationships and illustration. |
| **Travels with them** | Include overrides in backup/restore and `db/portability.ts`. |

---

## 4. Order of work

| # | Step | Routing | Unblocks |
|---|---|---|---|
| 1 | **Seed versioning + `ExerciseOverride` overlay** | 🟦 Claude | Everything. Without this, new content never reaches existing coaches. |
| 2 | **Engine A import** (~873 public-domain rows) | 🟨 Gemini | 277 → ~1,000 immediately |
| 3 | **Rewrite imported prose** in batches of 100 | 🟨 Gemini | Quality bar, `needsAuthoring: false` |
| 4 | **Engine B generator** + modifier allow-lists + tests | 🟦 Claude | Scale to 3,000, and localization |
| 5 | **Engine C batches** for mainstream groups only | 🟨 Gemini | Depth |
| 6 | **Coach override UI** (edit cues, hide, custom) | 🟨 Gemini | The customization ask |
| 7 | **Engine D** submission + review queue | 🟨 Gemini | Compounding, free |
| 8 | Safety-critical groups | 🟥 Human SME | The 360 entries AI must not ship alone |

**Until step 3 completes, stop printing "3,000-exercise curated library."** Say the real number.
