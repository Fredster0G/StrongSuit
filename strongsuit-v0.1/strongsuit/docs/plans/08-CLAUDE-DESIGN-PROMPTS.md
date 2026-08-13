# 08 — Claude Design prompts

Four self-contained prompts. **Prompt 0 first** (the design system) — the other three reference it, so running them in order keeps all three editions visually coherent.

Paste each as a single message. They're deliberately verbose: Claude Design produces far better work from constraints and reasoning than from a feature list.

---

## Prompt 0 — The design system

```
You are designing the design system for Coachwright, a professional coaching
platform that runs entirely on the user's own computer. Pay once, own it
forever, works with no internet connection, and no company can take it away.

I need a complete design system I'll then apply across three separate products.

WHO THIS IS FOR
Strength coaches and personal trainers. They use this standing on a gym floor
with chalk on their hands, and sitting at a desk on Sunday planning twelve
clients' weeks. It is a professional instrument, not a consumer fitness app.
Think Bloomberg Terminal or Ableton Live, not MyFitnessPal.

THE FEELING TO HIT
Precision instrument. Dense with information but never cluttered. Fast,
quiet, and confident. It should feel like a tool that respects the user's
expertise rather than one that congratulates them for showing up. No
gamification, no confetti, no motivational slogans, no gradients-for-the-sake-
of-gradients. The nearest reference points: Linear's density and keyboard
speed, Things' restraint, a Leica's material honesty.

EXISTING BRAND CONSTRAINTS — these are fixed, design within them
- Palette is monochrome-dominant with two accents used sparingly:
  · Ink (near-black #171A1E) and Porcelain (warm off-white #F7F6F3) carry the UI
  · Verde (deep green ~#1E8A6E) = primary action, positive, "on track"
  · Ember (warm orange ~#E2703A) = attention, caution, "needs a look"
  · Signal red — errors and destructive actions only
  · Iron greys for structure; a hairline rule is the primary divider
- Typography: Inter Tight (display/headings), Inter (UI), JetBrains Mono
  (all numbers — tabular figures are mandatory; coaches compare columns of
  numbers and misalignment is a real usability failure)
- Radii: 6px controls, 10px cards. Nothing rounder — this is an instrument.
- Motion doctrine: ONE easing curve everywhere, cubic-bezier(0.2, 0, 0, 1).
  Sharp, decisive, no bounce, no spring. Motion clarifies causality; it never
  decorates. Respect prefers-reduced-motion.
- The logomark is a barbell collar seen end-on whose negative space resolves
  into a hard "C". Always monochrome, never coloured.
- Full light and dark themes, both first-class. Many coaches work in dim gyms.

WHAT I NEED FROM YOU
1. Full colour system: semantic tokens (surface, surface-raised, ink, muted,
   faint, line, and the accents), light + dark, with contrast ratios stated.
   WCAG 2.2 AA minimum, AAA for body text.
2. Type scale with real line heights, optimised for dense tabular data.
3. Spacing and layout grid. A density toggle (comfortable/compact) that
   genuinely changes information density, not just padding.
4. Core components, in both themes and every state (default/hover/focus-
   visible/active/disabled/loading/error):
   buttons (primary/secondary/ghost/destructive), inputs, select, combobox,
   numeric stepper, toggle, checkbox, radio, slider, tabs, table (sortable,
   sticky header, virtualized), card, dialog, sheet, toast, tooltip,
   popover, command palette, empty state, skeleton, progress, badge/tag,
   avatar, segmented control, date/time picker, file drop zone.
5. Data-visualisation language: line, bar, area, sparkline, distribution,
   heatmap, and a "confidence band" treatment for values the system is
   uncertain about. Colourblind-safe. These are drawn as inline SVG, so
   keep them simple and legible at small sizes.
6. A "cited value" pattern. Nearly every number in this app carries a
   research citation and a plain-language rationale. I need a beautiful,
   non-intrusive way to show "this number, and why" — inline, expandable,
   printable. THIS IS THE SIGNATURE PATTERN OF THE PRODUCT; spend real
   effort here.
7. A "confidence" pattern: some measurements are certain, some estimated,
   some unmeasurable. Show the difference honestly without alarming anyone.
8. Iconography direction (line-based, 1.5–1.75px, 16/20/24px).
9. Focus-visible and keyboard-navigation treatment. This app is designed to
   be driven entirely from the keyboard.
10. RTL considerations (Arabic and Hebrew are launch languages).

DELIVER
A design-system page showing every token and component in both themes, plus
a one-page rationale explaining the decisions. Use real coaching content in
every example — real exercise names, real weights, real dates. Never lorem
ipsum, and never fake numbers that don't add up.
```

---

## Prompt 1 — Personal edition (phone-first)

```
Using the Coachwright design system, design "Coachwright Personal" — a
phone-first app for a person training themselves.

CONTEXT
It is free, runs entirely on the phone, and needs no account. Two kinds of
people use it: someone training alone who wants a serious training log, and
someone whose coach uses Coachwright and sent them here. Both must feel like
the app was built for them specifically.

CONSTRAINTS
- Phone-first. 375px is the design width; it must also work on a tablet.
- Thumb-reachable: primary actions in the bottom third. 44px minimum targets.
- Used mid-set, one-handed, sweaty, sometimes in bad light.
- Five bottom tabs maximum. Currently: Home, Log, Progress, Coach, Settings.
- Works fully offline. No account, no login, ever.
- Installs as a PWA — design the install prompt and the standalone experience
  including safe-area insets.

SCREENS I NEED
1. First run. No account. Must reach "logged my first set" in under 90
   seconds. Includes an honest hardware check offering optional on-device AI
   downloads — present this as capability, never as an upsell.
2. Home. Today's plan (from a coach or self-directed), readiness, one clear
   next action.
3. The logger. THE MOST IMPORTANT SCREEN. Entering a set must be near-
   instant one-handed between sets: previous performance visible, suggested
   next load, RPE, a rest timer, and a quick way to say "that felt heavy".
   Design the empty, mid-set, and set-complete states.
4. Exercise picker over a 3,000-exercise curated library. Search must feel instant
   and forgiving. Show filter chips, recents, and an "exercises like this"
   affordance. Include the animated-illustration and video-link treatment.
5. Progress. Bodyweight, measurements, lift progression, PRs. Honest about
   sparse data — most people log inconsistently, and the app must look
   right with three data points, not just thirty.
6. Film Room self-review. Record or pick a clip, see your own skeleton
   overlay, get reps/tempo/depth/symmetry. Must clearly show which
   measurements are confident and which were obscured by equipment. Include
   a strong privacy statement: the video never leaves the phone.
7. Nutrition targets. Calories and macros with the reasoning and citation
   behind each number, readable by a non-expert.
8. Optional cycle & symptom tracking. THIS NEEDS EXCEPTIONAL CARE. It is
   sensitive health data, entirely optional, stored only on the device.
   Design the consent moment, the daily logging (fast, low-friction, never
   nagging), and the personal-pattern view. Tone: matter-of-fact and
   medical-grade, never pink, never cute, never euphemistic. Include the
   honest disclosure that research does not support training differently by
   cycle phase, and that we track symptoms instead.
9. Coach tab. The message thread, the assigned program, and a genuinely
   clear sync status that never makes the user think about transports.
10. Settings. Units, language, theme, data export, optional AI modules,
    and an unmistakable "this is your data" section.

TONE
Second person, plain, respectful. "Your depth held steady across reps" —
not "Great job! 🔥". This person is an adult doing hard work.

DELIVER
Full flows for onboarding, logging a workout, and self-reviewing a clip.
Both themes. Show loading, empty, error, and offline states — not just the
happy path.
```

---

## Prompt 2 — Independent Trainer edition (desktop workstation)

```
Using the Coachwright design system, design "Coachwright for Independent
Trainers" — a desktop workstation for a solo coach running their whole
practice on their own computer.

CONTEXT
This is the paid flagship ($249 one-time, versus $600–1,200/year for
TrueCoach or Trainerize). It replaces a subscription, a spreadsheet, and
three other tools. The buyer is a working professional with 10–100 clients.

CONSTRAINTS
- Desktop-first, 1280px baseline, must stay usable down to 900px (the
  desktop app enforces a 900px minimum window).
- Information-dense. This user wants to see more, not less. Do not
  protect them from data.
- Keyboard-first: everything reachable via Ctrl+K or a shortcut.
- Fully offline. Optional encrypted sync the user controls.

SCREENS I NEED
1. Today. The daily driver: who trains today, who needs attention and why,
   what's unfinished. Must answer "what do I do right now" in one glance.
2. Client roster. 100+ clients, scannable, filterable, bulk-actionable,
   with an at-a-glance status per client (last session, adherence,
   readiness trend, connection state).
3. Client workspace. Ten tabs of depth (overview, coaching, program, logs,
   check-ins, metrics, nutrition, notes, messages, billing) without feeling
   like a filing cabinet. Solve the information architecture properly —
   this is the screen the coach lives in.
4. Program builder. THE HARDEST SCREEN. Weeks × days × blocks × exercises ×
   sets. Drag to reorder, spreadsheet-fast set entry, undo/redo, copy a week,
   apply a progression policy. Must work for a 3-day beginner plan and a
   16-week periodized block. Design the empty state, the "building" state,
   and the dense-full state.
5. Film Room. Two videos side by side or overlaid, independent transports,
   sync-lock, skeleton overlays, per-rep results, velocity-based-training
   readout, timestamped notes, snapshot export. Show confident vs. obscured
   measurements distinctly. This is the marquee feature — make it feel like
   professional video-analysis software.
6. The science surfaces: nutrition targets and readiness. Every number
   carries its rationale and citation. Design the "show me why" interaction
   so a coach can defend any recommendation to a client on the spot.
7. Business: profit planner, ledger, invoicing, expenses. Calm, precise,
   monospaced numbers. This is money — it must feel trustworthy.
8. Command palette (Ctrl+K). Not just navigation: actions, calculations,
   quick capture, natural-language search. Design results grouping, keyboard
   affordances, and the multi-step command flow.
9. Connection & sync. One page that makes "local vs. your server vs. our
   server" feel like one simple choice, plus honest per-client connection
   status. The user must never have to think about transports.
10. First run: system check, optional AI downloads, brand setup, importing
    an existing client roster from a competitor's CSV.

CRITICAL PATTERN
Every computed recommendation shows its source. Design this so it is
elegant and always available but never in the way — it is the core of the
product's credibility.

DELIVER
Full flows for: onboarding + importing a roster, building a program from
scratch, running a Film Room analysis, and a Monday-morning "who needs me"
triage. Both themes. Include realistic dense data — 60 clients, a 12-week
program, three years of logs.
```

---

## Prompt 3 — Studio edition (multi-seat business)

```
Using the Coachwright design system, design "Coachwright Studio" — the
multi-seat edition for gyms and training studios with 2–50 staff.

CONTEXT
Sold per seat ($199/seat, minimum 3). The buyer is an owner or manager; the
daily users are trainers and front-desk staff. It is the Independent
edition plus everything a multi-person business needs. Same design language,
same density, additional structure.

WHAT'S NEW VERSUS THE INDEPENDENT EDITION
- Multiple staff with roles: Owner, Manager, Trainer, Front desk
- A shared client roster: clients belong to the business, assigned to
  trainers, handed over when staff change
- A "Studio Hub" — one machine (or our managed cloud) that is authoritative
  for the business; staff devices sync to it over the local network when in
  the building and over the internet when not
- Commission and payroll reporting per trainer
- Multiple locations
- Consolidated business reporting
- An audit log (who changed what)
- Leaderboards, challenges, TV workout mode for the gym floor

SCREENS I NEED
1. Owner dashboard. Business health at a glance: revenue, retention,
   utilisation, per-trainer performance, capacity. Executive clarity — this
   person has 30 seconds.
2. Trainer's own view. The SAME app, scoped to their clients. A trainer
   must never feel like they're using a watered-down product, and must
   never see another trainer's commission.
3. Front desk. Check-ins, bookings, payments. Optimised for speed and
   interruption — this person is talking to a human while using it.
4. Staff management. Add, assign roles and seats, set commission, handle a
   departure. Design the client-handover flow with care: it must be
   obviously safe and reversible, because it moves someone's livelihood.
5. Shared roster with assignment, filtering by trainer, and transfer.
6. Locations.
7. Commission & payroll reporting.
8. Studio Hub setup and health. Make a distributed system legible to a gym
   owner who is not technical: what's connected, what's syncing, what needs
   attention. If something is wrong, say what to do about it.
9. Audit log. Scannable, filterable, and reassuring rather than
   surveillance-flavoured.
10. Multi-person Film Room for group and class filming.
11. TV workout mode — full-screen, legible across a gym floor, high
    contrast, no chrome.
12. Studio onboarding: set up the business, add locations, invite staff,
    import an existing roster from gym-management software.

DESIGN TENSION TO RESOLVE
Studio must feel like more capability, not more bureaucracy. Every added
structure has to earn its place. A trainer's daily experience should be
identical to the Independent edition — the multi-seat machinery should be
invisible to them and only visible to the owner and manager.

DELIVER
Full flows for: studio setup and inviting staff, a client handover between
trainers, and an owner's Monday morning review. Show the role-based
differences explicitly — the same screen as Owner, Manager, and Trainer.
Both themes.
```

---

## Notes on running these

1. **Prompt 0 first.** Save its output; paste the token/component summary into the top of Prompts 1–3 so all three stay coherent.
2. **Feed it real content.** Real exercise names, plausible loads, real dates. Fake data produces fake-looking design, and this product's credibility lives in its numbers.
3. **Ask for the unhappy paths explicitly** if it only returns happy ones — empty, loading, error, offline, and "still learning your baseline" are where professional software is actually distinguished from a demo.
4. **The "cited value" pattern (Prompt 0, item 6) is the highest-leverage single thing here.** It's the visual expression of the entire product philosophy. If only one thing gets iterated to excellence, make it that.
5. **Don't let it consumer-ify Personal.** The temptation will be streaks, badges, and celebration. Push back — the same restraint that makes the coach product feel professional is what makes the free product feel trustworthy.
