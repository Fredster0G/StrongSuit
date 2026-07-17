import type { CapacitorConfig } from '@capacitor/cli'

// Android wrapper for Coachwright (spec §9, docs/ANDROID_STRATEGY.md).
// webDir points at the same Vite build the desktop/web app ships — Capacitor
// bundles it into the app's assets and renders it in a native WebView, so
// there is no second UI to maintain. Zero network at runtime still holds:
// the WebView loads local files, not a remote URL.
const config: CapacitorConfig = {
  appId: 'com.coachwright.app',
  appName: 'Coachwright',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
