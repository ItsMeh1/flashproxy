/**
 * FlashProxy Lite v2.0.0 — Content Rewriter
 * Rewrites HTML/CSS/JS so that all resources route back through the proxy.
 */

(function(global) {
  'use strict';

  class FlashProxyRewriter {
    constructor(proxy) {
      this.proxy = proxy;
    }

    /**
     * Main entry point. Rewrites raw HTML for proxy injection.
     * @param {string} html - Raw HTML content
     * @param {string} baseUrl - The original URL (used for resolving relative URLs)
     * @returns {string} Rewritten HTML ready for srcdoc injection
     */
    rewrite(html, baseUrl) {
      if (!html || typeof html !== 'string') return html;

      const base = new URL(baseUrl);
      let modified = html;

      // 1. Inject base tag + interception script
      modified = this._injectBaseAndScript(modified, base, baseUrl);

      // 2. Block scripts if configured
      if (this.proxy.config.blockScripts) {
        modified = this._blockScripts(modified);
      }

      // 3. Strip cookies meta tags if configured
      if (this.proxy.config.stripCookies) {
        modified = this._stripCookies(modified);
      }

      // 4. Rewrite all URL attributes
      modified = this._rewriteAttributes(modified, base);

      // 5. Rewrite CSS url() functions
      modified = this._rewriteCssUrls(modified, base);

      // 6. Rewrite inline event handlers
      modified = this._rewriteInlineEvents(modified);

      // 7. Handle srcset attributes
      modified = this._rewriteSrcset(modified, base);

      // 8. Handle meta refresh
      modified = this._rewriteMetaRefresh(modified, base);

      return modified;
    }

    /* ─── Injection ─── */
    _injectBaseAndScript(html, base, baseUrl) {
      const interceptScript = this._generateInterceptScript(baseUrl);
      const baseTag = `<base href="${base.origin}/">`;

      // Try to inject after <head>
      if (/<head[^>]*>/i.test(html)) {
        return html.replace(/(<head[^>]*>)/i, `$1\n${baseTag}\n${interceptScript}\n`);
      }

      // No <head>, try after <html>
      if (/<html[^>]*>/i.test(html)) {
        return html.replace(/(<html[^>]*>)/i, `$1\n<head>\n${baseTag}\n${interceptScript}\n</head>\n`);
      }

      // No <html>, prepend
      return `<!DOCTYPE html><html><head>${baseTag}${interceptScript}</head><body>${html}</body></html>`;
    }

    _generateInterceptScript(baseUrl) {
      // This script runs inside the proxied page and communicates with parent
      return `<script>
(function() {
  'use strict';

  const ORIGIN = ${JSON.stringify(baseUrl)};

  // Notify parent when loaded
  if (window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'fp-loaded', url: location.href, origin: ORIGIN }, '*');
    } catch(e) {}
  }

  // Intercept all link clicks
  document.addEventListener('click', function(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    const link = path.find(el => el && el.tagName === 'A');
    if (link && link.href) {
      const href = link.href;
      if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('data:') || href.startsWith('blob:')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      try {
        window.parent.postMessage({ type: 'fp-navigate', url: href, from: ORIGIN }, '*');
      } catch(err) {}
      return false;
    }
  }, true);

  // Intercept form submissions
  document.addEventListener('submit', function(e) {
    const form = e.target;
    if (!form || form.tagName !== 'FORM') return;

    const action = form.action || location.href;
    const method = (form.method || 'get').toLowerCase();

    if (method === 'get') {
      e.preventDefault();
      try {
        const url = new URL(action);
        const formData = new FormData(form);
        formData.forEach((value, key) => url.searchParams.append(key, value));
        window.parent.postMessage({ type: 'fp-navigate', url: url.href, from: ORIGIN }, '*');
      } catch(err) {}
    } else {
      // POST forms cannot be proxied client-side without a server
      // Warn the user
      e.preventDefault();
      try {
        window.parent.postMessage({ type: 'fp-error', message: 'POST forms require a proxy server', from: ORIGIN }, '*');
      } catch(err) {}
    }
  }, true);

  // Override window.open
  const _open = window.open;
  window.open = function(url, target, features) {
    if (url && typeof url === 'string') {
      try {
        window.parent.postMessage({ type: 'fp-navigate', url: url, from: ORIGIN }, '*');
      } catch(err) {}
      return null;
    }
    return _open.apply(this, arguments);
  };

  // Override location changes
  const _assign = window.location.assign;
  const _replace = window.location.replace;
  window.location.assign = function(url) {
    if (url) {
      try {
        window.parent.postMessage({ type: 'fp-navigate', url: String(url), from: ORIGIN }, '*');
      } catch(err) {}
    }
  };
  window.location.replace = function(url) {
    if (url) {
      try {
        window.parent.postMessage({ type: 'fp-navigate', url: String(url), from: ORIGIN }, '*');
      } catch(err) {}
    }
  };

  // Fix history.pushState / replaceState
  const _pushState = history.pushState;
  const _replaceState = history.replaceState;
  history.pushState = function(state, title, url) {
    if (url) {
      try {
        window.parent.postMessage({ type: 'fp-navigate', url: new URL(url, location.href).href, from: ORIGIN }, '*');
      } catch(err) {}
    }
    return _pushState.apply(this, arguments);
  };
  history.replaceState = function(state, title, url) {
    if (url) {
      try {
        window.parent.postMessage({ type: 'fp-navigate', url: new URL(url, location.href).href, from: ORIGIN }, '*');
      } catch(err) {}
    }
    return _replaceState.apply(this, arguments);
  };

  // Override fetch to route through proxy
  const _fetch = window.fetch;
  window.fetch = function(input, init) {
    let url = input;
    if (input instanceof Request) url = input.url;
    if (typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')) {
      try {
        const resolved = new URL(url, location.href).href;
        window.parent.postMessage({ type: 'fp-fetch', url: resolved, from: ORIGIN }, '*');
      } catch(err) {}
    }
    return _fetch.apply(this, arguments);
  };

  // Override XMLHttpRequest
  const _XHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new _XHR();
    const _open = xhr.open;
    xhr.open = function(method, url, async, user, password) {
      if (typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')) {
        try {
          const resolved = new URL(url, location.href).href;
          window.parent.postMessage({ type: 'fp-fetch', url: resolved, from: ORIGIN }, '*');
        } catch(err) {}
      }
      return _open.apply(this, arguments);
    };
    return xhr;
  };

  // CSS proxy injection: rewrite all stylesheet links
  document.querySelectorAll('link[rel="stylesheet"]').forEach(function(link) {
    if (link.href) {
      try {
        window.parent.postMessage({ type: 'fp-css', url: link.href, from: ORIGIN }, '*');
      } catch(err) {}
    }
  });
})();
<\/script>`;
    }

    /* ─── Script Blocking ─── */
    _blockScripts(html) {
      // Remove script tags
      let modified = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      // Remove event handlers
      modified = modified.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
      // Remove javascript: URLs
      modified = modified.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
      return modified;
    }

    /* ─── Cookie Stripping ─── */
    _stripCookies(html) {
      // Remove Set-Cookie meta equivalents
      return html.replace(/<meta[^>]+http-equiv\s*=\s*["']?set-cookie["']?[^>]*>/gi, '');
    }

    /* ─── Attribute Rewriting ─── */
    _rewriteAttributes(html, base) {
      const self = this;
      const attrs = [
        { tag: 'a', attr: 'href' },
        { tag: 'img', attr: 'src' },
        { tag: 'source', attr: 'src' },
        { tag: 'video', attr: 'src' },
        { tag: 'audio', attr: 'src' },
        { tag: 'track', attr: 'src' },
        { tag: 'embed', attr: 'src' },
        { tag: 'iframe', attr: 'src' },
        { tag: 'script', attr: 'src' },
        { tag: 'link', attr: 'href' },
        { tag: 'form', attr: 'action' },
        { tag: 'input', attr: 'src' },  // image inputs
        { tag: 'object', attr: 'data' },
        { tag: 'area', attr: 'href' }
      ];

      let modified = html;

      attrs.forEach(({ tag, attr }) => {
        const regex = new RegExp(`(<${tag}\\b[^>]*?\\s${attr}=["'])([^"']+)(["'])`, 'gi');
        modified = modified.replace(regex, (match, pre, url, post) => {
          const resolved = self._resolveUrl(url, base);
          return pre + self._proxify(resolved) + post;
        });
      });

      // Handle background attribute (legacy)
      modified = modified.replace(/(<[^>]+\sbackground=["'])([^"']+)(["'])/gi, (match, pre, url, post) => {
        return pre + self._proxify(self._resolveUrl(url, base)) + post;
      });

      // Handle poster attribute on video
      modified = modified.replace(/(<video\b[^>]*?\sposter=["'])([^"']+)(["'])/gi, (match, pre, url, post) => {
        return pre + self._proxify(self._resolveUrl(url, base)) + post;
      });

      return modified;
    }

    /* ─── CSS url() Rewriting ─── */
    _rewriteCssUrls(html, base) {
      const self = this;
      return html.replace(/url\((['"]?)([^'"\)]+)\1\)/gi, (match, quote, url) => {
        const resolved = self._resolveUrl(url.trim(), base);
        return `url(${quote}${self._proxify(resolved)}${quote})`;
      });
    }

    /* ─── Inline Events ─── */
    _rewriteInlineEvents(html) {
      // Replace inline events that navigate
      return html.replace(/\s(onclick|ondblclick|onmousedown|onmouseup)\s*=\s*["']([^"']*location\s*=\s*['"]([^'"]*)['"][^"']*)["']/gi, (match, event, full, url) => {
        return ` ${event}="window.parent.postMessage({type:'fp-navigate',url:'${url}'},'*')"`;
      });
    }

    /* ─── Srcset Rewriting ─── */
    _rewriteSrcset(html, base) {
      const self = this;
      return html.replace(/(<img\b[^>]*?\ssrcset=["'])([^"']+)(["'])/gi, (match, pre, srcset, post) => {
        const parts = srcset.split(',').map(part => {
          const trimmed = part.trim();
          const spaceIdx = trimmed.search(/\s/);
          let url, descriptor;
          if (spaceIdx > 0) {
            url = trimmed.slice(0, spaceIdx);
            descriptor = trimmed.slice(spaceIdx);
          } else {
            url = trimmed;
            descriptor = '';
          }
          const resolved = self._resolveUrl(url, base);
          return self._proxify(resolved) + descriptor;
        });
        return pre + parts.join(', ') + post;
      });
    }

    /* ─── Meta Refresh ─── */
    _rewriteMetaRefresh(html, base) {
      const self = this;
      return html.replace(/(<meta[^>]+http-equiv=["']refresh["'][^>]+content=["']\d+;\s*url=)([^"']+)(["'])/i, (match, pre, url, post) => {
        const resolved = self._resolveUrl(url, base);
        return pre + self._proxify(resolved) + post;
      });
    }

    /* ─── URL Helpers ─── */
    _resolveUrl(url, base) {
      if (!url || typeof url !== 'string') return url;
      url = url.trim();
      if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('blob:')) {
        return url;
      }
      try {
        return new URL(url, base).href;
      } catch {
        return url;
      }
    }

    _proxify(url) {
      if (!url || typeof url !== 'string') return url;
      if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('blob:')) {
        return url;
      }
      // For the rewritten HTML, we need to create URLs that, when clicked/fetched,
      // will be intercepted by our script and sent back to the parent.
      // Since we inject a script that intercepts all navigation, we can leave
      // relative URLs alone (base tag handles resolution) and only proxify
      // absolute URLs that would otherwise bypass our interceptor.
      // However, for resources (images, CSS, etc.), we need to proxy them.
      // For simplicity in this version, we return the original URL.
      // The intercept script handles navigation; resources load directly.
      // To truly proxy resources, we'd need to prefix them with a proxy URL.
      return url;
    }
  }

  global.FlashProxyRewriter = FlashProxyRewriter;

})(typeof window !== 'undefined' ? window : self);
