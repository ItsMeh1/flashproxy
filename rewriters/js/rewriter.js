const PROXY_PREFIX = '/proxy';

export function rewriteJsStrings(code, pageUrl, proxyPrefix = PROXY_PREFIX) {
    const base = new URL(pageUrl);
    
    // Helper to rewrite a URL string
    function rewriteUrl(url) {
        if (!url || typeof url !== 'string') return url;
        if (url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:')) return url;
        if (url.startsWith(proxyPrefix)) return url;
        
        if (url.startsWith('http://') || url.startsWith('https://')) return `${proxyPrefix}/${url}`;
        if (url.startsWith('//')) return `${proxyPrefix}/https:${url}`;
        if (url.startsWith('/')) return `${proxyPrefix}/${base.origin}${url}`;
        
        try {
            return `${proxyPrefix}/${new URL(url, base).href}`;
        } catch {
            return url;
        }
    }
    
    // Rewrite string literals containing URLs
    // This regex matches quoted strings that look like URLs
    code = code.replace(/(["'])(https?:\/\/[^"']+)\1/g, (match, quote, url) => {
        return `${quote}${rewriteUrl(url)}${quote}`;
    });
    
    code = code.replace(/(["'])(\/\/[^"']+)\1/g, (match, quote, url) => {
        if (url === '//') return match;
        return `${quote}${rewriteUrl(url)}${quote}`;
    });
    
    // Rewrite root-relative paths in strings (be careful)
    code = code.replace(/(["'])(\/[a-zA-Z0-9_\-./?&=+%~:@#]*)\1/g, (match, quote, path) => {
        // Skip if it looks like a regex or math
        if (path.match(/^\/[/*+\-]/)) return match;
        if (path === '/') return match;
        return `${quote}${rewriteUrl(path)}${quote}`;
    });
    
    // Rewrite fetch('/api') calls where argument is a string literal
    // Already handled by string literal rewrite above
    
    // Rewrite WebSocket URLs
    code = code.replace(/(new\s+WebSocket\s*\(\s*)(["'])(ws[s]?:\/\/[^"']+)\2/g, (match, prefix, quote, url) => {
        return `${prefix}${quote}ws://localhost:3000/wisp/${url}${quote}`;
    });
    
    // Rewrite import('...') dynamic imports
    code = code.replace(/(import\s*\(\s*)(["'])([^"']+)\2/g, (match, prefix, quote, url) => {
        return `${prefix}${quote}${rewriteUrl(url)}${quote}`;
    });
    
    return code;
}
