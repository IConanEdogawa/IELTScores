const CACHE_NAME = 'ielts-tracker-v6';
const OFFLINE_URL = '/offline.html';
const APP_SHELL = [
  '/',
  '/main.html',
  '/about.html',
  '/settings.html',
  '/theme-browser.html',
  OFFLINE_URL,
  '/manifest.json',
  '/css/styles.css',
  '/css/about.css',
  '/css/settings.css',
  '/css/theme-light.css',
  '/css/theme-browser.css',
  '/js/scripts.js',
  '/js/about.js',
  '/js/settings.js',
  '/js/theme.js',
  '/js/theme-browser.js',
  '/vendor/chart.umd.min.js',
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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (request.url.startsWith(self.location.origin) && response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match('/main.html')) ||
      (await cache.match(OFFLINE_URL))
    );
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const isNavigation = request.mode === 'navigate';
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isNavigation) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isSameOrigin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      return cached || Response.error();
    })
  );
});
