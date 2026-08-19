/* Flash Proxy Lite — browser UI controller. */
(function (global) {
  'use strict';

  class FlashProxyUI {
    constructor(proxy, container = document.body) {
      if (!proxy) throw new TypeError('A FlashProxyLite instance is required');
      this.proxy = proxy;
      this.container = container;
      this.elements = {};
      this._listeners = [];
    }

    mount() {
      this._build();
      this._bindUI();
      this._bindProxy();
      return this;
    }

    _build() {
      this.container.innerHTML = `
        <main class="fp-app" aria-label="Flash Proxy Lite">
          <header class="fp-toolbar">
            <a class="fp-brand" href="./" aria-label="Flash Proxy Lite home"><img src="./logo.png" alt="Flash Proxy" width="42" height="42"><span>Flash Proxy <small>Lite</small></span></a>
            <button data-action="back" title="Back" disabled>←</button>
            <button data-action="forward" title="Forward" disabled>→</button>
            <button data-action="reload" title="Reload">↻</button>
            <form class="fp-address" data-action="navigate">
              <label class="sr-only" for="fp-address-input">Website address</label>
              <input id="fp-address-input" name="url" autocomplete="url" spellcheck="false" placeholder="Enter a website URL…">
              <button type="submit">Go</button>
            </form>
            <button data-action="settings" title="Settings">⚙</button>
          </header>
          <section class="fp-content">
            <div class="fp-start" data-view="start">
              <img src="./logo.png" alt="Flash Proxy" class="fp-hero-logo">
              <h1>Flash Proxy <span>Lite</span></h1>
              <p>Client-side browsing tools with no Flash Proxy server required.</p>
              <form class="fp-start-form" data-action="navigate">
                <label class="sr-only" for="fp-start-input">Website URL</label>
                <input id="fp-start-input" name="url" placeholder="https://example.com" autocomplete="url">
                <button type="submit">Go</button>
              </form>
              <p class="fp-note">Direct browsing only works when the browser permits access. A configured remote CORS endpoint is required when readable cross-origin HTML is needed.</p>
            </div>
            <div class="fp-loading" data-view="loading" hidden><div class="spinner"></div><strong>Loading…</strong><span data-loading-url></span><span data-loading-strategy></span></div>
            <div class="fp-error" data-view="error" hidden><div class="error-icon">⚠</div><h2>Could not load that site</h2><p data-error-message></p><div><button data-action="retry">Try again</button><button data-action="home">Home</button></div></div>
            <pre class="fp-raw" data-view="raw" hidden></pre>
            <iframe class="fp-frame" title="Flash Proxy Lite browsing area" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads" hidden></iframe>
          </section>
          <footer class="fp-status"><span><i data-status-dot></i><span data-status>Ready</span></span><span data-strategy></span><span>Flash Proxy Lite <b>3.0</b></span></footer>
          <aside class="fp-settings" data-settings hidden>
            <h2>Settings</h2>
            <label>Strategy order <select data-strategy-order><option value="direct,iframe,corsproxy">Direct → iframe → remote CORS</option><option value="direct,corsproxy">Direct → remote CORS</option><option value="corsproxy">Remote CORS only</option></select></label>
            <label>Remote CORS endpoint <input data-proxy-name placeholder="My proxy"><input data-proxy-url placeholder="https://proxy.example/?url={url}"></label>
            <button data-action="add-proxy">Add endpoint</button>
            <button data-action="health">Check endpoints</button>
            <p class="fp-settings-note">A static page cannot create a server-side proxy. Only add endpoints you trust and are permitted to use.</p>
          </aside>
        </main>`;

      this.elements = {
        frame: this.container.querySelector('.fp-frame'), raw: this.container.querySelector('.fp-raw'),
        start: this.container.querySelector('[data-view="start"]'), loading: this.container.querySelector('[data-view="loading"]'),
        error: this.container.querySelector('[data-view="error"]'), address: this.container.querySelector('#fp-address-input'),
        startInput: this.container.querySelector('#fp-start-input'), status: this.container.querySelector('[data-status]'),
        dot: this.container.querySelector('[data-status-dot]'), strategy: this.container.querySelector('[data-strategy]'),
        loadingUrl: this.container.querySelector('[data-loading-url]'), loadingStrategy: this.container.querySelector('[data-loading-strategy]'),
        errorMessage: this.container.querySelector('[data-error-message]'), settings: this.container.querySelector('[data-settings]'),
        strategyOrder: this.container.querySelector('[data-strategy-order]'), proxyName: this.container.querySelector('[data-proxy-name]'), proxyUrl: this.container.querySelector('[data-proxy-url]')
      };
    }

    _bindUI() {
      this.container.addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (!button || button.type === 'submit') return;
        const action = button.dataset.action;
        if (action === 'back') this.proxy.back().catch(error => this._showError(error));
        if (action === 'forward') this.proxy.forward().catch(error => this._showError(error));
        if (action === 'reload' && this.proxy.currentUrl) this.proxy.navigate(this.proxy.currentUrl, { addHistory: false }).catch(error => this._showError(error));
        if (action === 'settings') this.elements.settings.hidden = !this.elements.settings.hidden;
        if (action === 'retry' && this.proxy.currentUrl) this.proxy.navigate(this.proxy.currentUrl, { addHistory: false }).catch(error => this._showError(error));
        if (action === 'home') this._show('start');
        if (action === 'add-proxy') this._addProxy();
        if (action === 'health') this.proxy.checkProxyHealth().catch(error => this._showError(error));
      });
      this.container.addEventListener('submit', event => {
        if (event.target.dataset.action !== 'navigate') return;
        event.preventDefault();
        const input = event.target.querySelector('input[name="url"]');
        this._navigate(input.value);
      });
      this.container.addEventListener('change', event => {
        if (event.target.matches('[data-strategy-order]')) this.proxy.setStrategyOrder(event.target.value.split(','));
      });
      window.addEventListener('keydown', event => {
        const mod = event.ctrlKey || event.metaKey;
        if (mod && event.key.toLowerCase() === 'l') { event.preventDefault(); this.elements.address.focus(); this.elements.address.select(); }
        if (mod && event.key.toLowerCase() === 'r') { event.preventDefault(); if (this.proxy.currentUrl) this.proxy.navigate(this.proxy.currentUrl, { addHistory: false }).catch(error => this._showError(error)); }
        if (event.altKey && event.key === 'ArrowLeft') this.proxy.back().catch(error => this._showError(error));
        if (event.altKey && event.key === 'ArrowRight') this.proxy.forward().catch(error => this._showError(error));
      });
      window.addEventListener('message', event => {
        if (event.data?.type === 'fp-navigate' && typeof event.data.url === 'string') this._navigate(event.data.url);
      });
    }

    _bindProxy() {
      const on = (type, fn) => { this.proxy.addEventListener(type, fn); this._listeners.push([type, fn]); };
      on('navigate', e => { this._show('loading'); this.elements.loadingUrl.textContent = e.detail.url; this._status('Loading…', 'loading'); });
      on('strategy-attempt', e => { this.elements.loadingStrategy.textContent = `Trying ${e.detail.strategy}…`; this._status(`Trying ${e.detail.strategy}`, 'loading'); });
      on('load', e => this._showResult(e.detail));
      on('strategy-fail', e => { this.elements.loadingStrategy.textContent = `${e.detail.strategy} failed; trying another option…`; });
      on('error', e => this._showError(new Error(e.detail.error)));
      on('ready', () => this._status('Ready', 'ready'));
    }

    async _navigate(value) {
      const input = String(value || '').trim();
      if (!input) return;
      this.elements.address.value = input;
      this.elements.startInput.value = input;
      try { await this.proxy.navigate(input); }
      catch (error) { this._showError(error); }
    }

    _showResult(detail) {
      this.elements.address.value = detail.url;
      this.elements.startInput.value = detail.url;
      this.elements.strategy.textContent = detail.displayOnly ? 'iframe • display only' : detail.strategy || 'loaded';
      if (detail.displayOnly && this.proxy.state.activeIframe) this._attachFrame(this.proxy.state.activeIframe);
      else if (this.proxy.rewrittenHtml) {
        this.elements.frame.removeAttribute('src');
        this.elements.frame.srcdoc = this.proxy.rewrittenHtml;
        this.elements.frame.hidden = false;
      }
      if (this.proxy.rawHtml) this.elements.raw.textContent = this.proxy.rawHtml;
      this._show('frame');
      this._status(detail.displayOnly ? 'Loaded in display-only mode' : 'Ready', 'ready');
      this._updateHistoryButtons();
    }

    _attachFrame(frame) {
      this.elements.frame.replaceWith(frame);
      this.elements.frame = frame;
      frame.className = 'fp-frame';
      frame.hidden = false;
      frame.title = 'Flash Proxy Lite browsing area';
    }

    _show(view) {
      for (const el of [this.elements.start, this.elements.loading, this.elements.error, this.elements.raw, this.elements.frame]) el.hidden = true;
      if (view === 'start') this.elements.start.hidden = false;
      if (view === 'loading') this.elements.loading.hidden = false;
      if (view === 'error') this.elements.error.hidden = false;
      if (view === 'raw') this.elements.raw.hidden = false;
      if (view === 'frame') this.elements.frame.hidden = false;
    }

    _showError(error) {
      this.elements.errorMessage.textContent = error?.message || 'An unknown error occurred.';
      this._show('error');
      this._status('Error', 'error');
      this._updateHistoryButtons();
    }

    _status(text, kind) {
      this.elements.status.textContent = text;
      this.elements.dot.dataset.state = kind;
    }

    _updateHistoryButtons() {
      this.container.querySelector('[data-action="back"]').disabled = !this.proxy.canGoBack();
      this.container.querySelector('[data-action="forward"]').disabled = !this.proxy.canGoForward();
    }

    _addProxy() {
      try {
        this.proxy.addProxy(this.elements.proxyName.value.trim() || 'Custom proxy', this.elements.proxyUrl.value.trim());
        this.elements.proxyName.value = ''; this.elements.proxyUrl.value = '';
      } catch (error) { this._showError(error); }
    }

    destroy() {
      for (const [type, fn] of this._listeners) this.proxy.removeEventListener(type, fn);
      this._listeners = [];
      this.container.replaceChildren();
    }
  }

  global.FlashProxyUI = FlashProxyUI;
})(typeof window !== 'undefined' ? window : self);
