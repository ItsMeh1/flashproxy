/**
 * FlashProxy Lite v2.0.0 — UI Controller
 * Binds the FlashProxyLite API to a browser interface.
 * 
 * Usage:
 *   const ui = new FlashProxyUI(proxyInstance, document.getElementById('container'));
 *   ui.mount();
 */

(function(global) {
  'use strict';

  class FlashProxyUI {
    constructor(proxy, container) {
      this.proxy = proxy;
      this.container = container || document.body;
      this.elements = {};
      this._boundHandlers = {};
    }

    mount() {
      this._buildDOM();
      this._bindEvents();
      this._bindProxyEvents();
      this._loadSettings();
      return this;
    }

    /* ─── DOM Construction ─── */
    _buildDOM() {
      this.container.innerHTML = `
        <div id="fp-root" style="display:flex;flex-direction:column;height:100vh;background:#0a0a0f;color:#e0e0e0;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden;">

          <!-- Header -->
          <div id="fp-header" style="background:#12121a;border-bottom:1px solid #2a2a3a;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;z-index:100;">
            <div id="fp-logo" style="font-size:17px;font-weight:800;background:linear-gradient(135deg,#00d4ff,#0088ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer;">
              <span style="-webkit-text-fill-color:#00d4ff;font-size:20px;">⚡</span>
              <span>FlashProxy Lite</span>
            </div>

            <div style="display:flex;gap:3px;">
              <button id="fp-back" class="fp-btn-icon" title="Back (Ctrl+Shift+←)" disabled>←</button>
              <button id="fp-forward" class="fp-btn-icon" title="Forward (Ctrl+Shift+→)" disabled>→</button>
              <button id="fp-reload" class="fp-btn-icon" title="Reload (Ctrl+R)">↻</button>
            </div>

            <div id="fp-urlbar" style="flex:1;display:flex;align-items:center;background:#0a0a0f;border:1px solid #2a2a3a;border-radius:10px;padding:0 4px 0 12px;transition:border-color 0.2s;position:relative;">
              <span style="color:#00d4ff;font-size:12px;font-weight:600;margin-right:4px;">https://</span>
              <input id="fp-urlinput" type="text" placeholder="Enter URL to proxy..." autocomplete="off" spellcheck="false" style="flex:1;background:transparent;border:none;color:#e0e0e0;font-size:14px;outline:none;padding:8px 0;font-family:inherit;">
              <div style="display:flex;gap:2px;">
                <button id="fp-go" style="background:transparent;border:none;color:#00d4ff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;transition:all 0.2s;">GO</button>
                <button id="fp-raw" style="background:transparent;border:none;color:#8888a0;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s;" title="Toggle Raw View">{}</button>
                <button id="fp-settings-btn" style="background:transparent;border:none;color:#8888a0;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s;" title="Settings">⚙</button>
              </div>
            </div>

            <div id="fp-strategy-badge" style="font-size:11px;padding:4px 10px;border-radius:6px;background:#00d4ff22;color:#00d4ff;font-weight:700;cursor:pointer;border:1px solid transparent;transition:all 0.2s;white-space:nowrap;" title="Current strategy / Click for health check">
              <span id="fp-strategy-name">Ready</span>
            </div>
          </div>

          <!-- Settings Panel -->
          <div id="fp-settings" style="position:absolute;top:56px;right:16px;background:#12121a;border:1px solid #2a2a3a;border-radius:12px;padding:16px;width:340px;box-shadow:0 20px 60px rgba(0,0,0,0.8);display:none;z-index:1000;max-height:70vh;overflow-y:auto;">
            <h3 style="font-size:14px;margin-bottom:14px;color:#e0e0e0;">⚙️ Proxy Settings</h3>

            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;color:#8888a0;margin-bottom:6px;">Strategy Order (drag to reorder — not implemented, use select)</label>
              <select id="fp-strategy-select" style="width:100%;padding:8px 10px;background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;color:#e0e0e0;font-size:13px;outline:none;">
                <option value="direct,iframe,serviceworker,corsproxy">Direct → IFrame → SW → Proxy</option>
                <option value="direct,corsproxy">Direct → Proxy (fastest)</option>
                <option value="corsproxy">Proxy Only (most reliable)</option>
                <option value="iframe,serviceworker,corsproxy">No Direct (skip CORS attempts)</option>
              </select>
            </div>

            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;color:#8888a0;margin-bottom:6px;">Fallback Proxy Priority</label>
              <div id="fp-proxy-list" style="display:flex;flex-direction:column;gap:6px;"></div>
            </div>

            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;color:#8888a0;margin-bottom:6px;">Custom Proxy URL (use {url})</label>
              <input id="fp-custom-proxy" type="text" placeholder="https://your-proxy.com/?url={url}" style="width:100%;padding:8px 10px;background:#0a0a0f;border:1px solid #2a2a3a;border-radius:8px;color:#e0e0e0;font-size:13px;outline:none;">
            </div>

            <div style="margin-bottom:12px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                <input id="fp-block-scripts" type="checkbox" style="width:auto;">
                Block JavaScript (safer, breaks interactive sites)
              </label>
            </div>

            <div style="margin-bottom:12px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                <input id="fp-strip-cookies" type="checkbox" checked style="width:auto;">
                Strip cookies from requests
              </label>
            </div>

            <div style="margin-bottom:12px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                <input id="fp-debug" type="checkbox" style="width:auto;">
                Debug logging (console)
              </label>
            </div>

            <button id="fp-health-check" style="width:100%;padding:8px;background:#1a1a25;border:1px solid #2a2a3a;border-radius:8px;color:#00d4ff;font-weight:700;cursor:pointer;transition:all 0.2s;">
              🏥 Run Health Check
            </button>
          </div>

          <!-- Main Viewport -->
          <div id="fp-main" style="flex:1;position:relative;overflow:hidden;background:#0a0a0f;">

            <!-- Start Screen -->
            <div id="fp-start" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:radial-gradient(ellipse at center,#12121a 0%,#0a0a0f 70%);">
              <div style="font-size:64px;">⚡</div>
              <div style="font-size:32px;font-weight:800;background:linear-gradient(135deg,#00d4ff,#0088ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">FlashProxy Lite</div>
              <div style="color:#8888a0;font-size:14px;max-width:420px;text-align:center;line-height:1.6;">
                A serverless, client-side web proxy with intelligent fallback.<br>
                Tries direct connection first. Falls back to CORS proxies only when necessary.
              </div>
              <div style="width:100%;max-width:560px;display:flex;background:#12121a;border:1px solid #2a2a3a;border-radius:12px;padding:4px;gap:4px;">
                <input id="fp-start-url" type="text" placeholder="https://example.com" autocomplete="off" style="flex:1;background:transparent;border:none;color:#e0e0e0;padding:12px 16px;font-size:15px;outline:none;">
                <button id="fp-start-go" style="padding:12px 24px;background:#00d4ff;color:#0a0a0f;border:none;border-radius:10px;font-weight:700;cursor:pointer;transition:all 0.2s;">GO</button>
              </div>
              <div style="display:flex;gap:10px;margin-top:4px;flex-wrap:wrap;justify-content:center;">
                <div class="fp-shortcut" data-url="https://news.ycombinator.com" style="background:#1a1a25;border:1px solid #2a2a3a;padding:8px 14px;border-radius:8px;font-size:12px;color:#8888a0;cursor:pointer;transition:all 0.2s;">Hacker News</div>
                <div class="fp-shortcut" data-url="https://example.com" style="background:#1a1a25;border:1px solid #2a2a3a;padding:8px 14px;border-radius:8px;font-size:12px;color:#8888a0;cursor:pointer;transition:all 0.2s;">Example</div>
                <div class="fp-shortcut" data-url="https://httpbin.org" style="background:#1a1a25;border:1px solid #2a2a3a;padding:8px 14px;border-radius:8px;font-size:12px;color:#8888a0;cursor:pointer;transition:all 0.2s;">HTTPBin</div>
                <div class="fp-shortcut" data-url="https://wikipedia.org" style="background:#1a1a25;border:1px solid #2a2a3a;padding:8px 14px;border-radius:8px;font-size:12px;color:#8888a0;cursor:pointer;transition:all 0.2s;">Wikipedia</div>
              </div>
            </div>

            <!-- Loader -->
            <div id="fp-loader" style="position:absolute;inset:0;background:#0a0a0f;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:50;">
              <div style="width:40px;height:40px;border:3px solid #2a2a3a;border-top-color:#00d4ff;border-radius:50%;animation:fp-spin 0.8s linear infinite;"></div>
              <div id="fp-loader-text" style="color:#8888a0;font-size:14px;">Fetching...</div>
              <div id="fp-loader-url" style="color:#00d4ff;font-size:12px;max-width:80%;word-break:break-all;text-align:center;"></div>
              <div id="fp-loader-strategy" style="color:#8888a0;font-size:11px;font-style:italic;"></div>
            </div>

            <!-- Error Screen -->
            <div id="fp-error" style="position:absolute;inset:0;background:#0a0a0f;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:40px;text-align:center;">
              <div style="font-size:48px;">⚠️</div>
              <div id="fp-error-title" style="font-size:20px;font-weight:700;color:#ff3366;">Failed to Load</div>
              <div id="fp-error-msg" style="color:#8888a0;font-size:14px;max-width:500px;line-height:1.6;"></div>
              <div id="fp-error-detail" style="color:#555;font-size:12px;max-width:500px;line-height:1.5;font-family:monospace;background:#12121a;padding:10px;border-radius:8px;text-align:left;"></div>
              <div style="display:flex;gap:8px;margin-top:8px;">
                <button id="fp-error-back" class="fp-btn" style="padding:8px 16px;border-radius:8px;border:1px solid #2a2a3a;background:#1a1a25;color:#e0e0e0;cursor:pointer;font-size:13px;font-weight:600;">← Back</button>
                <button id="fp-error-retry" class="fp-btn" style="padding:8px 16px;border-radius:8px;border:1px solid #00d4ff;background:#00d4ff;color:#0a0a0f;cursor:pointer;font-size:13px;font-weight:700;">Retry</button>
              </div>
            </div>

            <!-- Raw View -->
            <pre id="fp-raw-view" style="width:100%;height:100%;background:#0a0a0f;color:#e0e0e0;padding:20px;font-family:'Consolas','Monaco',monospace;font-size:13px;line-height:1.6;overflow:auto;white-space:pre-wrap;word-break:break-all;display:none;margin:0;"></pre>

            <!-- IFrame Viewport -->
            <iframe id="fp-viewport" style="width:100%;height:100%;border:none;background:white;display:none;" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"></iframe>
          </div>

          <!-- Status Bar -->
          <div id="fp-status" style="background:#12121a;border-top:1px solid #2a2a3a;padding:6px 16px;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#8888a0;flex-shrink:0;">
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <div id="fp-status-dot" style="width:6px;height:6px;border-radius:50%;background:#8888a0;"></div>
                <span id="fp-status-text">Ready</span>
              </div>
              <div id="fp-status-size" style="display:none;"></div>
              <div id="fp-status-time" style="display:none;"></div>
              <div id="fp-status-strategy" style="display:none;color:#00d4ff;font-weight:600;"></div>
            </div>
            <div style="display:flex;align-items:center;gap:14px;">
              <div id="fp-status-proxy" style="display:none;"></div>
              <div>v2.0.0</div>
            </div>
          </div>
        </div>

        <style>
          @keyframes fp-spin { to { transform: rotate(360deg); } }
          .fp-btn-icon {
            width: 32px; height: 32px; border: none; background: #1a1a25;
            color: #8888a0; border-radius: 8px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; transition: all 0.2s;
          }
          .fp-btn-icon:hover:not(:disabled) { background: #2a2a3a; color: #e0e0e0; transform: scale(1.05); }
          .fp-btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
          .fp-shortcut:hover { border-color: #00d4ff !important; color: #00d4ff !important; }
          #fp-urlbar:focus-within { border-color: #00d4ff !important; box-shadow: 0 0 0 3px rgba(0,212,255,0.15); }
          #fp-settings::-webkit-scrollbar { width: 6px; }
          #fp-settings::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
          @media (max-width: 640px) {
            #fp-logo span { display: none; }
          }
        </style>
      `;

      // Cache element references
      const ids = ['fp-root','fp-header','fp-logo','fp-back','fp-forward','fp-reload','fp-urlbar','fp-urlinput','fp-go','fp-raw','fp-settings-btn','fp-strategy-badge','fp-strategy-name','fp-settings','fp-strategy-select','fp-proxy-list','fp-custom-proxy','fp-block-scripts','fp-strip-cookies','fp-debug','fp-health-check','fp-main','fp-start','fp-start-url','fp-start-go','fp-loader','fp-loader-text','fp-loader-url','fp-loader-strategy','fp-error','fp-error-title','fp-error-msg','fp-error-detail','fp-error-back','fp-error-retry','fp-raw-view','fp-viewport','fp-status','fp-status-dot','fp-status-text','fp-status-size','fp-status-time','fp-status-strategy','fp-status-proxy'];
      ids.forEach(id => { this.elements[id] = document.getElementById(id); });
    }

    /* ─── Event Binding ─── */
    _bindEvents() {
      const { proxy } = this;
      const e = this.elements;

      // Navigation
      const go = () => {
        const url = e['fp-urlinput'].value || e['fp-start-url'].value;
        if (url) proxy.navigate(url);
      };

      e['fp-go'].addEventListener('click', go);
      e['fp-start-go'].addEventListener('click', go);
      e['fp-urlinput'].addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
      e['fp-start-url'].addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });

      // History
      e['fp-back'].addEventListener('click', () => proxy.back());
      e['fp-forward'].addEventListener('click', () => proxy.forward());
      e['fp-reload'].addEventListener('click', () => {
        if (proxy.currentUrl) proxy.navigate(proxy.currentUrl, { addHistory: false });
      });
      e['fp-error-back'].addEventListener('click', () => proxy.back());
      e['fp-error-retry'].addEventListener('click', () => {
        if (proxy.currentUrl) proxy.navigate(proxy.currentUrl, { addHistory: false });
      });

      // Raw toggle
      e['fp-raw'].addEventListener('click', () => this._toggleRaw());

      // Settings
      e['fp-settings-btn'].addEventListener('click', ev => {
        ev.stopPropagation();
        e['fp-settings'].style.display = e['fp-settings'].style.display === 'block' ? 'none' : 'block';
      });
      document.addEventListener('click', ev => {
        if (!e['fp-settings'].contains(ev.target) && ev.target !== e['fp-settings-btn']) {
          e['fp-settings'].style.display = 'none';
        }
      });

      // Strategy badge click → health check
      e['fp-strategy-badge'].addEventListener('click', () => this._runHealthCheck());

      // Settings controls
      e['fp-strategy-select'].addEventListener('change', ev => {
        proxy.setStrategyOrder(ev.target.value.split(','));
        this._saveSettings();
      });
      e['fp-custom-proxy'].addEventListener('change', ev => {
        if (ev.target.value) proxy.addProxy('custom', ev.target.value);
        this._saveSettings();
      });
      e['fp-block-scripts'].addEventListener('change', ev => {
        proxy.config.blockScripts = ev.target.checked;
        this._saveSettings();
      });
      e['fp-strip-cookies'].addEventListener('change', ev => {
        proxy.config.stripCookies = ev.target.checked;
        this._saveSettings();
      });
      e['fp-debug'].addEventListener('change', ev => {
        proxy.config.debug = ev.target.checked;
        this._saveSettings();
      });
      e['fp-health-check'].addEventListener('click', () => this._runHealthCheck());

      // Shortcuts
      document.querySelectorAll('.fp-shortcut').forEach(el => {
        el.addEventListener('click', () => proxy.navigate(el.dataset.url));
      });

      // Keyboard
      document.addEventListener('keydown', ev => {
        if (ev.ctrlKey || ev.metaKey) {
          if (ev.key === 'l') { ev.preventDefault(); e['fp-urlinput'].focus(); e['fp-urlinput'].select(); }
          if (ev.key === 'r') { ev.preventDefault(); if (proxy.currentUrl) proxy.navigate(proxy.currentUrl, { addHistory: false }); }
          if (ev.key === 'ArrowLeft' && ev.shiftKey) { ev.preventDefault(); proxy.back(); }
          if (ev.key === 'ArrowRight' && ev.shiftKey) { ev.preventDefault(); proxy.forward(); }
        }
      });

      // Message handler for iframe navigation
      window.addEventListener('message', ev => {
        if (!ev.data) return;
        if (ev.data.type === 'fp-navigate' && ev.data.url) {
          proxy.navigate(ev.data.url);
        } else if (ev.data.type === 'fp-error') {
          this._showError('Navigation Error', ev.data.message);
        } else if (ev.data.type === 'fp-fetch') {
          // Resource fetch intercepted — could route through proxy here
          proxy._log('[UI] Resource fetch intercepted:', ev.data.url);
        }
      });
    }

    _bindProxyEvents() {
      const { proxy } = this;
      const e = this.elements;

      proxy.addEventListener('navigate', ev => {
        e['fp-start'].style.display = 'none';
        e['fp-error'].style.display = 'none';
        e['fp-raw-view'].style.display = 'none';
        e['fp-viewport'].style.display = 'none';
        e['fp-loader'].style.display = 'flex';
        e['fp-loader-url'].textContent = ev.detail.url;
        e['fp-loader-strategy'].textContent = '';
        this._setStatus('Loading...', 'active');
      });

      proxy.addEventListener('strategy-attempt', ev => {
        e['fp-loader-strategy'].textContent = `Trying: ${ev.detail.strategy}...`;
      });

      proxy.addEventListener('strategy-fail', ev => {
        e['fp-loader-strategy'].textContent = `${ev.detail.strategy} failed, trying next...`;
      });

      proxy.addEventListener('proxy-fallback', ev => {
        e['fp-loader-strategy'].textContent = `Fallback to ${ev.detail.proxy}`;
      });

      proxy.addEventListener('load', ev => {
        e['fp-loader'].style.display = 'none';
        const d = ev.detail;

        if (d.strategy === 'iframe' && proxy.state.activeIframe) {
          // Display-only iframe mode
          e['fp-viewport'].style.display = 'none';
          e['fp-main'].appendChild(proxy.state.activeIframe);
        } else {
          // Text mode — inject via srcdoc
          e['fp-viewport'].srcdoc = proxy.rewrittenHtml || proxy.rawHtml || '<html><body>Empty response</body></html>';
          e['fp-viewport'].style.display = 'block';
        }

        e['fp-urlinput'].value = d.url.replace(/^https?:\/\//, '');
        e['fp-start-url'].value = d.url;
        e['fp-back'].disabled = !proxy.canGoBack();
        e['fp-forward'].disabled = !proxy.canGoForward();

        e['fp-status-size'].style.display = 'block';
        e['fp-status-size'].textContent = `Size: ${(d.size / 1024).toFixed(1)} KB`;
        e['fp-status-strategy'].style.display = 'block';
        e['fp-status-strategy'].textContent = `Strategy: ${d.strategy}`;
        e['fp-status-proxy'].style.display = d.proxy ? 'block' : 'none';
        e['fp-status-proxy'].textContent = d.proxy ? `Proxy: ${d.proxy}` : '';

        const stratColor = d.strategy === 'direct' ? '#00ff88' : d.strategy === 'corsproxy' ? '#ffaa00' : '#00d4ff';
        e['fp-strategy-badge'].style.color = stratColor;
        e['fp-strategy-badge'].style.background = stratColor + '22';
        e['fp-strategy-name'].textContent = d.strategy === 'corsproxy' ? d.proxy : d.strategy;

        this._setStatus('Loaded', 'success');
      });

      proxy.addEventListener('error', ev => {
        e['fp-loader'].style.display = 'none';
        this._showError('Load Failed', ev.detail.error, ev.detail.phase);
        this._setStatus('Error', 'error');
      });

      proxy.addEventListener('health-check', ev => {
        this._renderProxyList(ev.detail.results);
      });
    }

    /* ─── UI Helpers ─── */
    _toggleRaw() {
      const e = this.elements;
      const isRaw = e['fp-raw-view'].style.display === 'block';
      if (isRaw) {
        e['fp-raw-view'].style.display = 'none';
        if (this.proxy.state.activeIframe) {
          this.proxy.state.activeIframe.style.display = 'block';
        } else {
          e['fp-viewport'].style.display = 'block';
        }
        e['fp-raw'].style.color = '#8888a0';
      } else {
        if (this.proxy.state.activeIframe) this.proxy.state.activeIframe.style.display = 'none';
        e['fp-viewport'].style.display = 'none';
        e['fp-raw-view'].textContent = this.proxy.rawHtml || '(No content)';
        e['fp-raw-view'].style.display = 'block';
        e['fp-raw'].style.color = '#00d4ff';
      }
    }

    _showError(title, msg, detail) {
      const e = this.elements;
      e['fp-error-title'].textContent = title;
      e['fp-error-msg'].textContent = msg;
      e['fp-error-detail'].textContent = detail || '';
      e['fp-error-detail'].style.display = detail ? 'block' : 'none';
      e['fp-error'].style.display = 'flex';
      e['fp-viewport'].style.display = 'none';
      e['fp-raw-view'].style.display = 'none';
      if (this.proxy.state.activeIframe) this.proxy.state.activeIframe.style.display = 'none';
    }

    _setStatus(text, type) {
      const e = this.elements;
      e['fp-status-text'].textContent = text;
      e['fp-status-dot'].style.background = type === 'active' ? '#00d4ff' : type === 'success' ? '#00ff88' : type === 'error' ? '#ff3366' : '#8888a0';
      e['fp-status-dot'].style.boxShadow = type === 'active' ? '0 0 6px #00d4ff' : type === 'success' ? '0 0 6px #00ff88' : type === 'error' ? '0 0 6px #ff3366' : 'none';
    }

    async _runHealthCheck() {
      this._setStatus('Health check...', 'active');
      const results = await this.proxy.checkProxyHealth();
      this._renderProxyList(results);
      this._setStatus('Health check done', 'success');
    }

    _renderProxyList(results) {
      const container = this.elements['fp-proxy-list'];
      if (!results || !results.length) {
        container.innerHTML = '<div style="color:#8888a0;font-size:12px;">No proxies configured</div>';
        return;
      }
      container.innerHTML = results.map(r => {
        const color = r.status === 'online' ? '#00ff88' : r.status === 'degraded' ? '#ffaa00' : '#ff3366';
        const latency = r.latency ? `${r.latency}ms` : '—';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#0a0a0f;border-radius:6px;font-size:12px;">
          <span style="color:#e0e0e0;">${r.name}</span>
          <span style="color:${color};font-weight:700;">${r.status} ${latency}</span>
        </div>`;
      }).join('');
    }

    _saveSettings() {
      const settings = {
        strategyOrder: this.proxy.config.strategyOrder,
        blockScripts: this.proxy.config.blockScripts,
        stripCookies: this.proxy.config.stripCookies,
        debug: this.proxy.config.debug,
        customProxy: this.elements['fp-custom-proxy'].value
      };
      try { localStorage.setItem('fp-settings-v2', JSON.stringify(settings)); } catch(e) {}
    }

    _loadSettings() {
      try {
        const raw = localStorage.getItem('fp-settings-v2');
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.blockScripts !== undefined) {
          this.proxy.config.blockScripts = s.blockScripts;
          this.elements['fp-block-scripts'].checked = s.blockScripts;
        }
        if (s.stripCookies !== undefined) {
          this.proxy.config.stripCookies = s.stripCookies;
          this.elements['fp-strip-cookies'].checked = s.stripCookies;
        }
        if (s.debug !== undefined) {
          this.proxy.config.debug = s.debug;
          this.elements['fp-debug'].checked = s.debug;
        }
        if (s.strategyOrder) {
          this.proxy.config.strategyOrder = s.strategyOrder;
          const val = s.strategyOrder.join(',');
          const opt = Array.from(this.elements['fp-strategy-select'].options).find(o => o.value === val);
          if (opt) opt.selected = true;
        }
        if (s.customProxy) {
          this.elements['fp-custom-proxy'].value = s.customProxy;
          this.proxy.addProxy('custom', s.customProxy);
        }
      } catch(e) {}
    }
  }

  global.FlashProxyUI = FlashProxyUI;

})(typeof window !== 'undefined' ? window : self);
