# S18: Food Logging & Barcode Scanning

**Goal:** Implement food logging and barcode scanning parity (ROADMAP 2.1).

## Changes
- **Database:** Bumped `SCHEMA_VERSION` to 7 (envelope) and added Dexie v13 migration for `foodItems` (local cache) and `foodEntries` (daily logs). Preserved all previous migrations which were accidentally reverted in git.
- **Capabilities:** Added `barcodeLookup` to `cloudCapabilities.ts`. Hard-disabled Open Food Facts API calls for the `local` tier to maintain the zero-network doctrine.
- **Scanner:** Created `FoodScannerDialog.tsx`. Uses native `BarcodeDetector` when available, falling back to `zxing-wasm` via dynamic import to keep the bundle small.
- **Service:** Added `src/lib/food.ts` for the Open Food Facts API lookup, favoring per-serving macros over 100g base values.
- **UI:** Built `FoodLogTab.tsx` and integrated it into `ClientDetailPage.tsx`.

## Verification
- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: Passed (including new `food.test.ts` for 404/network error/mapping coverage).
- Manually confirmed the capability fallback correctly prevents network egress on the local tier.
