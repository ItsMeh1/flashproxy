/**
 * FlashProxy Lite v2.0.0 — Core Engine
 * Serverless client-side proxy with tiered fallback strategies.
 * 
 * Usage:
 *   const proxy = new FlashProxyLite({ strategyOrder: ['direct','corsproxy'] });
 *   proxy.addEventListener('load', e => console.log('Loaded:', e.detail));
 *   await proxy.navigate('https://example.com');
 */

(function(global) {
  'use strict';

  const VERSION = '2.0.0';

  const DEFAULTS = {
    strategyOrder: ['direct', 'iframe', 'serviceworker', 'corsproxy'],
    fallbackProxies: [
      { name: 'corsproxy.io', url: 'https://corsproxy.io/?url={url}', health: null, latency: null },
      { name: 'allorigins.win', url: 'https://api.allorigins.win/raw?url={url}', health: null, latency: null },
      { name: 'codetabs.com', url: 'https://api.codetabs.com/v1/proxy?quest={url}', health: null, latency: null }
    ],
    customProxies: [],
    rewriteHtml: true,
    blockScripts: false,
    stripCookies: true,
    timeout: 15000,
    maxRetries: 2,
    cacheEnabled: true,
    userAgent: navigator.userAgent,
    iframeSandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals',
    debug: false
  };

  class FlashProxyLite extends EventTarget {
    constructor(options = {}) {
      super();
      this.config = Object.assign({}, DEFAULTS, options);
      this.state = {
        history: [],
        historyIndex: -1,
        currentUrl: null,
        currentStrategy: null,
        rawContent: null,
        rewrittenContent: null,
        isLoading: false,
        activeIframe: null,
        cache: new Map(),
        swRegistration: null,
        swController: null
      };
      this.strategies = new Map();
      this.strategyImpl = null;
      this.rewriter = null;
      this._log('Core initialized');
    }

    /* ─── Initialization ─── */
    async init() {
      // Load strategy module if present
      if (typeof FlashProxyStrategies !== 'undefined') {
        this.strategyImpl = new FlashProxyStrategies(this);
        this.config.strategyOrder.forEach(name => {
          if (this.strategyImpl[name]) {
            this.strategies.set(name, this.strategyImpl[name].bind(this.strategyImpl));
          }
        });
      }
      // Load rewriter module if present
      if (typeof FlashProxyRewriter !== 'undefined') {
        this.rewriter = new FlashProxyRewriter(this);
      }
      // Register Service Worker
      if ('serviceWorker' in navigator && this.config.strategyOrder.includes('serviceworker')) {
        await this._registerSW();
      }
      this._emit('ready', { version: VERSION });
      return this;
    }

    async _registerSW() {
      try {
        const reg = await navigator.serviceWorker.register('./flashproxy-sw.js', { scope: './' });
        this.state.swRegistration = reg;
        await navigator.serviceWorker.ready;
        this.state.swController = reg.active || navigator.serviceWorker.controller;
        this._log('Service Worker registered');
      } catch (e) {
        this._warn('SW registration failed:', e.message);
      }
    }

    /* ─── Navigation ─── */
    async navigate(url, options = {}) {
      const normalized = this._normalizeUrl(url);
      if (!normalized) {
        const err = new Error('Invalid URL: ' + url);
        this._emit('error', { url, error: err.message, phase: 'normalize' });
        throw err;
      }

      this.state.isLoading = true;
      this.state.currentUrl = normalized;
      this._emit('navigate', { url: normalized, options });

      const strategies = this.config.strategyOrder;
      let lastError = null;

      for (const strategyName of strategies) {
        if (!this.strategies.has(strategyName)) {
          this._log(`Strategy "${strategyName}" not available, skipping`);
          continue;
        }

        this._emit('strategy-attempt', { strategy: strategyName, url: normalized });

        try {
          const result = await this._executeWithRetry(strategyName, normalized, options);
          if (result) {
            this.state.currentStrategy = strategyName;
            await this._handleSuccess(result, normalized, options);
            this._emit('load', {
              url: normalized,
              strategy: strategyName,
              proxy: result.proxy || null,
              contentType: result.contentType || null,
              size: result.content ? result.content.length : 0
            });
            this.state.isLoading = false;
            return result;
          }
        } catch (err) {
          lastError = err;
          this._emit('strategy-fail', { strategy: strategyName, url: normalized, error: err.message });
          this._warn(`Strategy "${strategyName}" failed:`, err.message);
        }
      }

      this.state.isLoading = false;
      const finalError = new Error(`All strategies failed for ${normalized}. Last: ${lastError?.message}`);
      this._emit('error', { url: normalized, error: finalError.message, phase: 'all-strategies' });
      throw finalError;
    }

    async _executeWithRetry(strategyName, url, options) {
      const fn = this.strategies.get(strategyName);
      let lastErr;
      for (let i = 0; i < this.config.maxRetries; i++) {
        try {
          return await fn(url, options);
        } catch (err) {
          lastErr = err;
          if (i < this.config.maxRetries - 1) {
            this._log(`Retry ${i + 1} for ${strategyName}...`);
            await this._delay(1000 * (i + 1));
          }
        }
      }
      throw lastErr;
    }

    async _handleSuccess(result, url, options) {
      // Clean up previous iframe if any
      if (this.state.activeIframe && this.state.activeIframe.parentNode) {
        this.state.activeIframe.parentNode.removeChild(this.state.activeIframe);
      }
      this.state.activeIframe = null;

      // Store raw
      this.state.rawContent = result.content || null;

      // Rewrite if applicable
      if (result.type === 'text' && this.config.rewriteHtml && this.rewriter && result.content) {
        this.state.rewrittenContent = this.rewriter.rewrite(result.content, url);
      } else {
        this.state.rewrittenContent = result.content || null;
      }

      // Cache
      if (this.config.cacheEnabled && result.content) {
        this.state.cache.set(url, { content: result.content, strategy: result.strategy, ts: Date.now() });
      }

      // Store iframe reference if strategy returned one
      if (result.type === 'iframe' && result.iframeElement) {
        this.state.activeIframe = result.iframeElement;
      }

      // Update history
      if (options.addHistory !== false) {
        if (this.state.historyIndex < this.state.history.length - 1) {
          this.state.history = this.state.history.slice(0, this.state.historyIndex + 1);
        }
        this.state.history.push(url);
        this.state.historyIndex++;
      }
    }

    /* ─── History ─── */
    back() {
      if (this.canGoBack()) {
        this.state.historyIndex--;
        return this.navigate(this.state.history[this.state.historyIndex], { addHistory: false });
      }
      return Promise.resolve(null);
    }

    forward() {
      if (this.canGoForward()) {
        this.state.historyIndex++;
        return this.navigate(this.state.history[this.state.historyIndex], { addHistory: false });
      }
      return Promise.resolve(null);
    }

    canGoBack() { return this.state.historyIndex > 0; }
    canGoForward() { return this.state.historyIndex < this.state.history.length - 1; }

    /* ─── Content Access ─── */
    get rawHtml() { return this.state.rawContent; }
    get rewrittenHtml() { return this.state.rewrittenContent; }
    get currentUrl() { return this.state.currentUrl; }
    get currentStrategy() { return this.state.currentStrategy; }
    get isLoading() { return this.state.isLoading; }
    get history() { return [...this.state.history]; }

    /* ─── Proxy Management ─── */
    addProxy(name, urlTemplate) {
      this.config.customProxies.push({ name, url: urlTemplate, health: null, latency: null });
      this._emit('proxy-added', { name, url: urlTemplate });
    }

    removeProxy(name) {
      this.config.customProxies = this.config.customProxies.filter(p => p.name !== name);
      this._emit('proxy-removed', { name });
    }

    setStrategyOrder(order) {
      this.config.strategyOrder = order;
      this._emit('config-change', { key: 'strategyOrder', value: order });
    }

    /* ─── Health Checks ─── */
    async checkProxyHealth() {
      const allProxies = [...this.config.fallbackProxies, ...this.config.customProxies];
      const results = [];

      for (const proxy of allProxies) {
        const start = performance.now();
        try {
          const testUrl = proxy.url.replace('{url}', encodeURIComponent('https://httpbin.org/get'));
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(testUrl, { mode: 'cors', signal: controller.signal });
          clearTimeout(timeout);
          proxy.health = response.ok ? 'online' : 'degraded';
          proxy.latency = Math.round(performance.now() - start);
          results.push({ name: proxy.name, status: proxy.health, latency: proxy.latency });
        } catch (e) {
          proxy.health = 'offline';
          proxy.latency = null;
          results.push({ name: proxy.name, status: 'offline', error: e.message });
        }
      }

      // Also check SW health
      if (this.state.swController) {
        try {
          const channel = new MessageChannel();
          const swResult = await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('SW timeout')), 5000);
            channel.port1.onmessage = e => { clearTimeout(t); resolve(e.data); };
            this.state.swController.postMessage({ type: 'PING' }, [channel.port2]);
          });
          results.push({ name: 'ServiceWorker', status: swResult?.pong ? 'online' : 'offline', latency: 0 });
        } catch (e) {
          results.push({ name: 'ServiceWorker', status: 'offline', error: e.message });
        }
      }

      this._emit('health-check', { results });
      return results;
    }

    /* ─── Utilities ─── */
    _normalizeUrl(input) {
      if (!input || typeof input !== 'string') return null;
      let url = input.trim();
      if (!url) return null;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      try { return new URL(url).href; } catch { return null; }
    }

    _emit(type, detail = {}) {
      this.dispatchEvent(new CustomEvent(type, { detail }));
      if (this.config.debug) console.log(`[FlashProxy:${type}]`, detail);
    }

    _log(...args) { if (this.config.debug) console.log('[FlashProxy]', ...args); }
    _warn(...args) { console.warn('[FlashProxy]', ...args); }
    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  }

  // Expose
  global.FlashProxyLite = FlashProxyLite;
  global.FlashProxyLite.VERSION = VERSION;

})(typeof window !== 'undefined' ? window : self);
