// THIS FILE IS NOT SERVED DIRECTLY.
// It is inlined into every proxied page by rewriters/html.js.

(function(){
    'use strict';
    
    const __pp = '/fp';
    const __page = window.__flashproxy_page || location.href;
    const __origin = new URL(__page).origin;
    
    const _fetch = window.fetch;
    const _XHR = window.XMLHttpRequest;
    const _WS = window.WebSocket;
    const _ES = window.EventSource;
    const _Worker = window.Worker;
    const _open = window.open;
    const _sendBeacon = navigator.sendBeacon;
    const _pushState = history.pushState;
    const _replaceState = history.replaceState;
    
    window.fetch = function(u, opts) {
        try {
            if (typeof u === 'string') {
                if (u.startsWith('http')) u = __pp + '/' + u;
                else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
            } else if (u instanceof Request) {
                const url = u.url;
                const newUrl = url.startsWith('http') ? __pp + '/' + url 
                    : url.startsWith('/') ? __pp + '/' + __origin + url : url;
                u = new Request(newUrl, u);
            }
            return _fetch(u, opts);
        } catch (e) {
            return new Promise((res, rej) => {
                const x = new _XHR();
                x.open(opts?.method || 'GET', u, true);
                if (opts?.headers) {
                    for (const [k, v] of Object.entries(opts.headers)) x.setRequestHeader(k, v);
                }
                x.onload = () => res(new Response(x.response, { status: x.status }));
                x.onerror = rej;
                x.send(opts?.body || null);
            });
        }
    };
    
    window.XMLHttpRequest = function() {
        const x = new _XHR();
        const __open = x.open;
        x.open = function(m, u, a, user, pw) {
            if (typeof u === 'string') {
                if (u.startsWith('http')) u = __pp + '/' + u;
                else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
            }
            return __open.call(x, m, u, a, user, pw);
        };
        return x;
    };
    
    window.WebSocket = function(url, p) {
        if (typeof url === 'string' && (url.startsWith('ws://') || url.startsWith('wss://'))) {
            const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            url = proto + '//' + location.host + '/wisp/' + url;
        }
        return new _WS(url, p);
    };
    
    window.EventSource = function(url, o) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return new _ES(url, o);
    };
    
    window.Worker = function(url, o) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return new _Worker(url, o);
    };
    
    window.open = function(url, t, f) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (u.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return _open(url, t, f);
    };
    
    navigator.sendBeacon = function(url, d) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return _sendBeacon.call(navigator, url, d);
    };
    
    const _loc = new URL(__page);
    Object.defineProperty(window, 'location', {
        get: () => _loc,
        set: (v) => {
            if (typeof v === 'string') {
                if (v.startsWith('http')) window.top.postMessage({__fp_nav: v}, '*');
                else if (v.startsWith('/')) window.top.postMessage({__fp_nav: __origin + v}, '*');
                else _loc.href = v;
            }
        }
    });
    
    Object.defineProperty(document, 'location', {
        get: () => _loc,
        set: (v) => { window.location = v; }
    });
    
    history.pushState = function(s, t, u) {
        if (typeof u === 'string') {
            if (u.startsWith('http')) u = __pp + '/' + u;
            else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
        }
        return _pushState.call(history, s, t, u);
    };
    
    history.replaceState = function(s, t, u) {
        if (typeof u === 'string') {
            if (u.startsWith('http')) u = __pp + '/' + u;
            else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
        }
        return _replaceState.call(history, s, t, u);
    };
    
    console.log('[FlashProxy] Runtime active');
})();
