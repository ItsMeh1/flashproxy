const DEFAULT_PREFIX = '/fp';
const DEFAULT_WS_PREFIX = '/wisp/';
const PASSTHROUGH_SCHEMES = new Set([
  'data:', 'blob:', 'javascript:', 'mailto:', 'tel:', 'sms:', 'about:',
  'file:', 'chrome:', 'chrome-extension:', 'moz-extension:', 'view-source:'
]);

function trimValue(value) {
  return String(value ?? '').trim();
}

export function isPassthroughUrl(value) {
  const raw = trimValue(value);
  if (!raw || raw.startsWith('#')) return true;
  const lower = raw.toLowerCase();
  for (const scheme of PASSTHROUGH_SCHEMES) if (lower.startsWith(scheme)) return true;
  return false;
}

export function isWebUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeTarget(value, baseUrl) {
  const raw = trimValue(value);
  if (isPassthroughUrl(raw)) return null;
  try {
    const resolved = new URL(raw, baseUrl);
    if (!['http:', 'https:'].includes(resolved.protocol)) return null;
    return resolved.href;
  } catch {
    return null;
  }
}

export function proxyUrl(value, baseUrl, prefix = DEFAULT_PREFIX) {
  const raw = trimValue(value);
  if (isPassthroughUrl(raw)) return raw;
  if (raw.startsWith(`${prefix}/http://`) || raw.startsWith(`${prefix}/https://`)) return raw;
  const target = normalizeTarget(raw, baseUrl);
  return target ? `${prefix}/${target}` : raw;
}

export function unproxyUrl(value, prefix = DEFAULT_PREFIX) {
  const raw = trimValue(value);
  if (!raw.startsWith(`${prefix}/`)) return raw;
  const target = raw.slice(prefix.length + 1);
  return isWebUrl(target) ? target : raw;
}

export function proxyWebSocketUrl(value, baseUrl, wsPrefix = DEFAULT_WS_PREFIX) {
  const raw = trimValue(value);
  if (!raw) return raw;
  try {
    const resolved = new URL(raw, baseUrl);
    if (resolved.protocol !== 'ws:' && resolved.protocol !== 'wss:') return raw;
    return `${wsPrefix}${resolved.href}`;
  } catch {
    return raw;
  }
}

export function getTargetFromProxyPath(pathname, prefix = DEFAULT_PREFIX) {
  if (typeof pathname !== 'string' || !pathname.startsWith(`${prefix}/`)) return null;
  const target = pathname.slice(prefix.length + 1);
  return isWebUrl(target) ? target : null;
}

export function isProxyUrl(value, prefix = DEFAULT_PREFIX) {
  const raw = trimValue(value);
  return raw.startsWith(`${prefix}/http://`) || raw.startsWith(`${prefix}/https://`);
}

export { DEFAULT_PREFIX, DEFAULT_WS_PREFIX };
