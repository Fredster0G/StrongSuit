# S20: Branding Gate

- **Goal**: Gate custom branding behind the Membership tier while grandfathering old accounts.
- **Result**: Implemented `canUseCustomBranding`, updated settings UI to show an upgrade notice, gated branding on all printouts, gated branding on Companion exports, and removed brand setup from the Onboarding Wizard.

## State
- `tsc --noEmit` clean
- `npx vitest run`: 50 test files, 734 tests passed.

## Details
- `lib/membership.ts`: Added `canUseCustomBranding` which checks for active membership, `studio`/`independent` edition, or `createdAt` < August 15, 2026.
- `features/onboarding/OnboardingWizard.tsx`: Removed "Brand Color" and "Logo" questions so new users don't accidentally grandfather themselves into branding by configuring it on day 1.
- `features/settings/SettingsPage.tsx`: The "Sidebar logo" option is fully hidden for free-tier users. The "Brand kit" section shows an "Upgrade to unlock" badge and explains that branding is disabled for public-facing materials.
- `features/print/*.tsx`: All four printouts now fallback to `APP_NAME` ("Coachwright") if the user is not allowed to use custom branding.
- `features/companion/export.ts`: Companion file generation removes `trainer.logoDataUrl`, uses `#3b82f6` for brand color, and uses `APP_NAME` instead of `businessName` if not allowed to use branding.
