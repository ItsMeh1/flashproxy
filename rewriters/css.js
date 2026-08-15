import { proxyUrl } from '../src/url.js';

function isSafeCssUrl(value) {
  const v = String(value).trim().toLowerCase();
  return Boolean(v) && !v.startsWith('data:') && !v.startsWith('blob:') && !v.startsWith('#') && !v.startsWith('javascript:');
}

function rewriteUrlValue(value, baseUrl, prefix) {
  const original = String(value).trim();
  if (!isSafeCssUrl(original)) return original;
  return proxyUrl(original, baseUrl, prefix);
}

export function rewriteCss(css, pageUrl, fpPrefix = '/fp') {
  const base = new URL(pageUrl).href;
  let output = String(css);

  // Keep data/blob/hash URLs untouched. Quoted and unquoted CSS url() forms are supported.
  output = output.replace(/url\(\s*(["']?)([\s\S]*?)\1\s*\)/gi, (full, quote, value) => {
    const original = String(value).trim();
    const rewritten = rewriteUrlValue(original, base, fpPrefix);
    return rewritten === original ? full : `url(${quote}${rewritten}${quote})`;
  });

  // CSS also permits the quoted @import form without url(...).
  output = output.replace(/(@import\s+)(["'])([^"']+)\2/gi, (full, prefix, quote, value) => {
    const rewritten = rewriteUrlValue(value, base, fpPrefix);
    return rewritten === value ? full : `${prefix}${quote}${rewritten}${quote}`;
  });

  return output;
}
