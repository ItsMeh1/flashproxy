/**
 * Flash Proxy Lite — browser-side HTML rewriter.
 * This rewrites documents already readable by the browser. It cannot make a
 * cross-origin resource readable; that requires an external CORS-capable proxy.
 */
(function (global) {
  'use strict';

  const PASSTHROUGH = /^(?:data:|blob:|javascript:|mailto:|tel:|sms:|about:|#)/i;
  const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'background', 'data', 'manifest', 'usemap']);

  class FlashProxyRewriter {
    constructor(proxy) { this.proxy = proxy; }

    rewrite(html, baseUrl) {
      if (typeof html !== 'string' || !html) return html;
      let base;
      try { base = new URL(baseUrl); } catch { return html; }

      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (!doc) return html;

      const baseElement = doc.querySelector('base[href]');
      if (baseElement) {
        try { base = new URL(baseElement.getAttribute('href'), base); }
        catch { /* retain document URL */ }
      } else {
        const generated = doc.createElement('base');
        generated.href = base.href;
        (doc.head || doc.documentElement).prepend(generated);
      }

      this._rewriteElements(doc, base);
      this._rewriteStyles(doc, base);
      this._rewriteScripts(doc);
      this._injectRuntime(doc, base.href);
      return '<!doctype html>\n' + doc.documentElement.outerHTML;
    }

    _rewriteElements(doc, base) {
      for (const element of doc.querySelectorAll('*')) {
        for (const attr of [...element.attributes]) {
          const name = attr.name.toLowerCase();
          if (URL_ATTRS.has(name)) this._setUrl(element, attr.name, attr.value, base);
          else if (name === 'srcset' || name === 'imagesrcset') element.setAttribute(attr.name, this._rewriteSrcset(attr.value, base));
          else if (name === 'style') element.setAttribute(attr.name, this._rewriteCss(attr.value, base));
        }
        if (element.tagName === 'FORM' && this.proxy.config.blockScripts) element.removeAttribute('onsubmit');
      }

      for (const meta of doc.querySelectorAll('meta[http-equiv="refresh"],meta[http-equiv="Refresh"]')) {
        const content = meta.getAttribute('content');
        if (!content) continue;
        meta.setAttribute('content', content.replace(/(url\s*=\s*)([^;]+)/i, (_, head, value) => `${head}${this._resolve(value.trim(), base)}`));
      }

      if (this.proxy.config.blockScripts) {
        doc.querySelectorAll('script').forEach(script => script.remove());
        doc.querySelectorAll('*').forEach(el => [...el.attributes].forEach(attr => {
          if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
        }));
      }
    }

    _rewriteStyles(doc, base) {
      for (const style of doc.querySelectorAll('style')) style.textContent = this._rewriteCss(style.textContent, base);
      for (const sheet of doc.querySelectorAll('link[rel~="stylesheet"][href]')) this._setUrl(sheet, 'href', sheet.getAttribute('href'), base);
    }

    _rewriteScripts(doc) {
      for (const script of doc.querySelectorAll('script')) {
        const src = script.getAttribute('src');
        if (src) this._setUrl(script, 'src', src, new URL(doc.baseURI));
      }
    }

    _injectRuntime(doc, baseUrl) {
      if (doc.querySelector('script[data-flashproxy-lite-runtime]')) return;
      const script = doc.createElement('script');
      script.dataset.flashproxyLiteRuntime = 'true';
      script.textContent = this._runtime(baseUrl);
      (doc.head || doc.documentElement).append(script);
    }

    _runtime(baseUrl) {
      return `(() => {
        const BASE = ${JSON.stringify(baseUrl)};
        const send = (type, url) => { try { parent.postMessage({ type, url: new URL(url, location.href).href, from: BASE }, '*'); } catch {} };
        document.addEventListener('click', e => { const a = e.composedPath?.().find(x => x?.tagName === 'A'); if (a?.href && parent !== window) { send('fp-navigate', a.href); e.preventDefault(); } }, true);
        document.addEventListener('submit', e => { const form = e.target; if (form?.method?.toLowerCase() === 'get' && parent !== window) { e.preventDefault(); const u = new URL(form.action || location.href); new FormData(form).forEach((v,k) => u.searchParams.append(k, v)); send('fp-navigate', u.href); } }, true);
        const open = window.open; window.open = (url, ...args) => { if (url && parent !== window) { send('fp-navigate', url); return null; } return open.call(window, url, ...args); };
        const push = history.pushState; history.pushState = (s,t,u) => { if (u) send('fp-navigate', new URL(u, location.href).href); return push.call(history,s,t,u); };
        const replace = history.replaceState; history.replaceState = (s,t,u) => { if (u) send('fp-navigate', new URL(u, location.href).href); return replace.call(history,s,t,u); };
      })();`;
    }

    _setUrl(element, attribute, value, base) {
      if (value == null || PASSTHROUGH.test(value.trim())) return;
      const resolved = this._resolve(value, base);
      if (resolved) element.setAttribute(attribute, resolved);
    }

    _resolve(value, base) {
      const trimmed = String(value || '').trim();
      if (!trimmed || PASSTHROUGH.test(trimmed)) return trimmed;
      try { return new URL(trimmed, base).href; } catch { return trimmed; }
    }

    _rewriteCss(css, base) {
      return String(css || '').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, value) => {
        const resolved = this._resolve(value, base);
        return PASSTHROUGH.test(String(value).trim()) ? match : `url(${quote}${resolved}${quote})`;
      }).replace(/@import\s+(['"])(.*?)\1/gi, (match, quote, value) => `@import ${quote}${this._resolve(value, base)}${quote}`);
    }

    _rewriteSrcset(value, base) {
      return String(value).split(',').map(candidate => {
        const match = candidate.trim().match(/^(\S+)(.*)$/s);
        if (!match) return candidate;
        return `${this._resolve(match[1], base)}${match[2]}`;
      }).join(', ');
    }
  }

  global.FlashProxyRewriter = FlashProxyRewriter;
})(typeof window !== 'undefined' ? window : self);
