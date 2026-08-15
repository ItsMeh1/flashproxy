import { proxyUrl } from '../src/url.js';

function isSafeCssUrl(value) {
  const v = String(value).trim().toLowerCase();
  return v && !v.startsWith('data:') && !v.startsWith('blob:') && !v.startsWith('#') && !v.startsWith('javascript:');
}

function rewriteUrlValue(value, baseUrl, prefix) {
  if (!isSafeCssUrl(value)) return value;
  return proxyUrl(value, baseUrl, prefix);
}

export function rewriteCss(css, pageUrl, fpPrefix = '/fp') {
  const base = new URL(pageUrl);
  let output = String(css);

  // CSS strings can contain escaped characters and quoted URLs. Keep this
  // deliberately lexical: URL values are rewritten, CSS syntax is preserved.
  output = output.replace(/url\(\s*(["']?)([\s\S]*?)\1\s*\)/gi, (full, quote, value) => {
    const rewritten = rewriteUrlValue(value, base.href, fpPrefix);
    return rewritten === value ? full : `url(${quote}${rewritten}${quote})`;
  });

  // @import "foo.css" / @import 'foo.css'
  output = output.replace(/(@import\s+)(["'])([^"']+)\2/gi, (full, prefix, quote, value) => {
    const rewritten = rewriteUrlValue(value, base.href, fpPrefix);
    return rewritten === value ? full : `${prefix}${quote}${rewritten}${quote}`;
  });

  // @import url(...) is already covered by the url() pass above.
  return output;
}
