// Offline-shell service worker for the coach app (Phase 9).
//
// Hand-rolled rather than Workbox/vite-plugin-pwa on purpose: the plugin's
// latest release caps its Vite peer at ^6 and this project is on Vite 8, which
// is a real ERESOLVE conflict, not a preference (debt #49). The companion app
// hit the same wall and solved it the same way — keep the two in step.
//
// Strategy: cache-first with background revalidate, same-origin GETs only.
// That suits an app whose whole promise is "works with no connection" — every
// lazily-loaded route chunk and the bundled MediaPipe runtime get cached the
// first time they're used, so the second visit is fully offline-capable.
const CACHE = 'coachwright-shell-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  // Individual puts, not addAll: addAll is atomic, so one 404 (a renamed shell
  // file, a partial deploy) would silently leave the app with no cache at all.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => { /* non-fatal */ }))),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  // Never touch cross-origin traffic: the only cross-origin requests this app
  // makes are sync-relay calls, and a stale cached sync response would be worse
  // than no response at all.
  if (new URL(request.url).origin !== self.location.origin) return
  // Range requests (media scrubbing) must reach the network — a cached 200 in
  // place of a 206 breaks playback.
  if (request.headers.has('range')) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return res
        })
        .catch(() => cached)

      // Serve the cache immediately when we have it and let the network copy
      // refresh it in the background; otherwise wait on the network. If both
      // miss, surface a real error rather than an undefined response.
      if (cached) {
        network.catch(() => { /* background refresh failure is fine */ })
        return cached
      }
      return network.then((res) => res ?? Response.error())
    }),
  )
})
