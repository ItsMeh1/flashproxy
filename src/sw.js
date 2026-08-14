const FP_PREFIX = '/fp';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    if (url.pathname.startsWith(FP_PREFIX)) {
        event.respondWith(
            fetch(event.request).catch(err => 
                new Response(`Network error: ${err.message}`, { status: 502 })
            )
        );
    }
});
