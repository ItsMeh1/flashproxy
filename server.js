import express from 'express';
import { createServer } from 'http';
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
const app = express();
const server = createServer(app);
const PORT = 3000;
const PROXY_PREFIX = '/proxy';

// =====================
// BODY PARSING (raw for all content types)
// =====================
app.use(express.raw({ type: () => true, limit: '50mb' }));

// =====================
// COOKIE JAR (per-domain, using set-cookie-parser)
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
// BARE SERVER (for bare-mux clients)
// =====================
let bareServer;
try {
    bareServer = createBareServer('/bare/');
    console.log('[Bare] Server mounted at /bare/');
} catch (e) {
    console.warn('[Bare] Failed to initialize:', e.message);
}

// =====================
// WISP SERVER (WebSocket TCP tunnel)
// =====================
server.on('upgrade', (req, socket, head) => {
    if (bareServer && bareServer.shouldRoute(req)) {
        bareServer.routeUpgrade(req, socket, head);
    } else if (req.url.startsWith('/wisp/')) {
        wisp.routeRequest(req, socket, head);
    }
});

// =====================
// STATIC FILES
// =====================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'src', 'sw.js'));
});

app.get('/fp-api.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'src', 'api.js'));
});

// =====================
// PROXY ENDPOINT (ALL METHODS)
// =====================
app.all(`${PROXY_PREFIX}/*`, async (req, res) => {
    const targetUrl = req.params[0] + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
    const target = new URL(targetUrl);
    
    console.log(`[PROXY ${req.method}]`, targetUrl);
    
    try {
        const headers = {};
        for (const [key, val] of Object.entries(req.headers)) {
            if (['host', 'connection', 'content-length'].includes(key.toLowerCase())) continue;
            headers[key] = val;
        }
        
        const jarCookies = getCookiesForUrl(targetUrl);
        if (jarCookies) headers['Cookie'] = jarCookies;
        
        let body = undefined;
        if (!['GET', 'HEAD'].includes(req.method) && req.body && req.body.length > 0) {
            body = req.body;
        }
        
        const response = await fetch(targetUrl, {
            method: req.method,
            headers,
            body,
            redirect: 'manual',
        });

        const setCookie = response.headers.getSetCookie?.() || response.headers.get('set-cookie');
        if (setCookie) storeCookies(setCookie, targetUrl);

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (location) {
                let proxyLoc;
                if (location.startsWith('http')) proxyLoc = `${PROXY_PREFIX}/${location}`;
                else if (location.startsWith('/')) proxyLoc = `${PROXY_PREFIX}/${target.origin}${location}`;
                else proxyLoc = `${PROXY_PREFIX}/${new URL(location, target).href}`;
                res.setHeader('Location', proxyLoc);
                return res.status(response.status).send();
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
            rewritten = rewriteHtml(text, targetUrl, PROXY_PREFIX);
            safeHeaders['Content-Type'] = 'text/html';
        } 
        else if (contentType.includes('text/css')) {
            const text = await response.text();
            rewritten = rewriteCss(text, targetUrl, PROXY_PREFIX);
            safeHeaders['Content-Type'] = 'text/css';
        } 
        else if (contentType.includes('javascript') || contentType.includes('ecmascript') || contentType.includes('js')) {
            const text = await response.text();
            rewritten = rewriteJs(text, targetUrl, PROXY_PREFIX);
            safeHeaders['Content-Type'] = 'application/javascript';
        } 
        else {
            const buf = await response.arrayBuffer();
            Object.entries(safeHeaders).forEach(([k, v]) => res.setHeader(k, v));
            return res.status(response.status).send(Buffer.from(buf));
        }

        Object.entries(safeHeaders).forEach(([k, v]) => res.setHeader(k, v));
        res.status(response.status).send(rewritten);

    } catch (err) {
        console.error('[PROXY ERROR]', err.message);
        res.status(502).send(`Proxy Error: ${err.message}`);
    }
});

// =====================
// FALLBACK TO BARE SERVER
// =====================
app.use((req, res) => {
    if (bareServer && bareServer.shouldRoute(req)) {
        bareServer.routeRequest(req, res);
    } else {
        res.status(404).send('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`FlashProxy running at http://localhost:${PORT}`);
    console.log(`Bare server at http://localhost:${PORT}/bare/`);
    console.log(`Wisp server at ws://localhost:${PORT}/wisp/`);
});
