// Just serves your static files. That's it.
// No proxy logic here — the service worker handles that stuff
// just making a server!

const express = require('express');
const path = require('path');
const { rewriteHtml } = require('./rewriters/html');
const { rewriteCss } = require('./rewriters/css');
const { rewriteJs } = require('./rewriters/js-ast');

const app = express();
const PORT = 3000;
const PROXY_PREFIX = '/proxy';

// Serve static files (your UI, SW, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Main proxy endpoint
app.get(`${PROXY_PREFIX}/*`, async (req, res) => {
    const targetUrl = req.params[0] + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
    
    console.log('[PROXY]', targetUrl);
    
    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
                'Accept': req.headers['accept'] || '*/*',
                'Accept-Language': req.headers['accept-language'] || 'en-US',
                'Referer': req.headers['referer'] || '',
            }
        });

        const contentType = response.headers.get('content-type') || '';
        const baseUrl = targetUrl;

        let body;
        let rewritten;
        let finalContentType = contentType;

        if (contentType.includes('text/html')) {
            body = await response.text();
            rewritten = rewriteHtml(body, baseUrl, PROXY_PREFIX);
            finalContentType = 'text/html';
        } 
        else if (contentType.includes('text/css')) {
            body = await response.text();
            rewritten = rewriteCss(body, baseUrl, PROXY_PREFIX);
            finalContentType = 'text/css';
        } 
        else if (contentType.includes('javascript') || contentType.includes('ecmascript')) {
            body = await response.text();
            // AST-based rewriting happens HERE on the server
            rewritten = rewriteJs(body, baseUrl, PROXY_PREFIX);
            finalContentType = 'application/javascript';
        } 
        else {
            // Images, fonts, etc. — stream through
            const arrayBuffer = await response.arrayBuffer();
            res.setHeader('Content-Type', contentType);
            return res.send(Buffer.from(arrayBuffer));
        }

        res.setHeader('Content-Type', finalContentType);
        res.send(rewritten);

    } catch (err) {
        console.error('[PROXY ERROR]', err.message);
        res.status(500).send(`Proxy Error: ${err.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`proxy server now running at http://localhost:${PORT}`);
    console.log(`Open your browser and go to this: http://localhost:${PORT}`);
});
