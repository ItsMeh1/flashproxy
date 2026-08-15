import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
import createBareServer from '@nebula-services/bare-server-node';
import { parse, splitCookiesString } from 'set-cookie-parser';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { rewriteHtml } from './rewriters/html.js';
import { rewriteCss } from './rewriters/css.js';
import { rewriteJs } from './rewriters/js/index.js';
import { getTargetFromProxyPath } from './src/url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const FP_PREFIX = '/fp';
const SESSION_COOKIE = 'flash_sid';
const MAX_BODY = 50 * 1024 * 1024;
const SESSION_TTL = 1000 * 60 * 60 * 24;
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade'
]);
const REQUEST_MANAGED = new Set([...HOP_BY_HOP, 'host', 'content-length', 'cookie']);
const RESPONSE_STRIPPED = new Set([
  ...HOP_BY_HOP,
  'content-length', 'content-encoding', 'set-cookie', 'etag',
  'content-security-policy', 'content-security-policy-report-only',
  'x-frame-options', 'cross-origin-opener-policy',
  'cross-origin-embedder-policy', 'cross-origin-resource-policy',
  'access-control-allow-origin', 'access-control-allow-credentials'
]);

const app = Fastify({ logger: false, bodyLimit: MAX_BODY });
app.removeAllContentTypeParsers();
app.addContentTypeParser('*', { parseAs: 'buffer' }, async (_request, body) => body);

const sessions = new Map();

function readBrowserCookie(request, name) {
  const header = request.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function newSession() {
  return { created: Date.now(), touched: Date.now(), cookies: new Map() };
}

function getSession(request, reply) {
  let id = readBrowserCookie(request, SESSION_COOKIE);
  if (!id || !sessions.has(id)) {
    id = crypto.randomBytes(18).toString('base64url');
    sessions.set(id, newSession());
    reply.header('Set-Cookie', `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax`);
  }
  const session = sessions.get(id);
  session.touched = Date.now();
  return session;
}

function cookieDomainMatches(hostname, cookieDomain) {
  const host = hostname.toLowerCase();
  const domain = cookieDomain.replace(/^\./, '').toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function cookiePathMatches(requestPath, cookiePath = '/') {
  const request = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  const cookie = cookiePath.startsWith('/') ? cookiePath : `/${cookiePath}`;
  return request === cookie || request.startsWith(cookie.endsWith('/') ? cookie : `${cookie}/`);
}

function storeCookies(session, setCookieHeader, requestUrl) {
  if (!setCookieHeader) return;
  const strings = Array.isArray(setCookieHeader) ? setCookieHeader : splitCookiesString(setCookieHeader);
  const target = new URL(requestUrl);
  for (const cookie of parse(strings)) {
    const domain = (cookie.domain || target.hostname).toLowerCase();
    const pathName = cookie.path || '/';
    const key = `${domain}|${pathName}|${cookie.name}`;
    const expired = cookie.expires && new Date(cookie.expires).getTime() <= Date.now();
    const maxAgeExpired = cookie.maxAge != null && Number(cookie.maxAge) <= 0;
    if (expired || maxAgeExpired) {
      session.cookies.delete(key);
      continue;
    }
    session.cookies.set(key, {
      name: cookie.name,
      value: cookie.value,
      domain,
      path: pathName,
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly),
      expires: cookie.expires ? new Date(cookie.expires).getTime() : null,
      created: Date.now()
    });
  }
}

function getCookiesForUrl(session, requestUrl) {
  const target = new URL(requestUrl);
  const now = Date.now();
  const values = [];
  for (const [key, cookie] of session.cookies) {
    if (cookie.expires && cookie.expires <= now) {
      session.cookies.delete(key);
      continue;
    }
    if (cookie.secure && target.protocol !== 'https:') continue;
    if (!cookieDomainMatches(target.hostname, cookie.domain)) continue;
    if (!cookiePathMatches(target.pathname, cookie.path)) continue;
    values.push(cookie);
  }
  values.sort((a, b) => b.path.length - a.path.length);
  return values.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

function cleanRequestHeaders(input) {
  const headers = {};
  for (const [key, value] of Object.entries(input)) {
    if (REQUEST_MANAGED.has(key.toLowerCase()) || value == null) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  // Fetching uncompressed upstream responses makes rewriting deterministic.
  headers['accept-encoding'] = 'identity';
  return headers;
}

function cleanResponseHeaders(headers) {
  const output = {};
  headers.forEach((value, key) => {
    if (!RESPONSE_STRIPPED.has(key.toLowerCase())) output[key] = value;
  });
  return output;
}

function rewriteRedirect(location, targetUrl) {
  try {
    return `${FP_PREFIX}/${new URL(location, targetUrl).href}`;
  } catch {
    return location;
  }
}

function cleanupSessions() {
  const cutoff = Date.now() - SESSION_TTL;
  for (const [id, session] of sessions) {
    if (session.touched < cutoff) sessions.delete(id);
  }
}
setInterval(cleanupSessions, 10 * 60 * 1000).unref();

let bareServer;
try {
  bareServer = createBareServer('/bare/');
} catch (error) {
  console.warn('[Bare] initialization failed:', error.message);
}

app.server.on('upgrade', (req, socket, head) => {
  if (bareServer?.shouldRoute(req)) return bareServer.routeUpgrade(req, socket, head);
  if (req.url?.startsWith('/wisp/')) return wisp.routeRequest(req, socket, head);
  socket.destroy();
});

await app.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  wildcard: true
});

app.get('/sw.js', async (_request, reply) => reply.sendFile('sw.js', path.join(__dirname, 'src')));
app.get('/fp-api.js', async (_request, reply) => reply.sendFile('api.js', path.join(__dirname, 'src')));

app.all(`${FP_PREFIX}/*`, async (request, reply) => {
  const rawPath = request.params['*'] || '';
  const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
  const target = getTargetFromProxyPath(`${FP_PREFIX}/${rawPath}`, FP_PREFIX);
  if (!target) return reply.code(400).type('text/plain').send('Invalid Flash Proxy target');

  const targetUrl = target + query;
  const session = getSession(request, reply);

  try {
    const headers = cleanRequestHeaders(request.headers);
    const cookies = getCookiesForUrl(session, targetUrl);
    if (cookies) headers.cookie = cookies;

    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const body = hasBody && request.body instanceof Buffer ? request.body : undefined;
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'manual'
    });

    const setCookies = upstream.headers.getSetCookie?.() || upstream.headers.get('set-cookie');
    if (setCookies) storeCookies(session, setCookies, targetUrl);

    const responseHeaders = cleanResponseHeaders(upstream.headers);
    const status = upstream.status;

    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = upstream.headers.get('location');
      if (location) responseHeaders.location = rewriteRedirect(location, targetUrl);
    }

    for (const [key, value] of Object.entries(responseHeaders)) reply.header(key, value);

    // HEAD, 204 and 304 responses must not carry a response body.
    if (request.method === 'HEAD' || [204, 304].includes(status)) {
      return reply.code(status).send();
    }

    if ([301, 302, 303, 307, 308].includes(status)) {
      return reply.code(status).send();
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const text = await upstream.text();
      return reply.code(status).type('text/html; charset=utf-8').send(await rewriteHtml(text, targetUrl, FP_PREFIX));
    }
    if (contentType.includes('text/css')) {
      const text = await upstream.text();
      return reply.code(status).type('text/css; charset=utf-8').send(rewriteCss(text, targetUrl, FP_PREFIX));
    }
    if (/javascript|ecmascript/i.test(contentType)) {
      const text = await upstream.text();
      return reply.code(status).type('application/javascript; charset=utf-8').send(await rewriteJs(text, targetUrl, FP_PREFIX));
    }

    // Binary resources are streamed instead of buffering the entire response.
    if (upstream.body) return reply.code(status).send(Readable.fromWeb(upstream.body));
    return reply.code(status).send();
  } catch (error) {
    request.log.error(error);
    return reply.code(502).type('text/plain').send(`Flash Proxy upstream error: ${error.message}`);
  }
});

app.setNotFoundHandler((request, reply) => {
  if (bareServer?.shouldRoute(request.raw)) return bareServer.routeRequest(request.raw, reply.raw);
  return reply.code(404).type('text/plain').send('Not Found');
});

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`Flash Proxy listening on http://localhost:${PORT}`);
console.log(`HTTP proxy: http://localhost:${PORT}${FP_PREFIX}/https://example.com`);
console.log(`Bare: http://localhost:${PORT}/bare/`);
console.log(`Wisp: ws://localhost:${PORT}/wisp/`);
