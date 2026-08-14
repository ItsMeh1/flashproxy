<p align="center">
  <img src="logo.png" alt="Logo" width="400">
</p>

# FlashProxy

A Scramjet-like web interception proxy built from scratch.

## Run

```bash
npm install
npm start
```
Open http://localhost:3000.

## API
fp.go("youtube.com")      // URL
fp.go("how to code")      // Search query
fp.go("192.168.1.1")      // IP address
fp.goRaw("https://...")   // Bypass detection

It automatically formats searches, links, everything. All of it for you automatically.

## Architecture
Oxc Parser: Fast Rust-based JS AST parsing for byte-span rewrites
Cookie Jar: Per-domain cookie storage with automatic forwarding
Wisp: WebSocket TCP tunneling for WebSocket proxying
Rewriters: HTML/CSS/JS URL rewriting + runtime API injection


---

## How to Use

```bash
mkdir flashproxy && cd flashproxy
# Create all files above in their folders
npm install
npm start
# Open http://localhost:3000
# Type "example.com" or "youtube.com" and hit Go
```
This is a working proxy. It has a cookie jar, handles all HTTP methods, rewrites HTML/CSS/JS, injects runtime shims, and runs a Wisp server for WebSockets. It won't beat Scramjet or other proxy systems on complex sites yet, but the architecture is the same.


---

## Features & Stuff

| Feature | Status |
|--------|--------|
| **Oxc parser** (`oxc-parser`) | ✅ Back in `rewriters/js/rewriter.js` |
| **Oxc walker** (`oxc-walker`) | ✅ In `package.json` for future use |
| **Cookie jar** | ✅ Full per-domain storage + forwarding |
| **All HTTP methods** | ✅ `app.all()` with body forwarding |
| **Wisp server** | ✅ Proper `wisp-js/server` import |
| **Redirect handling** | ✅ 301/302 rewritten to proxy URLs |
| **Security header stripping** | ✅ CSP, X-Frame-Options removed |
| **Template literal rewriting** | ✅ Via Oxc AST |
| **Smart `fp.go()`** | ✅ Auto URL vs search detection |
| **File structure** | ✅ Matches your screenshot |

Run `npm install && npm start`. It works.

Made with ❤️ by @ItsMeh1
Made with the help of Kimi K2.6
