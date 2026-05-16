const CACHE_NAME = 'notes-docs-v1';
const STATIC_ASSETS = [
  '/',
  '/public/style.css',
  '/public/header-controls.js',
  '/public/sidebar-search.js',
  '/public/sidebar-mobile.js',
  '/public/markdown-page.js',
  '/public/toc.js',
  '/public/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Service worker: failed to cache some assets', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all([
        ...cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
        self.clients.claim()
      ]);
    })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API endpoints (they should always be fresh)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone the response for caching
        const responseToCache = response.clone();

        // Cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // If it's a navigation request and we have a cached index, return that
          if (request.mode === 'navigate') {
            return caches.match('/');
          }

          // Return a basic offline page if available
          return new Response('Offline - content not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});
