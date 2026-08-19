/*
 * Flash Proxy Lite service worker.
 *
 * This worker is deliberately a cache/offline layer. Service Workers do not
 * bypass the browser's cross-origin policy, so this file never pretends to be
 * an HTTP proxy.
 */
const CACHE_NAME = 'flashproxy-lite-v3';
const MAX_AGE = 10 * 60 * 1000;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'PING' && event.ports[0]) event.ports[0].postMessage({ pong: true, version: CACHE_NAME });
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.delete(CACHE_NAME));
    event.ports[0]?.postMessage({ cleared: true });
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      const timestamp = Number(cached.headers.get('x-flashproxy-cached-at'));
      if (timestamp && Date.now() - timestamp < MAX_AGE) return cached;
    }

    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') {
        const headers = new Headers(response.headers);
        headers.set('x-flashproxy-cached-at', String(Date.now()));
        const copy = new Response(await response.clone().arrayBuffer(), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
        await cache.put(request, copy);
      }
      return response;
    } catch (error) {
      return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
