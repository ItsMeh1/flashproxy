export function rewriteCss(css, pageUrl, proxyPrefix) {
    const base = new URL(pageUrl);
    
    // url(...)
    css = css.replace(/url\(["']?([^"')]+)["']?\)/g, (match, url) => {
        if (!url || url.startsWith('data:') || url.startsWith('#')) return match;
        if (url.startsWith('http')) return `url("${proxyPrefix}/${url}")`;
        if (url.startsWith('//')) return `url("${proxyPrefix}/https:${url}")`;
        if (url.startsWith('/')) return `url("${proxyPrefix}/${base.origin}${url}")`;
        try {
            const resolved = new URL(url, base).href;
            return `url("${proxyPrefix}/${resolved}")`;
        } catch { return match; }
    });
    
    // @import
    css = css.replace(/@import\s+(?:url\()?["']?([^"')]+)["']?\)?/gi, (match, url) => {
        if (!url || url.startsWith('data:')) return match;
        if (url.startsWith('http')) return `@import "${proxyPrefix}/${url}"`;
        if (url.startsWith('//')) return `@import "${proxyPrefix}/https:${url}"`;
        try {
            const resolved = new URL(url, base).href;
            return `@import "${proxyPrefix}/${resolved}"`;
        } catch { return match; }
    });
    
    return css;
}
