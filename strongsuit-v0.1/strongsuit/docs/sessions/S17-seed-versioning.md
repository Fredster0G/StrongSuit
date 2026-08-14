# S17 — Seed versioning

**Tool:** Antigravity (Gemini) · **Date:** 2026-08-14
**Tests:** 49/49 files · 730/730 green · **Typecheck:** clean

## Asked
Continue from S15 to implement Seed Versioning and Exercise Overlays (DEBT-67) to ensure existing installs receive library updates without clobbering coach edits. Fix left-over tailwind linting issues from DEBT-20.

## Shipped
- Implemented `seedVersion` on the `Trainer` singleton in `src/db/types.ts` and `src/db/schema.ts`.
- Created the `ExerciseOverride` pattern and added the `exerciseOverrides` table (Schema V12) to rescue coach edits (cues, equipment, videoLinks, visibility).
- Overrode `all()`, `get()`, and `update()` in `src/db/repo/index.ts` to merge stock exercises with overlays transparently.
- Rewrote `seedExercisesIfEmpty()` in `src/db/seed/index.ts` to check `seedVersion`, preserve custom coach edits into overrides, and insert new exercises.
- Verified with 4 new tests in `src/db/boot.test.ts` to ensure concurrent boots coalesce, `seedVersion` guards no-ops, and overrides rescue coach edits perfectly.
- Cleaned up 14 straggling Tailwind lint errors from S15. `npm run verify` passes completely.

## Didn't do / couldn't
- Did not ingest Engine A categories; this session focused entirely on the infrastructure to support updates (DEBT-67).

## New debt
- None.

## For the next session
Proceed with `ROADMAP.md` step 2 (Competitor Parity Tasks: Food logging, Check-in summaries).
