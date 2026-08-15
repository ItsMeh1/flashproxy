/**
 * FlashProxy Lite v2.0.0 — Strategy Implementations
 * Tiered fallback: Direct → IFrame → ServiceWorker → CORS Proxy
 */

(function(global) {
  'use strict';

  class FlashProxyStrategies {
    constructor(proxy) {
      this.proxy = proxy;
    }

    /* ─── TIER 1: Direct Fetch ───
     * Zero external services. Only works if the target sends 
     * Access-Control-Allow-Origin headers (rare for HTML, common for APIs).
     */
    async direct(url, options = {}) {
      this.proxy._log('[Direct] Attempting', url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.proxy.config.timeout);

      try {
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          signal: controller.signal,
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
          }
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        this.proxy._log('[Direct] Success', text.length, 'bytes');

        return {
          type: 'text',
          content: text,
          contentType,
          url,
          strategy: 'direct'
        };
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }

    /* ─── TIER 2: IFrame Bridge ───
     * Loads the URL in a sandboxed iframe. If the site allows framing
     * AND sends CORS headers, we can read the HTML. Otherwise we return
     * the iframe element for direct display (degraded mode, no rewriting).
     */
    async iframe(url, options = {}) {
      this.proxy._log('[IFrame] Attempting', url);

      if (typeof document === 'undefined') {
        throw new Error('IFrame strategy requires DOM');
      }

      return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
        iframe.sandbox = this.proxy.config.iframeSandbox;
        iframe.referrerPolicy = 'no-referrer';

        let resolved = false;

        const cleanup = () => {
          clearTimeout(timer);
          iframe.onload = null;
          iframe.onerror = null;
        };

        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            // Don't reject — iframe might still be loading. Return it.
            resolve({
              type: 'iframe',
              iframeElement: iframe,
              url,
              strategy: 'iframe',
              note: 'Load timeout; iframe may still render'
            });
          }
        }, this.proxy.config.timeout);

        iframe.onload = () => {
          if (resolved) return;
          cleanup();

          try {
            // Try to read contentDocument (only works same-origin or with CORS)
            const doc = iframe.contentDocument;
            const html = doc.documentElement.outerHTML;

            this.proxy._log('[IFrame] Content readable (same-origin/CORS)');
            resolved = true;
            resolve({
              type: 'text',
              content: html,
              contentType: 'text/html',
              url,
              strategy: 'iframe',
              iframeElement: iframe
            });
          } catch (e) {
            // Cross-origin — can't read, but iframe is loaded
            this.proxy._log('[IFrame] Cross-origin; returning display-only iframe');
            resolved = true;
            resolve({
              type: 'iframe',
              iframeElement: iframe,
              url,
              strategy: 'iframe',
              note: 'Cross-origin; content not readable. Display-only mode.'
            });
          }
        };

        iframe.onerror = () => {
          if (resolved) return;
          cleanup();
          resolved = true;
          reject(new Error('IFrame failed to load (X-Frame-Options or network error)'));
        };

        iframe.src = url;
      });
    }

    /* ─── TIER 3: Service Worker Proxy ───
     * Uses a registered Service Worker to intercept and cache requests.
     * The SW attempts direct fetch; if blocked, signals back to the client.
     * This strategy is mainly useful for caching and offline replay.
     */
    async serviceworker(url, options = {}) {
      this.proxy._log('[SW] Attempting', url);

      if (!this.proxy.state.swController) {
        throw new Error('Service Worker not registered or not active');
      }

      return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => {
          reject(new Error('Service Worker response timeout'));
        }, this.proxy.config.timeout);

        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          const data = event.data;

          if (data.error) {
            reject(new Error(data.error));
          } else if (data.type === 'opaque') {
            reject(new Error('SW received opaque response (CORS blocked)'));
          } else if (data.type === 'cors-blocked') {
            reject(new Error('SW confirmed CORS blocked'));
          } else {
            this.proxy._log('[SW] Success via Service Worker');
            resolve({
              type: 'text',
              content: data.content,
              contentType: data.contentType,
              url,
              strategy: 'serviceworker',
              cached: data.cached || false
            });
          }
        };

        this.proxy.state.swController.postMessage({
          type: 'PROXY_FETCH',
          url,
          options: {
            userAgent: this.proxy.config.userAgent,
            stripCookies: this.proxy.config.stripCookies
          }
        }, [channel.port2]);
      });
    }

    /* ─── TIER 4: CORS Proxy Fallback ───
     * The reliable fallback. Iterates through all configured public
     * and custom CORS proxies until one succeeds.
     */
    async corsproxy(url, options = {}) {
      this.proxy._log('[CORSProxy] Attempting', url);

      const proxies = [
        ...this.proxy.config.fallbackProxies,
        ...this.proxy.config.customProxies
      ];

      if (proxies.length === 0) {
        throw new Error('No CORS proxies configured');
      }

      // Sort by health (prefer online proxies)
      proxies.sort((a, b) => {
        if (a.health === 'online' && b.health !== 'online') return -1;
        if (a.health !== 'online' && b.health === 'online') return 1;
        if (a.latency && b.latency) return a.latency - b.latency;
        return 0;
      });

      for (const proxy of proxies) {
        const proxyUrl = proxy.url.replace('{url}', encodeURIComponent(url));
        this.proxy._log('[CORSProxy] Trying', proxy.name);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.proxy.config.timeout);

        try {
          const response = await fetch(proxyUrl, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal,
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'X-Requested-With': 'XMLHttpRequest'
            }
          });

          clearTimeout(timeout);

          if (!response.ok) {
            proxy.health = 'degraded';
            continue;
          }

          const contentType = response.headers.get('content-type') || '';
          const text = await response.text();

          proxy.health = 'online';
          proxy.latency = 0; // Will be updated by health check

          this.proxy._log('[CORSProxy] Success via', proxy.name, text.length, 'bytes');
          this.proxy._emit('proxy-fallback', { proxy: proxy.name, url });

          return {
            type: 'text',
            content: text,
            contentType,
            url,
            strategy: 'corsproxy',
            proxy: proxy.name
          };
        } catch (err) {
          clearTimeout(timeout);
          proxy.health = 'offline';
          this.proxy._warn('[CORSProxy]', proxy.name, 'failed:', err.message);
        }
      }

      throw new Error('All CORS proxies failed or returned errors');
    }

    /* ─── Utility: No-CORS Blob Strategy (experimental) ───
     * Fetches with mode:no-cors and attempts to create a displayable
     * resource. Limited usefulness for HTML but works for images/CSS.
     * Included for completeness; not in default strategyOrder.
     */
    async nocors(url, options = {}) {
      this.proxy._log('[NoCORS] Attempting', url);

      const response = await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit'
      });

      // Opaque responses can't be read as text, but we can pass them
      // to APIs that accept Response objects or create object URLs
      // for certain content types.
      if (response.type === 'opaque') {
        // Try to create a blob URL via Response trick (limited support)
        try {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          return {
            type: 'blob',
            blobUrl: objectUrl,
            url,
            strategy: 'nocors',
            note: 'Opaque response; limited functionality'
          };
        } catch (e) {
          throw new Error('Cannot read opaque response: ' + e.message);
        }
      }

      const text = await response.text();
      return {
        type: 'text',
        content: text,
        contentType: response.headers.get('content-type') || '',
        url,
        strategy: 'nocors'
      };
    }
  }

  global.FlashProxyStrategies = FlashProxyStrategies;

})(typeof window !== 'undefined' ? window : self);
