export function rewriteHtml(html, pageUrl, proxyPrefix) {
    const base = new URL(pageUrl);
    
    // Rewrite absolute URLs
    html = html.replace(
        /(\s(?:href|src|action|poster|data-src|data-href|data-url|data-icon|content)=["'])(https?:\/\/[^"']+)(["'])/gi,
        (m, pre, url, suf) => `${pre}${proxyPrefix}/${url}${suf}`
    );
    
    // Rewrite root-relative URLs
    html = html.replace(
        /(\s(?:href|src|action|poster|data-src|data-href|data-url|data-icon|content)=["'])(\/[^"']+)(["'])/gi,
        (m, pre, path, suf) => `${pre}${proxyPrefix}/${base.origin}${path}${suf}`
    );
    
    // Rewrite protocol-relative URLs
    html = html.replace(
        /(\s(?:href|src|action|poster|data-src|data-href|data-url|data-icon|content)=["'])(\/\/[^"']+)(["'])/gi,
        (m, pre, url, suf) => `${pre}${proxyPrefix}/https:${url}${suf}`
    );
    
    // Rewrite <base href="...">
    html = html.replace(
        /(<base\s+[^>]*href=["'])(https?:\/\/[^"']+)(["'])/gi,
        (m, pre, url, suf) => `${pre}${proxyPrefix}/${url}${suf}`
    );
    html = html.replace(
        /(<base\s+[^>]*href=["'])(\/[^"']+)(["'])/gi,
        (m, pre, path, suf) => `${pre}${proxyPrefix}/${base.origin}${path}${suf}`
    );
    
    // Remove manifest links (PWA conflicts)
    html = html.replace(/<link[^>]*rel=["']manifest["'][^>]*>/gi, '');
    
    // Remove CSP meta tags
    html = html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
    
    // Inject proxy bootstrap
    const injection = `<script data-flashproxy-inject>
(function(){
    const __pp = '${proxyPrefix}';
    const __origin = '${base.origin}';
    const __page = '${pageUrl}';
    
    const __origFetch = window.fetch;
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
        return __origFetch(u, opts);
    };
    
    const __origXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new __origXHR();
        const __open = xhr.open;
        xhr.open = function(m, u, a, user, pw) {
            if (typeof u === 'string') {
                if (u.startsWith('http')) u = __pp + '/' + u;
                else if (u.startsWith('/')) u = __pp + '/' + __origin + u;
            }
            return __open.call(xhr, m, u, a, user, pw);
    };
        return xhr;
    };
    
    const __origWS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        if (typeof url === 'string') {
            if (url.startsWith('ws://') || url.startsWith('wss://')) {
                url = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/wisp/' + url;
            }
        }
        return new __origWS(url, protocols);
    };
    
    const __origES = window.EventSource;
    window.EventSource = function(url, opts) {
        if (typeof url === 'string') {
            if (url.startsWith('http')) url = __pp + '/' + url;
            else if (url.startsWith('/')) url = __pp + '/' + __origin + url;
        }
        return new __origES(url, opts);
    };
    
    const __loc = new URL(__page);
    Object.defineProperty(window, 'location', {
        get: () => __loc,
        set: (v) => {
            if (typeof v === 'string') {
                if (v.startsWith('http')) window.top.postMessage({__fp_nav: v}, '*');
                else if (v.startsWith('/')) window.top.postMessage({__fp_nav: __origin + v}, '*');
                else __loc.href = v;
            }
        }
    });
    
    Object.defineProperty(document, 'location', {
        get: () => __loc,
        set: (v) => { window.location = v; }
    });
    
    console.log('[FlashProxy] Runtime active on', __page);
})();
</script>`;
    
    if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>' + injection);
    } else if (html.includes('<html>')) {
        html = html.replace('<html>', '<html>' + injection);
    } else {
        html = injection + html;
    }
    
    return html;
}
