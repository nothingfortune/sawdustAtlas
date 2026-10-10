const CACHE = 'sawdust-atlas-__SW_BUILD__'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      await cache.addAll(SHELL)
      // The first visit's JS/CSS were fetched before this worker controlled the page, so
      // fetch events never saw them. Precache the hashed assets the shell HTML references,
      // otherwise going offline right after the first load leaves a blank page.
      const html = await (await cache.match('/'))?.text()
      const assets = [...new Set(html?.match(/\/assets\/[^"'\s)]+/g) ?? [])]
      await cache.addAll(assets)
      // Fonts are referenced from the stylesheet, not the HTML, so precache those too.
      // woff2 only: every supported browser picks it, so the .woff fallbacks never load.
      const css = await Promise.all(assets.filter(url => url.endsWith('.css')).map(async url => (await cache.match(url))?.text() ?? ''))
      const nested = [...new Set(css.join('\n').match(/\/assets\/[^"'\s)]+/g) ?? [])].filter(url => !url.endsWith('.woff') && !assets.includes(url))
      await cache.addAll(nested)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  )
  self.clients.claim()
})

// The preview/static hosts send `Vary: Origin`, and the page's crossorigin module/CSS
// requests carry an Origin header the precache fetch did not, so a strict match misses
// and the app is blank offline. Nothing here varies by representation: ignore Vary.
const MATCH = { ignoreVary: true }

function networkFirst(request) {
  return fetch(request)
    .then(response => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then(cache => cache.put(request, copy))
      }
      return response
    })
    .catch(() =>
      caches.match(request, MATCH).then(cached => cached || (request.mode === 'navigate' ? caches.match('/', MATCH) : undefined))
    )
}

function cacheFirst(request) {
  return caches.match(request, MATCH).then(
    cached =>
      cached ||
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(request, copy))
        }
        return response
      })
  )
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  const path = new URL(event.request.url).pathname
  // Build assets are content-hashed and immutable, so serve them from cache first
  // (instant, offline) and only hit the network on a miss. Everything else stays
  // network-first so HTML, the manifest, and the service worker pick up updates.
  event.respondWith(path.startsWith('/assets/') ? cacheFirst(event.request) : networkFirst(event.request))
})
