function json(value) {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

export function buildRuntime(pageUrl, fpPrefix = '/fp') {
  const page = new URL(pageUrl);
  return `(() => {
    'use strict';
    if (window.__FLASH_RUNTIME_INSTALLED__) return;
    window.__FLASH_RUNTIME_INSTALLED__ = true;

    const FP_PREFIX = ${json(fpPrefix)};
    const PAGE_URL = ${json(page.href)};
    const WS_PREFIX = '/wisp/';
    const pageURL = new URL(PAGE_URL);

    const passthrough = (value) => value == null || typeof value !== 'string' || !value.trim() || /^(?:#|data:|blob:|javascript:|mailto:|tel:|sms:|about:|file:|chrome:|chrome-extension:|moz-extension:|view-source:)/i.test(value.trim());
    const absolute = (value, base = pageURL.href) => { try { return new URL(String(value), base).href; } catch { return value; } };
    const toProxy = (value, base = pageURL.href) => {
      if (passthrough(value)) return value;
      const raw = String(value).trim();
      if (raw.startsWith(FP_PREFIX + '/')) return raw;
      const resolved = absolute(raw, base);
      try {
        const u = new URL(resolved);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return value;
        return FP_PREFIX + '/' + u.href;
      } catch { return value; }
    };
    const toWebSocket = (value, base = pageURL.href) => {
      try {
        const u = new URL(String(value), base);
        if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return value;
        return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + WS_PREFIX + u.href;
      } catch { return value; }
    };

    const nativeFetch = window.fetch?.bind(window);
    const NativeXHR = window.XMLHttpRequest;
    const NativeWebSocket = window.WebSocket;
    const NativeEventSource = window.EventSource;
    const NativeWorker = window.Worker;
    const NativeSharedWorker = window.SharedWorker;
    const nativeOpen = window.open?.bind(window);
    const nativePushState = history.pushState.bind(history);
    const nativeReplaceState = history.replaceState.bind(history);
    const nativeSendBeacon = navigator.sendBeacon?.bind(navigator);

    window.__flashproxy = { page: PAGE_URL, prefix: FP_PREFIX };
    window.__flashToProxy = toProxy;
    window.__flashToAbsolute = absolute;
    window.__flashProxyWebSocketUrl = toWebSocket;
    window.__flashNavigate = (value, replace = false) => {
      const url = absolute(value);
      if (/^https?:/i.test(url)) window.top.postMessage({ type: 'flash:navigate', url, replace }, '*');
    };

    if (nativeFetch) {
      window.fetch = function(input, init) {
        if (input instanceof Request) input = new Request(toProxy(input.url), input);
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
      window.WebSocket = function(url, protocols) {
        const target = toWebSocket(url);
        return protocols === undefined ? new NativeWebSocket(target) : new NativeWebSocket(target, protocols);
      };
      window.WebSocket.prototype = NativeWebSocket.prototype;
      for (const key of ['CONNECTING','OPEN','CLOSING','CLOSED']) window.WebSocket[key] = NativeWebSocket[key];
    }

    if (NativeEventSource) {
      window.EventSource = function(url, options) { return new NativeEventSource(toProxy(url), options); };
      window.EventSource.prototype = NativeEventSource.prototype;
      for (const key of ['CONNECTING','OPEN','CLOSED']) window.EventSource[key] = NativeEventSource[key];
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

    if (nativeOpen) window.open = (url, ...args) => nativeOpen(toProxy(url), ...args);
    if (nativeSendBeacon) navigator.sendBeacon = (url, data) => nativeSendBeacon(toProxy(url), data);

    history.pushState = (state, title, url) => nativePushState(state, title, url == null ? url : toProxy(url));
    history.replaceState = (state, title, url) => nativeReplaceState(state, title, url == null ? url : toProxy(url));

    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      const n = String(name).toLowerCase();
      if (['href','src','action','formaction','poster','cite','background','data','manifest'].includes(n)) value = toProxy(value);
      return originalSetAttribute.call(this, name, value);
    };

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

    console.debug('[FlashProxy] runtime active for', PAGE_URL);
  })();`;
}
