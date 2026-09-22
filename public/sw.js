/**
 * CodeWithAli PDF Suite - Production Service Worker v12.0
 * Provides True Offline Mode by aggressively caching local assets and external CDNs.
 */

const CACHE_NAME = 'cwa-pdf-tools-offline-v12';

// 1. Pre-cache list (Assets to download immediately on first load)
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/tool.html',
    '/why-us.html',
    '/404.html',
    '/css/style.css',
    '/js/script.js',
    '/js/pdf-engine-client.js',
    '/js/pdf-worker.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// Install Event: Download and save CORE_ASSETS
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force new service worker to activate immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching core assets for offline use...');
            return cache.addAll(CORE_ASSETS);
        }).catch(err => console.warn('[Service Worker] Asset pre-cache error:', err))
    );
});

// Activate Event: Cleanup old caches when we update the version
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Cache-First Strategy with Dynamic Caching
self.addEventListener('fetch', (event) => {
    // Only cache GET requests (ignore POST/API calls)
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // 1. If we have it in cache, return it instantly (Zero latency, works offline)
            if (cachedResponse) {
                return cachedResponse;
            }

            // 2. If not in cache, fetch from network
            return fetch(event.request).then((networkResponse) => {
                // Ensure response is valid before caching
                if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
                    return networkResponse;
                }

                // 3. Clone the response and save it to cache for next time 
                // (This dynamically caches things like pdf.js fonts, icons, cmaps as the user browses)
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // 4. If network fails (completely offline) and asset isn't cached, show 404
                if (event.request.headers.get('accept').includes('text/html')) {
                    return caches.match('/404.html');
                }
            });
        })
    );
});
