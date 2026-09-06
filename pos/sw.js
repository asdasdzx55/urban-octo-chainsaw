/**
 * Syrian Home POS - Service Worker v2.5.1
 * Enables PWA installation, offline shell caching, and instant code updates.
 */

const CACHE_NAME = 'syrian-home-pos-v2.5.1';
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
  './js/purchases.js',
  './js/delivery-settlement.js',
  './js/employees.js',
  './js/sync-manager.js',
  './js/pwa.js',
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
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('Clearing old POS cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip API, non-GET, and browser extension requests
  if (
    event.request.method !== 'GET' ||
    url.pathname.includes('api_sync.php') ||
    url.pathname.includes('checkout.php') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  // Network-First for HTML navigation and JS scripts to ensure instant updates
  const isCodeOrHtml =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/pos');

  if (isCodeOrHtml) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-First for static assets (CSS, images, icons, fonts)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Background revalidation
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      });
    })
  );
});
