/**
 * FlashProxy Lite v2.0.0 — Service Worker
 * Intercepts requests, attempts direct fetch, caches responses,
 * and communicates with the client for fallback signaling.
 */

const CACHE_NAME = 'flashproxy-v2-cache';
const CACHE_MAX_AGE = 1000 * 60 * 10; // 10 minutes

self.addEventListener('install', event => {
  console.log('[FlashProxy SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[FlashProxy SW] Activating...');
  event.waitUntil(clients.claim());
});

/* ─── Message Handling ─── */
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'PROXY_FETCH') {
    handleProxyFetch(event.data, event.ports[0]);
  } else if (event.data.type === 'HEALTH_CHECK') {
    handleHealthCheck(event.data, event.ports[0]);
  } else if (event.data.type === 'PING') {
    if (event.ports[0]) event.ports[0].postMessage({ pong: true, ts: Date.now() });
  } else if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.delete(CACHE_NAME));
    if (event.ports[0]) event.ports[0].postMessage({ cleared: true });
  }
});

/* ─── Fetch Interception ─── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only intercept navigation requests and same-origin resource requests
  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigate(event.request));
    return;
  }

  // For cached resources, try cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Check age
        const dateHeader = cached.headers.get('x-fp-date');
        if (dateHeader && (Date.now() - parseInt(dateHeader)) < CACHE_MAX_AGE) {
          return cached;
        }
      }
      return fetch(event.request).then(response => {
        if (response.ok && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            const headers = new Headers(clone.headers);
            headers.set('x-fp-date', String(Date.now()));
            clone.text().then(body => {
              cache.put(event.request, new Response(body, { status: clone.status, statusText: clone.statusText, headers }));
            });
          });
        }
        return response;
      }).catch(() => cached || new Response('Network error', { status: 503 }));
    })
  );
});

async function handleNavigate(request) {
  try {
    const response = await fetch(request, { mode: 'cors', credentials: 'omit' });
    if (response.ok && response.type !== 'opaque') {
      // Cache it
      const cache = await caches.open(CACHE_NAME);
      const headers = new Headers(response.headers);
      headers.set('x-fp-date', String(Date.now()));
      const text = await response.text();
      const cachedResponse = new Response(text, { status: response.status, statusText: response.statusText, headers });
      await cache.put(request, cachedResponse);
      return cachedResponse;
    }
    return response;
  } catch (err) {
    // Try cache
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
      <h1>Offline</h1><p>This page is not available offline.</p>
    </body></html>`, { status: 503, headers: { 'Content-Type': 'text/html' } });
  }
}

async function handleProxyFetch(data, port) {
  try {
    const response = await fetch(data.url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: data.options?.headers || {}
    });

    if (response.type === 'opaque') {
      port.postMessage({ type: 'opaque', error: 'Response is opaque (CORS blocked)' });
      return;
    }

    if (!response.ok) {
      port.postMessage({ type: 'error', error: `HTTP ${response.status} ${response.statusText}` });
      return;
    }

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';

    // Cache
    try {
      const cache = await caches.open(CACHE_NAME);
      const headers = new Headers(response.headers);
      headers.set('x-fp-date', String(Date.now()));
      await cache.put(data.url, new Response(text, { status: response.status, statusText: response.statusText, headers }));
    } catch(e) {}

    port.postMessage({
      type: 'success',
      content: text,
      contentType,
      cached: false
    });
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('CORS')) {
      port.postMessage({ type: 'cors-blocked', error: err.message });
    } else {
      port.postMessage({ type: 'error', error: err.message });
    }
  }
}

async function handleHealthCheck(data, port) {
  const results = [];
  for (const proxy of (data.proxies || [])) {
    const start = performance.now();
    try {
      const testUrl = proxy.url.replace('{url}', encodeURIComponent('https://httpbin.org/get'));
      const response = await fetch(testUrl, { mode: 'cors', method: 'HEAD' });
      results.push({
        name: proxy.name,
        status: response.ok ? 'online' : 'degraded',
        latency: Math.round(performance.now() - start)
      });
    } catch (e) {
      results.push({ name: proxy.name, status: 'offline', error: e.message });
    }
  }
  port.postMessage({ type: 'health-results', results });
}
