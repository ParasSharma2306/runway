const CACHE_NAME = 'runway-v0.5.2-beta.1';

const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/settings.html',
    '/css/style.css',
    '/css/themes.css',
    '/js/theme.js',
    '/js/engine.js',
    '/js/simulate.js',
    '/js/storage.js',
    '/js/app.js',
    '/js/utils.js', 
    '/js/version.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/api/') || 
        url.pathname.startsWith('/auth/') || 
        url.pathname.includes('/version')) {
        return;
    }

    if (event.request.method === 'GET') {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
        );
    }
});