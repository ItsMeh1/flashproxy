// This runs in the BACKGROUND of the browser
// It intercepts EVERY request from the iframe

const PROXY_PREFIX = '/proxy';

self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
    event.waitUntil(self.clients.claim());
});

// INTERCEPT ALL FETCH REQUESTS
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    console.log('SW intercepted:', url.href);
    
    // Only proxy requests that go through /proxy/
    if (url.pathname.startsWith(PROXY_PREFIX)) {
        event.respondWith(handleProxyRequest(event.request));
    }
    // Everything else (your UI files) passes through normally
});

async function handleProxyRequest(request) {
    // Extract the REAL URL from /proxy/https://example.com
    const url = new URL(request.url);
    const realUrl = url.pathname.replace(PROXY_PREFIX + '/', '') + url.search;
    
    console.log('Proxying to:', realUrl);
    
    try {
        // Fetch the real website
        const response = await fetch(realUrl, {
            method: request.method,
            headers: {
                'User-Agent': request.headers.get('user-agent') || '',
                'Accept': request.headers.get('accept') || '*/*',
                'Accept-Language': request.headers.get('accept-language') || 'en-US',
            },
            // Don't forward cookies yet — we'll handle that later
        });
        
        const contentType = response.headers.get('content-type') || '';
        
        // === REWRITE BASED ON CONTENT TYPE ===
        
        if (contentType.includes('text/html')) {
            const html = await response.text();
            const rewritten = rewriteHtml(html, realUrl);
            return new Response(rewritten, {
                status: response.status,
                statusText: response.statusText,
                headers: {
                    'Content-Type': 'text/html',
                    // Strip CSP so our injected scripts work
                    // 'Content-Security-Policy': '',
                }
            });
        }
        
        if (contentType.includes('text/css')) {
            const css = await response.text();
            const rewritten = rewriteCss(css, realUrl);
            return new Response(rewritten, {
                status: response.status,
                headers: { 'Content-Type': 'text/css' }
            });
        }
        
        if (contentType.includes('javascript') || contentType.includes('ecmascript')) {
            const js = await response.text();
            const rewritten = rewriteJs(js, realUrl);
            return new Response(rewritten, {
                status: response.status,
                headers: { 'Content-Type': 'application/javascript' }
            });
        }
        
        // Images, fonts, etc. — pass through unchanged
        return response;
        
    } catch (error) {
        return new Response(`Proxy Error: ${error.message}`, { status: 500 });
    }
}

// ============ HTML REWRITER ============
function rewriteHtml(html, pageUrl) {
    const proxyPrefix = PROXY_PREFIX;
    const base = new URL(pageUrl);
    
    // Rewrite absolute URLs in attributes
    html = html.replace(
        /(href|src|action)=["'](https?:\/\/[^"']+)["']/gi,
        (match, attr, url) => `${attr}="${proxyPrefix}/${url}"`
    );
    
    // Rewrite root-relative URLs
    html = html.replace(
        /(href|src|action)=["'](\/[^"']+)["']/gi,
        (match, attr, path) => `${attr}="${proxyPrefix}/${base.origin}${path}"`
    );
    
    // Rewrite protocol-relative URLs
    html = html.replace(
        /(href|src|action)=["'](\/\/[^"']+)["']/gi,
        (match, attr, url) => `${attr}="${proxyPrefix}/https:${url}"`
    );
    
    // Inject our hijack script at the top
    const injection = `<script>
    (function(){
        const _p = '${proxyPrefix}';
        const _o = '${base.origin}';
        
        // Hijack fetch
        const _f = window.fetch;
        window.fetch = function(u, opts) {
            if (typeof u === 'string') {
                if (u.startsWith('http')) u = _p + '/' + u;
                else if (u.startsWith('/')) u = _p + '/' + _o + u;
            }
            return _f(u, opts);
        };
        
        // Hijack XMLHttpRequest
        const _x = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
            const xhr = new _x();
            const _open = xhr.open;
            xhr.open = function(m, u, a, user, pw) {
                if (typeof u === 'string') {
                    if (u.startsWith('http')) u = _p + '/' + u;
                    else if (u.startsWith('/')) u = _p + '/' + _o + u;
                }
                return _open.call(xhr, m, u, a, user, pw);
            };
            return xhr;
        };
        
        // Fake window.location
        const _loc = new URL('${pageUrl}');
        Object.defineProperty(window, 'location', {
            get: () => _loc,
            set: (url) => { window.top.postMessage({type:'navigate', url}, '*'); }
        });
        
        console.log('Proxy injections active on', _loc.href);
    })();
    </script>`;
    
    // Inject after <head> or at start
    if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>' + injection);
    } else {
        html = injection + html;
    }
    
    return html;
}

// ============ CSS REWRITER ============
function rewriteCss(css, pageUrl) {
    const proxyPrefix = PROXY_PREFIX;
    const base = new URL(pageUrl);
    
    // Rewrite url(...) references
    css = css.replace(/url\(["']?([^"')]+)["']?\)/g, (match, url) => {
        if (url.startsWith('data:') || url.startsWith('#')) return match;
        if (url.startsWith('http')) return `url("${proxyPrefix}/${url}")`;
        if (url.startsWith('//')) return `url("${proxyPrefix}/https:${url}")`;
        if (url.startsWith('/')) return `url("${proxyPrefix}/${base.origin}${url}")`;
        // Relative
        const resolved = new URL(url, base).href;
        return `url("${proxyPrefix}/${resolved}")`;
    });
    
    // Rewrite @import
    css = css.replace(/@import\s+(?:url\()?["']?([^"')]+)["']?\)?/g, (match, url) => {
        if (url.startsWith('http')) return `@import "${proxyPrefix}/${url}"`;
        const resolved = new URL(url, base).href;
        return `@import "${proxyPrefix}/${resolved}"`;
    });
    
    return css;
}

// ============ JS REWRITER (Simple - Regex Based) ============
// NOTE: This is a BASIC rewriter. Real ones use AST parsing.
function rewriteJs(js, pageUrl) {
    const proxyPrefix = PROXY_PREFIX;
    const base = new URL(pageUrl);
    
    // Rewrite string literals that look like absolute URLs
    // This is DANGEROUS and will break some code — it's just a demo!
    js = js.replace(/(["'])(https?:\/\/[^"']+)\1/g, (match, quote, url) => {
        return `${quote}${proxyPrefix}/${url}${quote}`;
    });
    
    // Rewrite root-relative paths in strings
    js = js.replace(/(["'])(\/[^"']+)\1/g, (match, quote, path) => {
        return `${quote}${proxyPrefix}/${base.origin}${path}${quote}`;
    });
    
    return js;
}
