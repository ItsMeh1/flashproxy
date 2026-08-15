function json(value) {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

export function buildRuntime(pageUrl, fpPrefix = '/fp') {
  const page = new URL(pageUrl);
  const wsPrefix = '/wisp/';
  return `(() => {
    'use strict';
    if (window.__FLASH_RUNTIME_INSTALLED__) return;
    window.__FLASH_RUNTIME_INSTALLED__ = true;

    const FP_PREFIX = ${json(fpPrefix)};
    const PAGE_URL = ${json(page.href)};
    const WS_PREFIX = ${json(wsPrefix)};
    const pageURL = new URL(PAGE_URL);
    const HTTP_RE = /^https?:$/i;
    const WS_RE = /^wss?:$/i;
    const PASSTHROUGH_RE = /^(?:#|data:|blob:|javascript:|mailto:|tel:|sms:|about:|file:|chrome:|chrome-extension:|moz-extension:|view-source:)/i;

    const passthrough = value => value == null || typeof value !== 'string' || !value.trim() || PASSTHROUGH_RE.test(value.trim());
    const absolute = (value, base = pageURL.href) => {
      try { return new URL(String(value), base).href; } catch { return value; }
    };
    const toProxy = (value, base = pageURL.href) => {
      if (passthrough(value)) return value;
      const raw = String(value).trim();
      if (raw.startsWith(FP_PREFIX + '/')) return raw;
      const resolved = absolute(raw, base);
      try {
        const url = new URL(resolved);
        return HTTP_RE.test(url.protocol) ? FP_PREFIX + '/' + url.href : value;
      } catch { return value; }
    };
    const toWebSocket = (value, base = pageURL.href) => {
      try {
        const url = new URL(String(value), base);
        if (!WS_RE.test(url.protocol)) return value;
        const localScheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return localScheme + '//' + location.host + WS_PREFIX + url.href;
      } catch { return value; }
    };
    const rewriteNode = node => {
      if (!(node instanceof Element)) return;
      const attrs = ['href','src','action','formaction','poster','cite','background','data','manifest','longdesc','usemap'];
      for (const name of attrs) {
        if (node.hasAttribute(name)) node.setAttribute(name, toProxy(node.getAttribute(name)));
      }
      for (const name of ['srcset','imagesrcset']) {
        if (node.hasAttribute(name)) {
          node.setAttribute(name, node.getAttribute(name).split(',').map(item => {
            const m = item.trim().match(/^(\\S+)(.*)$/s);
            return m ? toProxy(m[1]) + m[2] : item;
          }).join(', '));
        }
      }
      if (node.hasAttribute('style')) node.setAttribute('style', node.getAttribute('style'));
    };

    const nativeFetch = window.fetch?.bind(window);
    const NativeRequest = window.Request;
    const NativeXHR = window.XMLHttpRequest;
    const NativeWebSocket = window.WebSocket;
    const NativeEventSource = window.EventSource;
    const NativeWorker = window.Worker;
    const NativeSharedWorker = window.SharedWorker;
    const nativeOpen = window.open?.bind(window);
    const nativeSendBeacon = navigator.sendBeacon?.bind(navigator);
    const nativePushState = history.pushState.bind(history);
    const nativeReplaceState = history.replaceState.bind(history);

    window.__flashproxy = { page: PAGE_URL, prefix: FP_PREFIX, wsPrefix: WS_PREFIX };
    window.__flashToProxy = toProxy;
    window.__flashToAbsolute = absolute;
    window.__flashProxyWebSocketUrl = toWebSocket;
    window.__flashNavigate = (value, replace = false) => {
      const url = absolute(value);
      if (HTTP_RE.test(new URL(url, pageURL).protocol)) window.top.postMessage({ type: 'flash:navigate', url, replace }, '*');
    };

    if (nativeFetch) {
      window.fetch = function(input, init) {
        if (NativeRequest && input instanceof NativeRequest) input = new NativeRequest(toProxy(input.url), input);
        else input = toProxy(input);
        return nativeFetch(input, init);
      };
    }

    if (NativeXHR) {
      const open = NativeXHR.prototype.open;
      NativeXHR.prototype.open = function(method, url, ...rest) {
        return open.call(this, method, toProxy(url), ...rest);
      };
    }

    if (NativeWebSocket) {
      const WrappedWebSocket = function(url, protocols) {
        const target = toWebSocket(url);
        return protocols === undefined ? new NativeWebSocket(target) : new NativeWebSocket(target, protocols);
      };
      WrappedWebSocket.prototype = NativeWebSocket.prototype;
      Object.defineProperties(WrappedWebSocket, {
        CONNECTING: { value: NativeWebSocket.CONNECTING }, OPEN: { value: NativeWebSocket.OPEN },
        CLOSING: { value: NativeWebSocket.CLOSING }, CLOSED: { value: NativeWebSocket.CLOSED }
      });
      window.WebSocket = WrappedWebSocket;
    }

    if (NativeEventSource) {
      const WrappedEventSource = function(url, options) { return new NativeEventSource(toProxy(url), options); };
      WrappedEventSource.prototype = NativeEventSource.prototype;
      for (const key of ['CONNECTING', 'OPEN', 'CLOSED']) Object.defineProperty(WrappedEventSource, key, { value: NativeEventSource[key] });
      window.EventSource = WrappedEventSource;
    }

    if (NativeWorker) {
      window.Worker = function(url, options) { return new NativeWorker(toProxy(url), options); };
      window.Worker.prototype = NativeWorker.prototype;
    }
    if (NativeSharedWorker) {
      window.SharedWorker = function(url, nameOrOptions, options) {
        const proxied = toProxy(url);
        return arguments.length === 2 ? new NativeSharedWorker(proxied, nameOrOptions) : new NativeSharedWorker(proxied, nameOrOptions, options);
      };
      window.SharedWorker.prototype = NativeSharedWorker.prototype;
    }

    if (nativeOpen) window.open = (url, ...args) => nativeOpen(url == null ? url : toProxy(url), ...args);
    if (nativeSendBeacon) navigator.sendBeacon = (url, data) => nativeSendBeacon(toProxy(url), data);

    history.pushState = (state, title, url) => nativePushState(state, title, url == null ? url : toProxy(url));
    history.replaceState = (state, title, url) => nativeReplaceState(state, title, url == null ? url : toProxy(url));

    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      const n = String(name).toLowerCase();
      if (['href','src','action','formaction','poster','cite','background','data','manifest','longdesc','usemap'].includes(n)) value = toProxy(value);
      if (n === 'srcset' || n === 'imagesrcset') {
        value = String(value).split(',').map(item => {
          const m = item.trim().match(/^(\\S+)(.*)$/s);
          return m ? toProxy(m[1]) + m[2] : item;
        }).join(', ');
      }
      return originalSetAttribute.call(this, name, value);
    };

    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') rewriteNode(record.target);
        for (const node of record.addedNodes) {
          rewriteNode(node);
          if (node.querySelectorAll) node.querySelectorAll('[href],[src],[action],[formaction],[poster],[cite],[background],[data],[manifest],[srcset],[imagesrcset]').forEach(rewriteNode);
        }
      }
    });
    observer.observe(document.documentElement || document, { subtree: true, childList: true, attributes: true, attributeFilter: ['href','src','action','formaction','poster','cite','background','data','manifest','longdesc','usemap','srcset','imagesrcset'] });

    window.addEventListener('click', event => {
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = anchor.getAttribute('href');
      if (!href || /^(?:#|javascript:|mailto:|tel:)/i.test(href)) return;
      const url = absolute(href);
      if (!/^https?:/i.test(url)) return;
      event.preventDefault();
      window.__flashNavigate(url);
    }, true);

    rewriteNode(document.documentElement);
    console.debug('[FlashProxy] runtime active for', PAGE_URL);
  })();`;
}
