import { proxyUrl } from '../src/url.js';

function isSafeCssUrl(value) {
  const v = value.trim().toLowerCase();
  return v && !v.startsWith('data:') && !v.startsWith('blob:') && !v.startsWith('#') && !v.startsWith('javascript:');
}

export function rewriteCss(css, pageUrl, fpPrefix = '/fp') {
  const base = new URL(pageUrl);
  let output = String(css);

  output = output.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (full, quote, value) => {
    if (!isSafeCssUrl(value)) return full;
    const rewritten = proxyUrl(value, base.href, fpPrefix);
    return rewritten === value ? full : `url(${quote}${rewritten}${quote})`;
  });

  output = output.replace(/(@import\s+)(["'])([^"']+)\2/gi, (full, prefix, quote, value) => {
    if (!isSafeCssUrl(value)) return full;
    const rewritten = proxyUrl(value, base.href, fpPrefix);
    return rewritten === value ? full : `${prefix}${quote}${rewritten}${quote}`;
  });

  return output;
}
