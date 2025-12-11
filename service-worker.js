const CACHE_NAME = 'mentallify-cache-v1';
const CORE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css', // if you add a file, include it here
  // include any other core assets you host
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Prefer network for API calls
  if (url.pathname.startsWith('/chat') || url.pathname.startsWith('/quiz_') || url.pathname.startsWith('/models')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Otherwise prefer cache-first
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request).then(r => {
      if (e.request.method === 'GET') {
        const copy = r.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
      }
      return r;
    })).catch(() => caches.match('/index.html'))
  );
});
