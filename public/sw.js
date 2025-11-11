// Service Worker for HATOD PWA
const CACHE_NAME = 'hatod-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/pages/restaurant_browse.html',
  '/pages/shopping_cart.html',
  '/pages/order_history.html',
  '/pages/customer_profile.html',
  '/pages/restaurant_menu.html',
  '/css/main.css',
  '/css/pages.css',
  '/public/manifest.json'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch Event
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});