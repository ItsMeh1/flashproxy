/**
 * Flash Proxy Lite — browser-only strategies.
 * A static page cannot make arbitrary cross-origin responses readable; only
 * CORS-enabled targets or an externally hosted CORS-capable endpoint can do so.
 */
(function (global) {
  'use strict';

  class FlashProxyStrategies {
    constructor(proxy) { this.proxy = proxy; }

    async direct(url) {
      return this._fetchText(url, 'direct');
    }

    async iframe(url) {
      if (typeof document === 'undefined') throw new Error('Iframe strategy requires a browser');
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
      iframe.sandbox = this.proxy.config.iframeSandbox;
      iframe.referrerPolicy = 'no-referrer';
      iframe.src = url;
      document.body.appendChild(iframe);

      return new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          iframe.removeEventListener('load', finish);
          // Cross-origin documents cannot be read by the parent. The iframe is
          // therefore returned as a display-only result instead of pretending
          // that the browser's same-origin policy can be bypassed.
          resolve({ type: 'iframe', iframeElement: iframe, url, strategy: 'iframe', displayOnly: true });
        };
        const timer = setTimeout(finish, this.proxy.config.timeout);
        iframe.addEventListener('load', finish, { once: true });
      });
    }

    async corsproxy(url) {
      const proxies = [...this.proxy.config.fallbackProxies, ...this.proxy.config.customProxies]
        .filter(proxy => proxy && typeof proxy.url === 'string' && proxy.url.includes('{url}'));
      if (!proxies.length) throw new Error('No external CORS proxy is configured');

      proxies.sort((a, b) => (a.health === 'online' ? -1 : 0) - (b.health === 'online' ? -1 : 0));
      let lastError = null;
      for (const proxy of proxies) {
        try {
          const result = await this._fetchText(this.proxy.buildProxyUrl(proxy.url, url), 'corsproxy', {
            proxy: proxy.name,
            requestTarget: url
          });
          proxy.health = 'online';
          return result;
        } catch (error) {
          proxy.health = 'offline';
          lastError = error;
        }
      }
      throw lastError || new Error('All configured CORS proxies failed');
    }

    async serviceworker() {
      throw new Error('Service Worker cannot bypass CORS; use it for caching, not proxying');
    }

    async nocors(url) {
      const response = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
      if (response.type === 'opaque') {
        return { type: 'opaque', response, url, strategy: 'nocors', displayOnly: true };
      }
      return {
        type: 'text', content: await response.text(),
        contentType: response.headers.get('content-type') || '', url, strategy: 'nocors'
      };
    }

    async _fetchText(url, strategy, extra = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.proxy.config.timeout);
      try {
        const response = await fetch(url, {
          method: 'GET', mode: 'cors', credentials: 'omit',
          cache: 'no-store', signal: controller.signal,
          headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const contentType = response.headers.get('content-type') || '';
        const content = await response.text();
        return { type: 'text', content, contentType, url: extra.requestTarget || url, strategy, proxy: extra.proxy || null };
      } finally {
        clearTimeout(timer);
      }
    }
  }

  global.FlashProxyStrategies = FlashProxyStrategies;
})(typeof window !== 'undefined' ? window : self);
