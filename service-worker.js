/* service-worker.js */

const CACHE_NAME = 'flashcard-cache-v1';
const urlsToCache = [
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        // Fájlok cache-elése
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Ha van cache-elt válasz, azt adjuk vissza
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
