import express from 'express';
import { createServer } from 'http';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
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

// Parse raw body for all requests so we can forward POST/PUT/PATCH
app.use(express.raw({ type: () => true, limit: '50mb' }));

// =====================
// COOKIE JAR
// =====================
const cookieJar = new Map();

function parseCookieDomain(header) {
    const match = header.match(/domain=([^;]+)/i);
    return match ? match[1].trim().toLowerCase() : null;
}

function getCookiesForDomain(hostname) {
    const cookies = [];
    for (const [jarDomain, jarCookies] of cookieJar.entries()) {
        if (hostname === jarDomain || hostname.endsWith('.' + jarDomain) || jarDomain.endsWith('.' + hostname)) {
            cookies.push(...jarCookies);
        }
    }
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

function storeCookies(setCookieHeaders, fallbackDomain) {
    if (!setCookieHeaders) return;
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    
    for (const header of headers) {
        const [nameValue] = header.split(';');
        const eqIdx = nameValue.indexOf('=');
        if (eqIdx === -1) continue;
        
        const name = nameValue.slice(0, eqIdx).trim();
        const value = nameValue.slice(eqIdx + 1).trim();
        const domain = parseCookieDomain(header) || fallbackDomain;
        
        if (!cookieJar.has(domain)) cookieJar.set(domain, []);
        const jar = cookieJar.get(domain);
        
        const idx = jar.findIndex(c => c.name === name);
        if (idx !== -1) jar.splice(idx, 1);
        
        jar.push({ name, value, raw: header });
    }
}

// =====================
// WISP SERVER
// =====================
server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/wisp/')) {
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

// =====================
// PROXY ENDPOINT
// =====================
app.all(`${PROXY_PREFIX}/*`, async (req, res) => {
    const targetUrl = req.params[0] + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
    const target = new URL(targetUrl);
    
    console.log(`[PROXY ${req.method}]`, targetUrl);
    
    try {
        // Forward headers
        const headers = {};
        for (const [key, val] of Object.entries(req.headers)) {
            if (['host', 'connection', 'content-length'].includes(key.toLowerCase())) continue;
            headers[key] = val;
        }
        
        // Add cookies from jar
        const jarCookies = getCookiesForDomain(target.hostname);
        if (jarCookies) headers['Cookie'] = jarCookies;
        
        // Forward body
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

        // Store cookies
        let setCookie = [];
        if (typeof response.headers.getSetCookie === 'function') {
            setCookie = response.headers.getSetCookie();
        } else {
            const sc = response.headers.get('set-cookie');
            if (sc) setCookie = [sc];
        }
        if (setCookie.length) storeCookies(setCookie, target.hostname);

        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (location) {
                let proxyLocation;
                if (location.startsWith('http')) proxyLocation = `${PROXY_PREFIX}/${location}`;
                else if (location.startsWith('/')) proxyLocation = `${PROXY_PREFIX}/${target.origin}${location}`;
                else proxyLocation = `${PROXY_PREFIX}/${new URL(location, target).href}`;
                
                res.setHeader('Location', proxyLocation);
                return res.status(response.status).send();
            }
        }

        const contentType = response.headers.get('content-type') || '';
        
        // Strip security headers
        const safeHeaders = {};
        response.headers.forEach((val, key) => {
            const lower = key.toLowerCase();
            if (!['content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'set-cookie'].includes(lower)) {
                safeHeaders[key] = val;
            }
        });

        let bodyText, rewritten;

        if (contentType.includes('text/html')) {
            bodyText = await response.text();
            rewritten = rewriteHtml(bodyText, targetUrl, PROXY_PREFIX);
            safeHeaders['Content-Type'] = 'text/html';
        } 
        else if (contentType.includes('text/css')) {
            bodyText = await response.text();
            rewritten = rewriteCss(bodyText, targetUrl, PROXY_PREFIX);
            safeHeaders['Content-Type'] = 'text/css';
        } 
        else if (contentType.includes('javascript') || contentType.includes('ecmascript') || contentType.includes('js')) {
            bodyText = await response.text();
            rewritten = rewriteJs(bodyText, targetUrl, PROXY_PREFIX);
            safeHeaders['Content-Type'] = 'application/javascript';
        } 
        else {
            const arrayBuffer = await response.arrayBuffer();
            Object.entries(safeHeaders).forEach(([k, v]) => res.setHeader(k, v));
            return res.status(response.status).send(Buffer.from(arrayBuffer));
        }

        Object.entries(safeHeaders).forEach(([k, v]) => res.setHeader(k, v));
        res.status(response.status).send(rewritten);

    } catch (err) {
        console.error('[PROXY ERROR]', err.message);
        res.status(502).send(`Proxy Error: ${err.message}`);
    }
});

server.listen(PORT, () => {
    console.log(`FlashProxy running at http://localhost:${PORT}`);
    console.log(`Wisp server ready on ws://localhost:${PORT}/wisp/`);
});
