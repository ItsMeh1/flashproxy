// THIS FILE IS NOT SERVED DIRECTLY.
// It is inlined into every proxied page by rewriters/html.js.
// Edit here, then sync the changes into html.js.

(function(){
    const __pp = '/proxy';
    const __page = window.__flashproxy_page || location.href;
    const __origin = new URL(__page).origin;
    
    const _f = window.fetch;
    window.fetch = function(u, o) {
        if (typeof u === 'string') {
            if (u.startsWith('http')) u = __pp + '/' + u;
            else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
        } else if (u instanceof Request) {
            const url = u.url;
            const newUrl = url.startsWith('http') ? __pp + '/' + url 
                : url.startsWith('/') ? __pp + '/' + __origin + url : url;
            u = new Request(newUrl, u);
        }
        return _f(u, o);
    };
    
    const _x = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new _x();
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
    
    const _w = window.WebSocket;
    window.WebSocket = function(url, p) {
        if (typeof url === 'string' && (url.startsWith('ws://') || url.startsWith('wss://'))) {
            const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            url = proto + '//' + location.host + '/wisp/' + url;
        }
        return new _w(url, p);
    };
    
    const _e = window.EventSource;
    window.EventSource = function(url, o) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return new _e(url, o);
    };
    
    const _Worker = window.Worker;
    window.Worker = function(url, o) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return new _Worker(url, o);
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
    
    console.log('[FlashProxy] Runtime active');
})();
