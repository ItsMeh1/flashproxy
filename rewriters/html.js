export function rewriteHtml(html, pageUrl, proxyPrefix) {
    const base = new URL(pageUrl);
    
    // Rewrite absolute URLs in attributes
    html = html.replace(
        /(\s(?:href|src|action|poster|data-src|data-href|data-url|content)=["'])(https?:\/\/[^"']+)(["'])/gi,
        (m, pre, url, suf) => `${pre}${proxyPrefix}/${url}${suf}`
    );
    
    // Rewrite root-relative URLs
    html = html.replace(
        /(\s(?:href|src|action|poster|data-src|data-href|data-url|content)=["'])(\/[^"']+)(["'])/gi,
        (m, pre, path, suf) => `${pre}${proxyPrefix}/${base.origin}${path}${suf}`
    );
    
    // Rewrite protocol-relative URLs
    html = html.replace(
        /(\s(?:href|src|action|poster|data-src|data-href|data-url|content)=["'])(\/\/[^"']+)(["'])/gi,
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
    const injection = `<script data-flashproxy>
(function(){
    const __pp='${proxyPrefix}';
    const __page='${pageUrl}';
    const __origin='${base.origin}';
    window.__flashproxy_page=__page;
    
    const _f=window.fetch;
    window.fetch=function(u,o){
        if(typeof u==='string'){
            if(u.startsWith('http'))u=__pp+'/'+u;
            else if(u.startsWith('/'))u=__pp+'/'+__origin+u;
        }else if(u instanceof Request){
            const r=u.url;
            u=new Request(r.startsWith('http')?__pp+'/'+r:r.startsWith('/')?__pp+'/'+__origin+r:r,u);
        }
        return _f(u,o);
    };
    
    const _x=window.XMLHttpRequest;
    window.XMLHttpRequest=function(){
        const x=new _x(),o=x.open;
        x.open=function(m,u,a,user,pw){
            if(typeof u==='string'){
                if(u.startsWith('http'))u=__pp+'/'+u;
                else if(u.startsWith('/'))u=__pp+'/'+__origin+u;
            }
            return o.call(x,m,u,a,user,pw);
        };
        return x;
    };
    
    const _w=window.WebSocket;
    window.WebSocket=function(url,p){
        if(typeof url==='string'&&(url.startsWith('ws://')||url.startsWith('wss://'))){
            url=(location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/wisp/'+url;
        }
        return new _w(url,p);
    };
    
    const _e=window.EventSource;
    window.EventSource=function(url,o){
        if(typeof url==='string'){
            if(url.startsWith('http'))url=__pp+'/'+url;
            else if(url.startsWith('/'))url=__pp+'/'+__origin+url;
        }
        return new _e(url,o);
    };
    
    const _loc=new URL(__page);
    Object.defineProperty(window,'location',{
        get:()=>_loc,
        set:(v)=>{
            if(typeof v==='string'){
                if(v.startsWith('http'))window.top.postMessage({__fp_nav:v},'*');
                else if(v.startsWith('/'))window.top.postMessage({__fp_nav:__origin+v},'*');
                else _loc.href=v;
            }
        }
    });
    
    Object.defineProperty(document,'location',{
        get:()=>_loc,
        set:(v)=>{window.location=v;}
    });
    
    console.log('[FlashProxy] Injected');
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
