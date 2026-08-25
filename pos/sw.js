/**
 * Syrian Home POS - Service Worker
 * Enables PWA installation, offline shell caching, and background performance.
 */

const CACHE_NAME = 'syrian-home-pos-v1.2';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/pos.css',
  './css/receipt.css',
  './js/app.js',
  './js/cart.js',
  './js/barcode-parser.js',
  './js/pos-scanner.js',
  './js/inventory.js',
  './js/reports.js',
  './js/returns.js',
  './js/expenses.js',
  './js/settings.js',
  './js/orders.js',
  './js/api.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch(err => {
        console.warn('POS Cache AddAll warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip API requests from caching
  if (url.pathname.includes('api_sync.php')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
