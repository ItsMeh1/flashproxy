import { proxyUrl } from '../src/url.js';

function isSafeCssUrl(value) {
  const v = String(value).trim().toLowerCase();
  return v && !v.startsWith('data:') && !v.startsWith('blob:') && !v.startsWith('#') && !v.startsWith('javascript:');
}

function rewriteUrlValue(value, baseUrl, prefix) {
  if (!isSafeCssUrl(value)) return value;
  return proxyUrl(String(value).trim(), baseUrl, prefix);
}

export function rewriteCss(css, pageUrl, fpPrefix = '/fp') {
  const base = new URL(pageUrl);
  let output = String(css);

  output = output.replace(/url\(\s*(["']?)([\s\S]*?)\1\s*\)/gi, (full, quote, value) => {
    const rewritten = rewriteUrlValue(value, base.href, fpPrefix);
    return rewritten === String(value).trim() ? full : `url(${quote}${rewritten}${quote})`;
  });

  output = output.replace(/(@import\s+)(["'])([^"']+)\2/gi, (full, prefix, quote, value) => {
    const rewritten = rewriteUrlValue(value, base.href, fpPrefix);
    return rewritten === String(value).trim() ? full : `${prefix}${quote}${rewritten}${quote}`;
  });

  return output;
}
