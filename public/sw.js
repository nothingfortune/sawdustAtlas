const CACHE = 'sawdust-atlas-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  )
  self.clients.claim()
})

function networkFirst(request) {
  return fetch(request)
    .then(response => {
      const copy = response.clone()
      caches.open(CACHE).then(cache => cache.put(request, copy))
      return response
    })
    .catch(() => caches.match(request).then(cached => cached || caches.match('/')))
}

function cacheFirst(request) {
  return caches.match(request).then(cached => cached || fetch(request).then(response => {
    const copy = response.clone()
    caches.open(CACHE).then(cache => cache.put(request, copy))
    return response
  }))
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  const path = new URL(event.request.url).pathname
  // Build assets are content-hashed and immutable, so serve them from cache first
  // (instant, offline) and only hit the network on a miss. Everything else stays
  // network-first so HTML, the manifest, and the service worker pick up updates.
  event.respondWith(path.startsWith('/assets/') ? cacheFirst(event.request) : networkFirst(event.request))
})
