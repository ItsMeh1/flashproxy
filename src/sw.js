const FP_PREFIX = '/fp/';
const STATIC_PREFIXES = ['/fp-api.js', '/sw.js'];

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Only observe Flash's own proxy namespace. Everything else should retain
  // the browser's normal fetch semantics.
  if (!requestUrl.pathname.startsWith(FP_PREFIX)) return;
  if (STATIC_PREFIXES.includes(requestUrl.pathname)) return;

  event.respondWith(
    fetch(event.request).catch(error => new Response(
      `Flash Proxy network error: ${error?.message || 'unknown error'}`,
      { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }
    ))
  );
});
