// Just serves your static files. That's it.
// No proxy logic here — the service worker handles that stuff
// just making a server!

const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000; // change port cause why not?

// Serve everything in public/ folder
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: if Service Worker hasn't loaded yet, basic proxy
app.get('/proxy/*', async (req, res) => {
    const targetUrl = req.params[0];
    try {
        const response = await fetch(targetUrl);
        const body = await response.text();
        res.setHeader('Content-Type', response.headers.get('content-type') || 'text/html');
        res.send(body);
    } catch (e) {
        res.status(500).send('Proxy error: ' + e.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
