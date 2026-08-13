// Minimal offline-shell service worker — cache-first for the app shell so
// Companion opens even with no connection (the whole point of a local-first
// client app). Not Workbox-generated; hand-rolled on purpose (see vite.config.ts).
const CACHE = 'companion-shell-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
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

// ---- Web Push (S13) ----
// Payloads are metadata only ("new message") — content stays end-to-end
// encrypted and is fetched by the app itself when opened. See lib/push.ts.
self.addEventListener('push', (event) => {
  let data = { title: 'Companion', body: 'Something new from your coach.' }
  try { data = { ...data, ...event.data?.json() } } catch { /* keep defaults */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.svg',
      tag: 'companion-push',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins[0]
      if (existing) return existing.focus()
      return self.clients.openWindow('./#/coach')
    }),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((cache) => cache.put(event.request, res.clone()))
          return res
        })
        .catch(() => cached)
      return cached ?? network
    }),
  )
})
