import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { setupWisp } from '@mercuryworkshop/wisp-js/server';
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

// Wisp WebSocket server (for Epoxy tunneling)
const wispWs = new WebSocketServer({ noServer: true });
setupWisp(wispWs);

server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/wisp/')) {
        wispWs.handleUpgrade(req, socket, head, (ws) => {
            wispWs.emit('connection', ws, req);
        });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Main proxy endpoint
app.get(`${PROXY_PREFIX}/*`, async (req, res) => {
    const targetUrl = req.params[0] + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
    
    console.log('[PROXY]', targetUrl);
    
    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
                'Accept': req.headers['accept'] || '*/*',
                'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
                'Accept-Encoding': req.headers['accept-encoding'] || 'identity',
                'Referer': req.headers['referer'] || '',
            }
        });

        const contentType = response.headers.get('content-type') || '';
        const baseUrl = targetUrl;

        // Strip security headers that block our injections
        const safeHeaders = {};
        response.headers.forEach((val, key) => {
            const lower = key.toLowerCase();
            if (!['content-security-policy', 'content-security-policy-report-only', 'x-frame-options'].includes(lower)) {
                safeHeaders[key] = val;
            }
        });

        let body, rewritten;

        if (contentType.includes('text/html')) {
            body = await response.text();
            rewritten = rewriteHtml(body, baseUrl, PROXY_PREFIX);
            safeHeaders['Content-Type'] = 'text/html';
        } 
        else if (contentType.includes('text/css')) {
            body = await response.text();
            rewritten = rewriteCss(body, baseUrl, PROXY_PREFIX);
            safeHeaders['Content-Type'] = 'text/css';
        } 
        else if (contentType.includes('javascript') || contentType.includes('ecmascript') || contentType.includes('js')) {
            body = await response.text();
            rewritten = rewriteJs(body, baseUrl, PROXY_PREFIX);
            safeHeaders['Content-Type'] = 'application/javascript';
        } 
        else {
            // Stream binary data (images, fonts, etc.)
            const arrayBuffer = await response.arrayBuffer();
            Object.entries(safeHeaders).forEach(([k, v]) => res.setHeader(k, v));
            return res.send(Buffer.from(arrayBuffer));
        }

        Object.entries(safeHeaders).forEach(([k, v]) => res.setHeader(k, v));
        res.send(rewritten);

    } catch (err) {
        console.error('[PROXY ERROR]', err.message);
        res.status(502).send(`Proxy Error: ${err.message}`);
    }
});

server.listen(PORT, () => {
    console.log(`FlashProxy running at http://localhost:${PORT}`);
    console.log(`Wisp server ready on ws://localhost:${PORT}/wisp/`);
});
