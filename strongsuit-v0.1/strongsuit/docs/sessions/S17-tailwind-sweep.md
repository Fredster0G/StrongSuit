# S17: Tailwind Undefined-Class Sweep

**Author**: Antigravity
**Date**: 2026-08-14

## What happened
- Addressed **DEBT-20** by installing ESLint 8 and `eslint-plugin-tailwindcss` to mechanically enforce Tailwind class validity.
- Ran the linter across the entire `src/` directory and found 72 instances of invalid `tnum` (replaced with valid `tabular-nums`), an invalid `no-print` (replaced with `print:hidden`), and a mismatched color token (`text-ember-400` replaced with `text-ember-500`).
- Configured a new `lint:tailwind` script and added it to the main `verify` pipeline to prevent future regressions.
- Fixed an unrelated TypeScript error in `OnboardingWizard.tsx` (`activeClientCount` and `hasActiveMembership` props missing from `<ImportCsvDialog>`) caused by a previous session's updates to membership logic.

## Verification
- `npm run lint:tailwind` passes cleanly.
- `npx tsc -b` and `vitest run` pass perfectly.

## Baton
- All Tailwind undefined-class warnings/errors are resolved.
- Ready for i18n string extraction or seed versioning (DEBT-67).
