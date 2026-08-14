// This script is injected into every proxied page by rewriters/html.js
// It is NOT served as a separate file.

(function(){
    const __pp = '/proxy';
    const __origin = new URL(window.__flashproxy_page || location.href).origin;
    
    // fetch
    const _fetch = window.fetch;
    window.fetch = function(u, opts) {
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
    };
    
    // XMLHttpRequest
    const _XHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new _XHR();
        const _open = xhr.open;
        xhr.open = function(m, u, a, user, pw) {
            if (typeof u === 'string') {
                if (u.startsWith('http')) u = __pp + '/' + u;
                else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
            }
            return _open.call(xhr, m, u, a, user, pw);
        };
        return xhr;
    };
    
    // WebSocket → Wisp
    const _WS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        if (typeof url === 'string') {
            if (url.startsWith('ws://') || url.startsWith('wss://')) {
                const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
                url = proto + '//' + location.host + '/wisp/' + url;
            }
        }
        return new _WS(url, protocols);
    };
    
    // EventSource
    const _ES = window.EventSource;
    window.EventSource = function(url, opts) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return new _ES(url, opts);
    };
    
    // Worker
    const _Worker = window.Worker;
    window.Worker = function(url, opts) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return new _Worker(url, opts);
    };
    
    // location spoofing
    const _loc = new URL(window.__flashproxy_page || location.href);
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
    
    console.log('[FlashProxy] Runtime active');
})();
