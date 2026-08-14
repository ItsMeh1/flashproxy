export function rewriteCss(css, pageUrl, fpPrefix) {
    const base = new URL(pageUrl);
    
    css = css.replace(/url\(["']?([^"')]+)["']?\)/g, (match, url) => {
        if (!url || url.startsWith('data:') || url.startsWith('#')) return match;
        if (url.startsWith('http')) return `url("${fpPrefix}/${url}")`;
        if (url.startsWith('//')) return `url("${fpPrefix}/https:${url}")`;
        if (url.startsWith('/')) return `url("${fpPrefix}/${base.origin}${url}")`;
        try {
            return `url("${fpPrefix}/${new URL(url, base).href}")`;
        } catch { return match; }
    });
    
    css = css.replace(/@import\s+(?:url\()?["']?([^"')]+)["']?\)?/gi, (match, url) => {
        if (!url || url.startsWith('data:')) return match;
        if (url.startsWith('http')) return `@import "${fpPrefix}/${url}"`;
        if (url.startsWith('//')) return `@import "${fpPrefix}/https:${url}"`;
        try {
            return `@import "${fpPrefix}/${new URL(url, base).href}"`;
        } catch { return match; }
    });
    
    return css;
}
