const PROXY_PREFIX = '/proxy';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Only intercept proxy requests — server does the heavy lifting
    if (url.pathname.startsWith(PROXY_PREFIX)) {
        event.respondWith(
            fetch(event.request).catch(err => 
                new Response('Network error: ' + err.message, { status: 502 })
            )
        );
    }
});
