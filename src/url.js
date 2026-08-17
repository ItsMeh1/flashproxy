const DEFAULT_PREFIX = '/fp';
const DEFAULT_WS_PREFIX = '/wisp/';
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const WS_PROTOCOLS = new Set(['ws:', 'wss:']);
const PASSTHROUGH_SCHEMES = new Set([
  'data:', 'blob:', 'javascript:', 'mailto:', 'tel:', 'sms:', 'about:',
  'file:', 'chrome:', 'chrome-extension:', 'moz-extension:', 'view-source:'
]);

function trimValue(value) { return String(value ?? '').trim(); }

export function isPassthroughUrl(value) {
  const raw = trimValue(value);
  if (!raw || raw.startsWith('#')) return true;
  const lower = raw.toLowerCase();
  for (const scheme of PASSTHROUGH_SCHEMES) if (lower.startsWith(scheme)) return true;
  return false;
}

export function isWebUrl(value) {
  try { return HTTP_PROTOCOLS.has(new URL(value).protocol); }
  catch { return false; }
}

export function normalizeTarget(value, baseUrl) {
  const raw = trimValue(value);
  if (isPassthroughUrl(raw)) return null;
  try {
    const resolved = new URL(raw, baseUrl);
    return HTTP_PROTOCOLS.has(resolved.protocol) ? resolved.href : null;
  } catch { return null; }
}

export function proxyUrl(value, baseUrl, prefix = DEFAULT_PREFIX) {
  const raw = trimValue(value);
  if (isPassthroughUrl(raw)) return raw;
  if (isProxyUrl(raw, prefix)) return raw;
  const target = normalizeTarget(raw, baseUrl);
  return target ? `${prefix.replace(/\/$/, '')}/${target}` : raw;
}

export function unproxyUrl(value, prefix = DEFAULT_PREFIX) {
  const raw = trimValue(value);
  const normalized = prefix.replace(/\/$/, '');
  if (!raw.startsWith(`${normalized}/`)) return raw;
  const target = raw.slice(normalized.length + 1);
  return isWebUrl(target) ? target : raw;
}

export function proxyWebSocketUrl(value, baseUrl, wsPrefix = DEFAULT_WS_PREFIX) {
  const raw = trimValue(value);
  if (!raw || isPassthroughUrl(raw)) return raw;
  try {
    const resolved = new URL(raw, baseUrl);
    if (!WS_PROTOCOLS.has(resolved.protocol)) return raw;
    return `${wsPrefix.replace(/\/$/, '')}/${resolved.href}`;
  } catch { return raw; }
}

export function getTargetFromProxyPath(pathname, prefix = DEFAULT_PREFIX) {
  if (typeof pathname !== 'string') return null;
  const normalized = prefix.replace(/\/$/, '');
  if (!pathname.startsWith(`${normalized}/`)) return null;
  const target = pathname.slice(normalized.length + 1);
  return isWebUrl(target) ? target : null;
}

export function isProxyUrl(value, prefix = DEFAULT_PREFIX) {
  const raw = trimValue(value);
  const normalized = prefix.replace(/\/$/, '');
  return raw.startsWith(`${normalized}/http://`) || raw.startsWith(`${normalized}/https://`);
}

export { DEFAULT_PREFIX, DEFAULT_WS_PREFIX };
