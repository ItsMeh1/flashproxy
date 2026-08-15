function json(value) {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

export function buildRuntime(pageUrl, fpPrefix = '/fp') {
  const page = new URL(pageUrl);
  const origin = page.origin;
  const wsPrefix = '/wisp/';

  return `(() => {
    'use strict';
    const FP_PREFIX = ${json(fpPrefix)};
    const PAGE_URL = ${json(page.href)};
    const PAGE_ORIGIN = ${json(origin)};
    const WS_PREFIX = ${json(wsPrefix)};
    const pageURL = new URL(PAGE_URL);

    const toAbsolute = (value) => {
      if (value == null || typeof value !== 'string') return value;
      try { return new URL(value, pageURL).href; } catch { return value; }
    };

    const toProxy = (value) => {
      if (value == null || typeof value !== 'string') return value;
      const v = value.trim();
      if (!v || /^(?:#|data:|blob:|javascript:|mailto:|tel:|sms:|about:|file:)/i.test(v)) return value;
      if (v.startsWith(FP_PREFIX + '/')) return v;
      try {
        const u = new URL(v, pageURL);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return value;
        return FP_PREFIX + '/' + u.href;
      } catch { return value; }
    };

    const toWebSocket = (value) => {
      if (typeof value !== 'string') return value;
      try {
        const u = new URL(value, pageURL);
        if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return value;
        return WS_PREFIX + u.href;
      } catch { return value; }
    };

    const nativeFetch = window.fetch.bind(window);
    const NativeXHR = window.XMLHttpRequest;
    const NativeWebSocket = window.WebSocket;
    const NativeEventSource = window.EventSource;
    const NativeWorker = window.Worker;
    const nativeOpen = window.open.bind(window);
    const nativePushState = history.pushState.bind(history);
    const nativeReplaceState = history.replaceState.bind(history);
    const nativeSendBeacon = navigator.sendBeacon?.bind(navigator);

    const locationShim = {
      get href() { return pageURL.href; },
      set href(value) { window.__flashNavigate(value); },
      get protocol() { return pageURL.protocol; },
      get host() { return pageURL.host; },
      get hostname() { return pageURL.hostname; },
      get port() { return pageURL.port; },
      get pathname() { return pageURL.pathname; },
      get search() { return pageURL.search; },
      get hash() { return pageURL.hash; },
      get origin() { return pageURL.origin; },
      assign(value) { window.__flashNavigate(value); },
      replace(value) { window.__flashNavigate(value, true); },
      reload() { window.location.reload(); },
      toString() { return pageURL.href; }
    };

    window.__flashproxy = { page: pageURL.href, origin: PAGE_ORIGIN, prefix: FP_PREFIX };
    window.__flashproxy_page = pageURL.href;
    window.__flashLocation = locationShim;
    window.__flashToProxy = toProxy;
    window.__flashToAbsolute = toAbsolute;
    window.__flashNavigate = (value) => {
      const target = toAbsolute(value);
      if (typeof target === 'string') window.top.postMessage({ type: 'flash:navigate', url: target }, '*');
    };

    window.__fp$get = (object, property) => {
      if ((object === window || object === self || object === globalThis || object === document) && property === 'location') return locationShim;
      return object?.[property];
    };
    window.__fp$set = (object, property, value) => {
      if ((object === window || object === self || object === globalThis || object === document) && property === 'location') {
        window.__flashNavigate(value);
        return true;
      }
      object[property] = value;
      return true;
    };

    window.fetch = function(input, init) {
      if (input instanceof Request) {
        input = new Request(toProxy(input.url), input);
      } else {
        input = toProxy(input);
      }
      return nativeFetch(input, init);
    };

    window.XMLHttpRequest = function() {
      const xhr = new NativeXHR();
      const open = xhr.open.bind(xhr);
      xhr.open = function(method, url, async, user, password) {
        return open(method, toProxy(url), async, user, password);
      };
      return xhr;
    };
    window.XMLHttpRequest.prototype = NativeXHR.prototype;

    window.WebSocket = function(url, protocols) {
      return protocols === undefined ? new NativeWebSocket(toWebSocket(url)) : new NativeWebSocket(toWebSocket(url), protocols);
    };
    window.WebSocket.prototype = NativeWebSocket.prototype;

    if (NativeEventSource) {
      window.EventSource = function(url, options) { return new NativeEventSource(toProxy(url), options); };
      window.EventSource.prototype = NativeEventSource.prototype;
    }

    if (NativeWorker) {
      window.Worker = function(url, options) { return new NativeWorker(toProxy(url), options); };
      window.Worker.prototype = NativeWorker.prototype;
    }

    window.open = function(url, target, features) {
      return nativeOpen(toProxy(url), target, features);
    };

    if (nativeSendBeacon) {
      navigator.sendBeacon = function(url, data) { return nativeSendBeacon(toProxy(url), data); };
    }

    history.pushState = function(state, title, url) {
      return nativePushState(state, title, typeof url === 'string' ? toProxy(url) : url);
    };
    history.replaceState = function(state, title, url) {
      return nativeReplaceState(state, title, typeof url === 'string' ? toProxy(url) : url);
    };

    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      const n = String(name).toLowerCase();
      if (['href', 'src', 'action', 'poster', 'data'].includes(n)) value = toProxy(value);
      return originalSetAttribute.call(this, name, value);
    };

    const originalCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function(name, options) {
      const element = originalCreateElement.call(this, name, options);
      return element;
    };

    window.addEventListener('click', (event) => {
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = anchor.getAttribute('href');
      if (!href || /^(?:#|javascript:|mailto:|tel:)/i.test(href)) return;
      const absolute = toAbsolute(href);
      if (!/^https?:/i.test(absolute)) return;
      event.preventDefault();
      window.__flashNavigate(absolute);
    }, true);

    console.debug('[FlashProxy] runtime active for', PAGE_URL);
  })();`;
}
