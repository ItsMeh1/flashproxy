// THIS FILE IS NOT SERVED DIRECTLY.
// Sync changes into rewriters/html.js injection block.

(function(){
    'use strict';
    
    const __pp = '/fp';
    const __page = window.__flashproxy_page || location.href;
    const __origin = new URL(__page).origin;
    
    // =====================
    // FAKE LOCATION OBJECT
    // =====================
    const __fp$loc = new URL(__page);
    const __fp$locObj = {
        get href() { return __fp$loc.href; },
        set href(v) { window.top.postMessage({__fp_nav: v}, '*'); },
        get protocol() { return __fp$loc.protocol; },
        get host() { return __fp$loc.host; },
        get hostname() { return __fp$loc.hostname; },
        get port() { return __fp$loc.port; },
        get pathname() { return __fp$loc.pathname; },
        get search() { return __fp$loc.search; },
        get hash() { return __fp$loc.hash; },
        get origin() { return __fp$loc.origin; },
        assign: function(u) { window.location = u; },
        replace: function(u) { window.location = u; },
        reload: function() { location.reload(); },
        toString: function() { return __fp$loc.href; },
    };
    
    // =====================
    // DPSC HELPERS
    // =====================
    window.__fp$get = function(obj, prop) {
        if (prop === 'location') {
            if (obj === window || obj === self || obj === globalThis || obj === document || obj === top || obj === parent) {
                return __fp$locObj;
            }
        }
        // For nested access like window.location.href
        if (obj === __fp$locObj) {
            return __fp$locObj[prop];
        }
        return obj[prop];
    };
    
    window.__fp$set = function(obj, prop, val) {
        if (prop === 'location') {
            if (obj === window || obj === self || obj === globalThis || obj === document || obj === top || obj === parent) {
                window.location = val;
                return true;
            }
        }
        if (obj === __fp$locObj) {
            __fp$locObj[prop] = val;
            return true;
        }
        obj[prop] = val;
        return true;
    };
    
    window.__fp$eval = function(code) {
        // Lightweight runtime rewriter for eval strings
        // Server already rewrote static evals; this handles dynamic cases
        return code;
    };
    
    // =====================
    // API HIJACKS
    // =====================
    const _f = window.fetch;
    const _x = window.XMLHttpRequest;
    const _w = window.WebSocket;
    const _e = window.EventSource;
    const _W = window.Worker;
    const _o = window.open;
    const _sb = navigator.sendBeacon;
    const _ps = history.pushState;
    const _rs = history.replaceState;
    
    window.fetch = function(u, o) {
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
            return _f(u, o);
        } catch (e) {
            return new Promise((res, rej) => {
                const x = new _x();
                x.open(o?.method || 'GET', u, true);
                if (o?.headers) for (const [k, v] of Object.entries(o.headers)) x.setRequestHeader(k, v);
                x.onload = () => res(new Response(x.response, { status: x.status }));
                x.onerror = rej;
                x.send(o?.body || null);
            });
        }
    };
    
    window.XMLHttpRequest = function() {
        const x = new _x();
        const _open = x.open;
        x.open = function(m, u, a, user, pw) {
            if (typeof u === 'string') {
                if (u.startsWith('http')) u = __pp + '/' + u;
                else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
            }
            return _open.call(x, m, u, a, user, pw);
        };
        return x;
    };
    
    window.WebSocket = function(url, p) {
        if (typeof url === 'string' && (url.startsWith('ws://') || url.startsWith('wss://'))) {
            url = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/wisp/' + url;
        }
        return new _w(url, p);
    };
    
    window.EventSource = function(url, o) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return new _e(url, o);
    };
    
    window.Worker = function(url, o) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return new _W(url, o);
    };
    
    window.open = function(url, t, f) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return _o(url, t, f);
    };
    
    navigator.sendBeacon = function(url, d) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return _sb.call(navigator, url, d);
    };
    
    history.pushState = function(s, t, u) {
        if (typeof u === 'string') {
            if (u.startsWith('http')) u = __pp + '/' + u;
            else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
        }
        return _ps.call(history, s, t, u);
    };
    
    history.replaceState = function(s, t, u) {
        if (typeof u === 'string') {
            if (u.startsWith('http')) u = __pp + '/' + u;
            else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
        }
        return _rs.call(history, s, t, u);
    };
    
    console.log('[FlashProxy] Runtime active');
})();
