import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// PWA support (manifest + service worker) is hand-rolled rather than via
// vite-plugin-pwa — that plugin's latest release caps its Vite peer dep at
// ^6, and this project is on Vite 8 (same version the coach app uses). See
// public/manifest.webmanifest + public/sw.js, registered in main.tsx.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
