const CACHE_NAME = 'ielts-tracker-v4';
const APP_SHELL = [
  '/',
  '/main.html',
  '/about.html',
  '/settings.html',
  '/manifest.json',
  '/css/styles.css',
  '/css/about.css',
  '/css/settings.css',
  '/css/theme-light.css',
  '/js/scripts.js',
  '/js/about.js',
  '/js/settings.js',
  '/js/theme.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match('/main.html'));
    })
  );
});



