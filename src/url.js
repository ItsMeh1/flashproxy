const DEFAULT_PREFIX = '/fp';

const PASSTHROUGH_SCHEMES = new Set([
  'data:', 'blob:', 'javascript:', 'mailto:', 'tel:', 'sms:', 'about:',
  'file:', 'chrome:', 'chrome-extension:', 'moz-extension:', 'view-source:'
]);

export function isPassthroughUrl(value) {
  if (value == null) return true;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.startsWith('#')) return true;
  const lower = trimmed.toLowerCase();
  for (const scheme of PASSTHROUGH_SCHEMES) {
    if (lower.startsWith(scheme)) return true;
  }
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
  const raw = String(value ?? '').trim();
  if (isPassthroughUrl(raw)) return null;

  try {
    const resolved = new URL(raw, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.href;
  } catch {
    return null;
  }
}

export function proxyUrl(value, baseUrl, prefix = DEFAULT_PREFIX) {
  const raw = String(value ?? '').trim();
  if (isPassthroughUrl(raw)) return raw;

  if (raw.startsWith(`${prefix}/http://`) || raw.startsWith(`${prefix}/https://`)) {
    return raw;
  }

  const target = normalizeTarget(raw, baseUrl);
  if (!target) return raw;
  return `${prefix}/${target}`;
}

export function unproxyUrl(value, prefix = DEFAULT_PREFIX) {
  const raw = String(value ?? '').trim();
  if (!raw.startsWith(`${prefix}/`)) return raw;
  const target = raw.slice(prefix.length + 1);
  return isWebUrl(target) ? target : raw;
}

export function proxyWebSocketUrl(value, baseUrl, wsPrefix = '/wisp/') {
  const raw = String(value ?? '').trim();
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
  if (!pathname.startsWith(`${prefix}/`)) return null;
  const target = pathname.slice(prefix.length + 1);
  if (!isWebUrl(target)) return null;
  return target;
}

export function isProxyUrl(value, prefix = DEFAULT_PREFIX) {
  return typeof value === 'string' && (value.startsWith(`${prefix}/http://`) || value.startsWith(`${prefix}/https://`));
}

export { DEFAULT_PREFIX };
