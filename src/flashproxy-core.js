/* Flash Proxy Lite — static browser core. */
(function (global) {
  'use strict';
  const VERSION = '3.0.0';
  const DEFAULT_PROXIES = [
    { name: 'corsproxy.io', url: 'https://corsproxy.io/?url={url}', health: null, latency: null },
    { name: 'AllOrigins', url: 'https://api.allorigins.win/raw?url={url}', health: null, latency: null }
  ];
  const DEFAULTS = { strategyOrder: ['direct', 'iframe', 'corsproxy'], fallbackProxies: DEFAULT_PROXIES, customProxies: [], rewriteHtml: true, blockScripts: false, timeout: 15000, maxRetries: 1, cacheEnabled: true, debug: false, enableServiceWorker: false, iframeSandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads' };
  function cloneConfig(options) { return { ...DEFAULTS, ...options, strategyOrder: [...(options.strategyOrder || DEFAULTS.strategyOrder)], fallbackProxies: [...(options.fallbackProxies || DEFAULT_PROXIES)].map(p => ({ ...p })), customProxies: [...(options.customProxies || [])].map(p => ({ ...p })) }; }

  class FlashProxyLite extends EventTarget {
    constructor(options = {}) {
      super(); this.config = cloneConfig(options);
      this.state = { history: [], historyIndex: -1, currentUrl: null, currentStrategy: null, rawContent: null, rewrittenContent: null, isLoading: false, activeIframe: null, cache: new Map(), swRegistration: null, swController: null };
      this.strategies = new Map(); this.rewriter = null;
    }
    async init() {
      if (typeof global.FlashProxyStrategies === 'function') {
        const impl = new global.FlashProxyStrategies(this);
        for (const name of this.config.strategyOrder) if (typeof impl[name] === 'function') this.strategies.set(name, impl[name].bind(impl));
      }
      if (typeof global.FlashProxyRewriter === 'function') this.rewriter = new global.FlashProxyRewriter(this);
      if (this.config.enableServiceWorker && 'serviceWorker' in navigator && location.protocol !== 'file:') await this._registerSW();
      this._emit('ready', { version: VERSION, static: true }); return this;
    }
    async _registerSW() {
      try { const reg = await navigator.serviceWorker.register('./flashproxy-sw.js', { scope: './' }); this.state.swRegistration = reg; await navigator.serviceWorker.ready; this.state.swController = navigator.serviceWorker.controller || reg.active || null; }
      catch (error) { this._warn('Service Worker unavailable:', error.message); }
    }
    async navigate(input, options = {}) {
      const url = this._normalizeUrl(input); if (!url) throw this._fail(input, 'Invalid HTTP(S) URL');
      this.state.isLoading = true; this.state.currentUrl = url; this._emit('navigate', { url, options }); let lastError = null;
      try {
        for (const name of this.config.strategyOrder) {
          const fn = this.strategies.get(name); if (!fn) continue; this._emit('strategy-attempt', { strategy: name, url });
          try { const result = await this._executeWithRetry(fn, name, url, options); if (!result) continue; this.state.currentStrategy = result.strategy || name; await this._handleSuccess(result, url, options); this._emit('load', { url, strategy: this.state.currentStrategy, proxy: result.proxy || null, contentType: result.contentType || null, size: typeof result.content === 'string' ? result.content.length : 0, displayOnly: result.type === 'iframe' }); return result; }
          catch (error) { lastError = error; this._emit('strategy-fail', { strategy: name, url, error: error.message }); }
        }
        throw this._fail(url, lastError?.message || 'No usable strategy succeeded');
      } finally { this.state.isLoading = false; }
    }
    async _executeWithRetry(fn, name, url, options) { let lastError; for (let attempt = 0; attempt < Math.max(1, this.config.maxRetries + 1); attempt++) { try { return await fn(url, options); } catch (error) { lastError = error; if (attempt < this.config.maxRetries) await this._delay(500 * (attempt + 1)); } } throw lastError || new Error(`${name} failed`); }
    async _handleSuccess(result, url, options) {
      if (this.state.activeIframe?.parentNode) this.state.activeIframe.remove(); this.state.activeIframe = result.type === 'iframe' ? result.iframeElement : null; this.state.rawContent = result.content ?? null;
      this.state.rewrittenContent = result.type === 'text' && this.config.rewriteHtml && this.rewriter && result.content ? this.rewriter.rewrite(result.content, url) : result.content ?? null;
      if (this.config.cacheEnabled && typeof result.content === 'string') this.state.cache.set(url, { content: result.content, strategy: result.strategy, timestamp: Date.now() });
      if (options.addHistory !== false) { this.state.history = this.state.history.slice(0, this.state.historyIndex + 1); this.state.history.push(url); this.state.historyIndex = this.state.history.length - 1; }
    }
    back() { if (!this.canGoBack()) return Promise.resolve(null); const url = this.state.history[--this.state.historyIndex]; return this.navigate(url, { addHistory: false }); }
    forward() { if (!this.canGoForward()) return Promise.resolve(null); const url = this.state.history[++this.state.historyIndex]; return this.navigate(url, { addHistory: false }); }
    canGoBack() { return this.state.historyIndex > 0; }
    canGoForward() { return this.state.historyIndex >= 0 && this.state.historyIndex < this.state.history.length - 1; }
    get rawHtml() { return this.state.rawContent; } get rewrittenHtml() { return this.state.rewrittenContent; } get currentUrl() { return this.state.currentUrl; } get currentStrategy() { return this.state.currentStrategy; } get isLoading() { return this.state.isLoading; } get history() { return [...this.state.history]; }
    addProxy(name, urlTemplate) { if (!name || !String(urlTemplate).includes('{url}')) throw new TypeError('A proxy name and a URL containing {url} are required'); this.config.customProxies.push({ name: String(name), url: String(urlTemplate), health: null, latency: null }); this._emit('proxy-added', { name: String(name) }); }
    removeProxy(name) { this.config.customProxies = this.config.customProxies.filter(proxy => proxy.name !== name); this._emit('proxy-removed', { name }); }
    setStrategyOrder(order) { if (!Array.isArray(order) || order.some(name => typeof name !== 'string')) throw new TypeError('strategyOrder must be an array of strings'); this.config.strategyOrder = [...order]; this._emit('config-change', { key: 'strategyOrder', value: [...order] }); }
    buildProxyUrl(template, target) { if (!String(template).includes('{url}')) throw new TypeError('Proxy template must contain {url}'); return String(template).replaceAll('{url}', encodeURIComponent(target)); }
    async checkProxyHealth() { const results = []; for (const proxy of [...this.config.fallbackProxies, ...this.config.customProxies]) { const started = performance.now(); try { const response = await fetch(this.buildProxyUrl(proxy.url, 'https://example.com/'), { mode: 'cors', cache: 'no-store' }); proxy.health = response.ok ? 'online' : 'degraded'; proxy.latency = Math.round(performance.now() - started); results.push({ name: proxy.name, status: proxy.health, latency: proxy.latency }); } catch (error) { proxy.health = 'offline'; proxy.latency = null; results.push({ name: proxy.name, status: 'offline', error: error.message }); } } this._emit('health-check', { results }); return results; }
    _normalizeUrl(input) { if (typeof input !== 'string') return null; const value = input.trim(); if (!value) return null; const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`; try { const url = new URL(candidate); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
    _fail(url, message) { const error = new Error(message); this._emit('error', { url, error: message, phase: 'navigation' }); return error; }
    _emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); if (this.config.debug) console.debug(`[FlashProxy:${type}]`, detail); }
    _log(...args) { if (this.config.debug) console.debug('[FlashProxy]', ...args); } _warn(...args) { if (this.config.debug) console.warn('[FlashProxy]', ...args); } _delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  }
  global.FlashProxyLite = FlashProxyLite; global.FlashProxyLite.VERSION = VERSION; global.FlashProxyLite.DEFAULTS = DEFAULTS;
})(typeof window !== 'undefined' ? window : self);
