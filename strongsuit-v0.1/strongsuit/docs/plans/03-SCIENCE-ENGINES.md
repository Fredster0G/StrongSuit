# 03 — Science engines v2: nutrition, readiness, cycle, tracks

**Standing rule (from v1, keep it):** *no number without its reasoning.* Every output carries a plain-language rationale and a citation the coach can show a client.

---

## 1. Where v1 stands

| Engine | Today | Verdict |
|---|---|---|
| `lib/nutrition.ts` (240 ln) | Mifflin-St Jeor → activity factor → goal adjust → protein/fat/carb/fibre/water, each cited. Carb cycling + diet-break advice. | **Good foundation.** Correct equations, honest sources. Too coarse for athletes. |
| `lib/readiness.ts` (64 ln) | 4 inputs (sleep h, energy, mood, adherence), fixed weights, 0–100 + band. | **Too thin.** No training load, no HRV, no trend, no individual baseline. This is the one to rebuild. |
| `lib/progression.ts` | Linear / double-progression / RPE policies | Solid; extend with velocity + fatigue gating |
| `lib/metricPresets.ts` | 4 cited testing batteries | Extend per training track |

---

## 2. Nutrition v2

### 2.1 Better energy estimation

Mifflin-St Jeor is right for the general population and **wrong for lean, muscular athletes** (it doesn't know body composition). v2 picks the best equation for the data available:

| Available data | Equation | Source |
|---|---|---|
| Height/weight/age/sex only | **Mifflin-St Jeor** (current) | Mifflin 1990; Frankenfield 2005 |
| **Body fat % known** | **Katch-McArdle** (FFM-based) | Katch & McArdle |
| Lean athlete, FFM known | **Cunningham** | Cunningham 1980 |
| Any | Show the spread + which was used and why | — |

Plus **adaptive calibration**: after 3+ weeks of logged weight and (optionally) intake, back-calculate the client's *actual* TDEE from energy balance rather than trusting a formula. This is what elite practice actually does — the equation is a starting estimate, the scale is the truth.

### 2.2 Energy Availability + RED-S screening ← **the most important addition**

**Energy Availability** `EA = (intake − exercise energy expenditure) / FFM (kg)`

| EA | Meaning |
|---|---|
| ≥45 kcal/kg FFM | Optimal |
| 30–45 | Reduced — acceptable short-term for fat loss |
| **<30** | **Low EA — the RED-S threshold.** Endocrine, bone, immune consequences. |

Sources: De Souza et al. 2014 (Female Athlete Triad Coalition); **Mountjoy et al. 2023 IOC consensus on Relative Energy Deficiency in Sport (REDs)**; Loucks 2011.

This turns the nutrition tab from a calculator into a **safety instrument**. If a coach sets a deficit that drives EA below 30, the app says so, cites the consensus, and explains the risk. No competitor does this well, and it's the single most defensible "we use the best research" feature in the plan.

Ships with the **LEAF-Q** and **RED-S CAT**–style screening prompts as an optional questionnaire, clearly framed as screening, not diagnosis.

### 2.3 Protein — distribution, not just a daily total

Current: 1.6–2.2 g/kg/day. Correct but incomplete.

| Refinement | Rule | Source |
|---|---|---|
| Per-meal dosing | 0.4–0.55 g/kg per meal × 4 meals | Schoenfeld & Aragon 2018 (JISSN) |
| Older adults (40+) | Raise to ~0.40 g/kg/meal minimum — anabolic resistance | Moore et al. 2015 |
| Energy deficit | Top of range, 2.3–3.1 g/kg **FFM** | Helms et al. 2014 |
| Plant-based | +10–20% total; attend to leucine | Rogerson 2017; Pinckaers 2023 |
| Pre-sleep | 30–40 g casein-type where relevant | Snijders et al. 2019 |

### 2.4 Carbohydrate periodization — "fuel for the work required"

Replaces a flat daily carb number with **per-day targets driven by the day's actual training**:

| Session load | Carbs (g/kg/day) | Source |
|---|---|---|
| Rest / technique | 3–5 | Burke et al. 2011; ACSM/AND/DC 2016 |
| Moderate (~1 h) | 5–7 | " |
| High (1–3 h) | 6–10 | " |
| Very high (>3 h) | 8–12 | " |

Plus intra-session guidance (30–60 g/h; up to 90 g/h with multiple transportable carbohydrates for >2.5 h — Jeukendrup 2014) and deliberate **train-low** sessions where appropriate (Impey et al. 2018).

**This is where the app becomes genuinely useful for endurance athletes** — the current model has nothing for them.

### 2.5 Hydration, micronutrients, supplements

- **Hydration by measured sweat rate** (pre/post weight + fluid intake), not a flat 3.7 L — ACSM 2007; Sawka 2007. Sodium 460–1,150 mg/L guidance.
- **Micronutrients of concern**, surfaced only when a risk flag is present: iron (menstruating and endurance athletes — Sim et al. 2019), vitamin D (Owens 2018), calcium (bone/RED-S), B12 (plant-based).
- **Supplements — only the four with strong evidence**, each with dose, timing, and effect size: creatine monohydrate (Kreider et al. 2017 ISSN), caffeine (Guest et al. 2021 ISSN), beta-alanine (Trexler 2015 ISSN), nitrate/beetroot (Jones 2018). Everything else is explicitly listed as *insufficient evidence* — refusing to recommend is a feature.

### 2.6 Diet breaks, refeeds, recomposition
Peos et al. 2019 (intermittent dieting); Trexler et al. 2014 (metabolic adaptation); Barakat et al. 2020 (recomposition conditions). Extends the existing `dietBreakAdvice`.

---

## 3. Readiness v2 — the rebuild

The current 4-input weighted average is a reasonable v1. Elite practice is **multi-domain, individually baselined, and trend-aware**. Rebuild as `lib/readiness/` with composable, independently-cited signals.

### 3.1 Domains

| Domain | Inputs | Method | Source |
|---|---|---|---|
| **Subjective wellness** | Sleep quality/duration, fatigue, soreness, stress, mood | 5-item Hooper-style index, **z-scored to the individual's own 28-day baseline** | Hooper & Mackinnon 1995; McLean 2010 |
| **Internal load** | Session RPE × duration | sRPE load; 7-day acute vs 28-day chronic | Foster 1998; Bourdon et al. 2017 (IJSPP consensus) |
| **Monotony & strain** | Daily load SD | Monotony = mean/SD; Strain = load × monotony | Foster 1998 |
| **ACWR** | acute/chronic | Reported **with its caveats** — see §3.3 | Gabbett 2016; Impellizzeri 2020 (critique) |
| **HRV** *(optional)* | rMSSD / lnRMSSD from a wearable export | 7-day rolling mean vs individual smallest worthwhile change | Plews et al. 2013; Buchheit 2014 |
| **Sleep** | Duration + regularity | Regularity weighted alongside duration | Halson 2014; Walker 2017 |
| **Neuromuscular** *(optional)* | CMJ height, grip | % change vs baseline | Claudino et al. 2017 |
| **Cycle** *(optional)* | Symptom burden only — §4 | Symptom-driven, not phase-driven | §4 sources |

### 3.2 The output

Not a single mystery number. A **score + the driver + the recommendation**:

```
Readiness  62 / 100   ▼ down from 78

  Sleep      −1.8 SD below your baseline     ← main driver
  Soreness    2.1 SD above baseline
  Load        7-day load 34% above your 28-day average
  HRV         within normal range

  Suggested: keep today's session, cap top sets at RPE 7.
  Two low-readiness days in a row → consider a deload week.
```

**Individual baselines are the key upgrade.** A 6-hour sleeper who always sleeps 6 hours isn't under-recovered. Population thresholds are why most readiness scores feel wrong; z-scoring to the person's own history fixes it. Requires ~14 days of data — until then the app says *"still learning your baseline"* rather than showing a confident wrong number.

### 3.3 Where we must be careful — ACWR

ACWR is the most-cited and **most-criticized** metric in this space. Impellizzeri et al. (2020) and Lolli et al. (2019) identified real mathematical problems (spurious correlation, ratio artefacts). Recent work is much more cautious than the 2016 headlines.

**Our position:** report ACWR because practitioners expect it, **using EWMA rather than rolling averages** (Williams et al. 2017), and label it as *one contextual signal, not a risk prediction*. Never say "you are at high injury risk." Say "your load has risen faster than usual."

That honesty is exactly what "only the best research" requires — the best research says be careful with this metric.

---

## 4. Menstrual cycle & hormonal context

### 4.1 What the evidence actually supports

You asked for only world-class evidence. Here is what it says, including where it's inconvenient:

| Claim | Evidence | Verdict |
|---|---|---|
| Performance varies meaningfully by cycle phase | **McNulty et al. 2020** (Sports Med, meta-analysis): trivial mean differences, **low-quality** evidence, extreme heterogeneity | ❌ Not supportable |
| Training should be periodized to cycle phase | **Colenso-Semple et al. 2023**: current evidence does not support phase-based prescription | ❌ Not supportable |
| Symptoms meaningfully affect training on some days | Strong, consistent, high prevalence | ✅ Supportable |
| Heavy menstrual bleeding → iron deficiency → performance | **Bruinvels et al. 2016/2021**; Sim et al. 2019 | ✅ Supportable |
| Hormonal contraceptives materially change performance | **Elliott-Sale et al. 2020** meta: negligible/small | ✅ Supportable (as reassurance) |
| Cycle disruption is a RED-S warning sign | Mountjoy et al. 2023; De Souza 2014 | ✅ **Important** |

### 4.2 So what we build

**Not** "train heavy in your follicular phase." That would be selling a claim the literature doesn't support.

**Instead:**
1. **Optional cycle logging** — period start/end, flow, and a symptom checklist (cramps, fatigue, sleep disruption, GI, headache, mood, breast tenderness).
2. **Symptom-driven autoregulation** — symptoms feed the readiness score *as symptoms*, exactly like any other subjective input. Personal, evidence-honest, immediately useful.
3. **Personal pattern surfacing, clearly labelled as n=1** — *"over your last 6 cycles, you've reported high fatigue in the 3 days before your period. Worth planning around."* That's the client's own data, not a population claim.
4. **Iron screening prompt** with heavy bleeding (Bruinvels).
5. **Cycle-disruption flag** — 3+ missed/irregular cycles alongside low EA → surface the REDs consensus and recommend referral. **A genuine safety feature.**
6. **Contraceptive context** so expectations are set correctly.
7. **Pregnancy/postpartum:** out of scope for programming. Flag → hand off to a qualified specialist (ACOG guidance referenced). Refusing to program here is correct.

### 4.3 The honest in-app framing

> **Cycle tracking**
> Research doesn't currently support training differently based on cycle phase —
> the studies disagree and most are small. What *is* well supported is that
> symptoms vary, and that they affect training on the days they show up.
> So we track how you actually feel and adjust from that, rather than from
> a calendar. [Read the research →]

That paragraph is a competitive advantage. Everyone else overclaims here.

### 4.4 Also model (same "optional context" mechanism)

Menopause/perimenopause (symptom-driven, resistance-training emphasis — Mishra 2011); masters athletes (recovery + protein — Fell & Williams 2008); youth (Lloyd & Oliver LTAD 2012; Faigenbaum 2009 — **no maximal loading before skeletal maturity**); return-to-play (criterion-based, not time-based — Ardern 2016); chronic conditions (screening + referral, never prescription).

### 4.5 Privacy — non-negotiable

Cycle and symptom data is **special-category health data** under GDPR Art. 9 and comparable regimes.

| Rule | Implementation |
|---|---|
| **Local-only by default** | Never enters a sync payload unless the client explicitly opts in, per-field |
| **Client-owned** | It's logged in Companion by the client. A coach sees only what the client shares — default is an aggregate readiness contribution, **not** raw symptoms |
| **Separately deletable** | One button wipes cycle data without touching training history |
| **Never in a backup shared with a coach** | `db/portability.ts` must exclude it by default |
| **Explicit consent copy** | Plain language at enable time, revocable |

This is the highest-liability data in the app. Design it right before writing a line of it.

---

## 5. Training tracks & athlete labels

A **track** is a coherent bundle of defaults that reconfigures the app for who this person actually is.

```ts
interface TrainingTrack {
  id: string
  name: string
  family: 'strength' | 'physique' | 'endurance' | 'sport' | 'tactical' | 'health' | 'mixed'
  goals: GoalWeighting            // strength / hypertrophy / endurance / skill / body-comp
  progression: ProgressionPolicyId
  nutrition: NutritionTemplateId  // incl. carb periodization band
  readiness: ReadinessWeighting   // runners weight sleep+load; lifters weight soreness+NM
  metrics: MetricPresetId[]       // the testing battery that matters
  libraryFilter: LibraryQuery     // what surfaces first in the library
  cautions: string[]              // e.g. youth: no maximal loading
  sources: CitationId[]
}
```

### 5.1 The track catalogue (v2 launch set)

**Strength & power** — Powerlifting · Weightlifting · Strongman · General strength · Powerbuilding
**Physique** — Bodybuilding (offseason) · Contest prep · **Bulking** · **Leaning / cutting** · Recomposition · Beach/aesthetic
**Endurance** — 5K/10K · Half & marathon · Ultra · Trail · Cycling · Triathlon · Swimming · Rowing
**Field & court sport** — Football/soccer · Basketball · American football · Rugby · Baseball/softball · Tennis/racquet · Volleyball · Hockey
**Combat** — Boxing · MMA · Grappling/BJJ · Wrestling (+ weight-cut safety guardrails)
**Tactical** — Military/selection prep · Fire · Law enforcement · Occupational physical-ability tests
**Skill & lifestyle** — Climbing · Golf · Skiing/snowboarding · Dance · Calisthenics/gymnastics strength
**Health & longevity** — General fitness · Healthspan/longevity · Bone density · Weight management · Desk-bound/posture · Pre/post-natal *(referral-gated)* · Masters 50+ · Youth 8–17 *(guardrailed)* · Return-to-play *(referral-gated)*

**~45 tracks.** Each ships with cited defaults, not vibes.

### 5.2 Client labels (orthogonal, multi-select)

Tracks answer *what they're training for*. Labels capture *context*: Beginner/Intermediate/Advanced · In-season/Off-season/Pre-season/Peaking/Deload · Injury-limited (per-region) · Equipment-limited (home/hotel/full gym) · Time-limited (<30/45/60+ min) · Travelling · Plant-based · Pregnant/Postpartum · Masters · Youth · Contest date set.

Labels drive library filtering, program templates, and nutrition adjustments. A client can be `Marathon` + `Masters` + `Plant-based` + `Injury-limited: knee` and the app composes all four correctly — **that composition is the feature**, and it's what makes it feel like professional software rather than a template picker.

---

## 6. Liability & scope of practice

Extends the existing "not medical advice" posture:

- **Scope-of-practice guardrails** — the app must never appear to diagnose, treat, or prescribe for a medical condition. Nutrition output is framed as *general sports-nutrition guidance*, with jurisdiction-aware copy (dietitian scope differs by country/state).
- **Referral triggers** — RED-S indicators, cycle disruption, disordered-eating screening flags, pain/injury, pregnancy, chronic disease → a clear, non-alarming referral card.
- **PAR-Q+ gating** already exists; wire it to track selection so high-risk clients can't be assigned aggressive tracks without acknowledgement.
- **Audit trail** — a coach can show a client exactly which source drove any recommendation. Already the design; make it universal.

---

## 7. The citation corpus

One corpus, shared by the engines and the AI ([02](02-LOCAL-AI.md) §6). Inclusion criteria, strictly applied:

1. Peer-reviewed **position stand / consensus statement** from a recognised body (ACSM, ISSN, IOC, NSCA, AND, IAAF/WA, UEFA), **or**
2. Systematic review / meta-analysis in a ranked journal, **or**
3. A landmark primary study that a position stand itself relies on.

**Excluded:** blogs, coaching-certification course notes, single small trials without replication, anything paywalled that we can't lawfully quote, and any source whose conclusion isn't reproduced elsewhere.

Each entry: `id, title, authors, year, journal, doi, licence, redistributable, ourSummary, appliesTo[]`.

**Every engine constant traces to a corpus id.** Practically: `nutrition.ts`'s protein range stops being a comment and becomes `PROTEIN_RANGE.source = 'morton-2018'`, renderable in the UI and checkable by a test. That's the difference between *claiming* to be evidence-based and *being* auditable.
