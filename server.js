import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
import createBareServer from '@nebula-services/bare-server-node';
import { parse, splitCookiesString } from 'set-cookie-parser';
import { parseDomain } from 'parse-domain';
import path from 'path';
import { fileURLToPath } from 'url';
import { rewriteHtml } from './rewriters/html.js';
import { rewriteCss } from './rewriters/css.js';
import { rewriteJs } from './rewriters/js/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024 });
const PORT = 3000;
const FP_PREFIX = '/fp';

// =====================
// RAW BODY PARSER (catch-all for POST/PUT/PATCH forwarding)
// =====================
app.removeAllContentTypeParsers();
app.addContentTypeParser('*', { parseAs: 'buffer' }, async (request, body) => {
    return body;
});

// =====================
// COOKIE JAR
// =====================
const cookieJar = new Map();

function normalizeDomain(hostname) {
    try {
        const parsed = parseDomain(hostname);
        if (parsed && parsed.domain) {
            return [parsed.domain, ...parsed.topLevelDomains].join('.');
        }
    } catch {}
    return hostname.toLowerCase();
}

function getCookiesForUrl(url) {
    const hostname = normalizeDomain(new URL(url).hostname);
    const out = [];
    for (const [jarDomain, cookies] of cookieJar.entries()) {
        if (hostname === jarDomain || hostname.endsWith('.' + jarDomain) || jarDomain.endsWith('.' + hostname)) {
            out.push(...cookies);
        }
    }
    return out.map(c => `${c.name}=${c.value}`).join('; ');
}

function storeCookies(setCookieHeader, requestUrl) {
    if (!setCookieHeader) return;
    const strings = Array.isArray(setCookieHeader) ? setCookieHeader : splitCookiesString(setCookieHeader);
    const parsed = parse(strings);
    for (const cookie of parsed) {
        const domain = cookie.domain ? cookie.domain.toLowerCase() : normalizeDomain(new URL(requestUrl).hostname);
        if (!cookieJar.has(domain)) cookieJar.set(domain, []);
        const jar = cookieJar.get(domain);
        const idx = jar.findIndex(c => c.name === cookie.name);
        if (idx !== -1) jar.splice(idx, 1);
        jar.push(cookie);
    }
}

// =====================
// BARE SERVER
// =====================
let bareServer;
try {
    bareServer = createBareServer('/bare/');
} catch (e) {
    console.warn('[Bare] Failed to initialize:', e.message);
}

// =====================
// WISP + BARE UPGRADE HANDLER
// =====================
app.server.on('upgrade', (req, socket, head) => {
    if (bareServer && bareServer.shouldRoute(req)) {
        bareServer.routeUpgrade(req, socket, head);
    } else if (req.url.startsWith('/wisp/')) {
        wisp.routeRequest(req, socket, head);
    }
});

// =====================
// STATIC FILES
// =====================
await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
    wildcard: true,
});

// =====================
// SW.js & API MODULE (served from src/)
// =====================
app.get('/sw.js', async (request, reply) => {
    return reply.header('Content-Type', 'application/javascript').sendFile('sw.js', path.join(__dirname, 'src'));
});

app.get('/fp-api.js', async (request, reply) => {
    return reply.header('Content-Type', 'application/javascript').sendFile('api.js', path.join(__dirname, 'src'));
});

// =====================
// PROXY ENDPOINT (ALL METHODS)
// =====================
app.all(`${FP_PREFIX}/*`, async (request, reply) => {
    const targetUrl = request.params['*'] || '';
    const fullTarget = targetUrl + (request.url.includes('?') ? '?' + request.url.split('?')[1] : '');
    const target = new URL(fullTarget);
    
    console.log(`[FP ${request.method}]`, fullTarget);
    
    try {
        const headers = {};
        for (const [key, val] of Object.entries(request.headers)) {
            if (['host', 'connection', 'content-length'].includes(key.toLowerCase())) continue;
            headers[key] = val;
        }
        
        const jarCookies = getCookiesForUrl(fullTarget);
        if (jarCookies) headers['Cookie'] = jarCookies;
        
        let body = undefined;
        if (!['GET', 'HEAD'].includes(request.method) && request.body && request.body.length > 0) {
            body = request.body;
        }
        
        const response = await fetch(fullTarget, {
            method: request.method,
            headers,
            body,
            redirect: 'manual',
        });

        const setCookie = response.headers.getSetCookie?.() || response.headers.get('set-cookie');
        if (setCookie) storeCookies(setCookie, fullTarget);

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (location) {
                let proxyLoc;
                if (location.startsWith('http')) proxyLoc = `${FP_PREFIX}/${location}`;
                else if (location.startsWith('/')) proxyLoc = `${FP_PREFIX}/${target.origin}${location}`;
                else proxyLoc = `${FP_PREFIX}/${new URL(location, target).href}`;
                return reply.header('Location', proxyLoc).code(response.status).send();
            }
        }

        const contentType = response.headers.get('content-type') || '';
        
        const safeHeaders = {};
        response.headers.forEach((val, key) => {
            const lower = key.toLowerCase();
            if (!['content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'set-cookie'].includes(lower)) {
                safeHeaders[key] = val;
            }
        });

        let rewritten;

        if (contentType.includes('text/html')) {
            const text = await response.text();
            rewritten = rewriteHtml(text, fullTarget, FP_PREFIX);
            safeHeaders['Content-Type'] = 'text/html';
        } 
        else if (contentType.includes('text/css')) {
            const text = await response.text();
            rewritten = rewriteCss(text, fullTarget, FP_PREFIX);
            safeHeaders['Content-Type'] = 'text/css';
        } 
        else if (contentType.includes('javascript') || contentType.includes('ecmascript') || contentType.includes('js')) {
            const text = await response.text();
            rewritten = await rewriteJs(text, fullTarget, FP_PREFIX);
            safeHeaders['Content-Type'] = 'application/javascript';
        } 
        else {
            const buf = await response.arrayBuffer();
            for (const [k, v] of Object.entries(safeHeaders)) reply.header(k, v);
            return reply.code(response.status).send(Buffer.from(buf));
        }

        for (const [k, v] of Object.entries(safeHeaders)) reply.header(k, v);
        return reply.code(response.status).send(rewritten);

    } catch (err) {
        console.error('[FP ERROR]', err.message);
        return reply.code(502).send(`Proxy Error: ${err.message}`);
    }
});

// =====================
// FALLBACK TO BARE SERVER
// =====================
app.setNotFoundHandler((request, reply) => {
    if (bareServer && bareServer.shouldRoute(request.raw)) {
        bareServer.routeRequest(request.raw, reply.raw);
    } else {
        reply.code(404).send('Not Found');
    }
});

// =====================
// START
// =====================
try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`FlashProxy running at http://localhost:${PORT}`);
    console.log(`Bare server at http://localhost:${PORT}/bare/`);
    console.log(`Wisp server at ws://localhost:${PORT}/wisp/`);
} catch (err) {
    console.error(err);
    process.exit(1);
}
