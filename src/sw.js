const PROXY_PREFIX = '/proxy';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Only intercept proxy requests
    if (url.pathname.startsWith(PROXY_PREFIX)) {
        event.respondWith(handleProxy(event.request));
    }
});

async function handleProxy(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch (err) {
        return new Response(`Network error: ${err.message}`, { status: 502 });
    }
}
