<div align="center">
  <img src="./logo.png" alt="Flash Proxy" width="220">

  # Flash Proxy ⚡

  **A fast, browser-focused web proxy and rewriting engine.**

  <p>Making proxied websites behave like normal websites is the goal.</p>
</div>

---

> 🚧 **Development status:** Flash Proxy is a **10-part rebuild**. Parts 7 and 8 now cover advanced browser APIs plus transport/media compatibility.

## ✨ What Flash does

- 🌐 HTTP/HTTPS proxying through `/fp/<absolute-url>`
- 🧩 Parser-based HTML rewriting
- 🎨 CSS `url(...)` and `@import` rewriting
- ⚡ AST-based JavaScript rewriting through Rust/WASM
- 🛟 Conservative JavaScript fallback
- 🧠 Browser runtime interception for Fetch, XHR, WebSocket, EventSource, Workers and navigation APIs
- 🧰 Service-worker script and `importScripts()` interception
- 📡 WebRTC-aware compatibility layer that preserves native ICE/STUN/TURN behavior
- 🍪 Per-browser-session cookie storage
- ↪️ Redirect rewriting
- 🔌 Bare Server + Wisp transport support
- ⏱️ Bounded upstream requests with configurable timeouts
- 🧪 Regression tests + CI checks
- 🖥️ A browser-facing `fpAPI`

## 🚀 Quick start

### Requirements

- Node.js 18+
- npm
- Rust + `wasm-bindgen` CLI for the optional WASM JavaScript rewriter

### Install

```bash
npm install
```

### Test

```bash
npm test
```

### Start

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

### Development mode

```bash
npm run dev
```

## ⚡ Build the JavaScript rewriter

```bash
npm run rewriter:build
```

The high-quality JavaScript transformer lives in `rewriter/src/lib.rs` and uses Oxc's AST machinery. Flash uses it when the generated WASM module is available and falls back conservatively when it is not.

## 🏗️ Architecture

```text
Browser
   │
   ▼
Flash Runtime ──────── WebRTC / ICE kept native
   │
   ├── Fetch / XHR
   ├── WebSocket / EventSource
   ├── Worker / SharedWorker
   ├── ServiceWorker registration
   ├── importScripts()
   └── DOM / navigation APIs
   │
   ▼
/fp/<target>
   │
   ├── HTTP transport ── HTML / CSS / JS rewriting
   │
   └── Binary/media streaming
   │
   ├── /bare/  ───────── Bare transport
   └── /wisp/  ───────── WebSocket transport
```

## 📡 WebRTC: an important distinction

Flash can rewrite **the JavaScript that creates WebRTC connections**, but it should not blindly rewrite the actual WebRTC transport endpoints.

For example:

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.example.com:3478' }]
});
```

That STUN URL is **not an HTTP resource**. It participates in ICE negotiation. Turning it into `/fp/https://...` would break the protocol.

Flash therefore preserves native `RTCPeerConnection` / ICE / STUN / TURN semantics. This is intentional, not a missing feature.

## 🧠 Parts 7 + 8

### Part 7 — Advanced JavaScript + runtime

The runtime now covers more browser-created network entry points:

- Fetch + `Request`
- XHR
- WebSocket
- EventSource
- Worker
- SharedWorker
- `navigator.serviceWorker.register()`
- worker `importScripts()`
- `window.open()`
- `sendBeacon()`
- History navigation
- dynamic DOM attributes
- SVG `setAttributeNS()` URLs
- WebRTC constructor compatibility

The AST layer continues to handle static imports, exports, URL literals, worker/event-source/websocket construction and nested JavaScript where supported.

### Part 8 — Transport + media edge cases

Flash's transport rule is deliberately protocol-aware:

| Traffic | Flash behavior |
|---|---|
| HTML | Parse + rewrite |
| CSS | Rewrite URLs |
| JavaScript | AST/WASM + conservative fallback |
| Images/fonts/media | Stream |
| HTTP redirects | Rewrite to Flash URLs |
| WebSocket | Wisp transport |
| Bare-compatible traffic | Bare server |
| STUN/TURN/ICE | Keep native |
| WebRTC media | Keep native |

The goal is not to force every protocol through HTTP. The goal is to make every protocol behave correctly.

## 📦 API

```js
import { fpAPI } from '/fp-api.js';

fpAPI.go('example.com', container);
fpAPI.go('cats', container);
fpAPI.goRAW('https://example.com/path', container);
fpAPI.back(container);
fpAPI.forward(container);
fpAPI.reload(container);
```

## 📁 Project layout

```text
public/          Demo browser UI
src/             Browser API, URL helpers and service-worker support
rewriters/       HTML, CSS, JS and browser-runtime rewriting
rewriter/        Rust/WASM JavaScript transformer
tests/           Regression tests
server.js        HTTP + Bare + Wisp server
logo.png         The beautiful Flash logo ⚡
```

## 🛠️ Ten-part rebuild

| Part | Focus | Status |
|---|---|---|
| 1 | Foundation | ✅ |
| 2 | Resource rewriting | ✅ |
| 3 | JavaScript + browser runtime | ✅ |
| 4 | Networking + compatibility hardening | ✅ |
| 5 | Whole-project compatibility | ✅ |
| 6 | Difficult-site compatibility | ✅ |
| **7 + 8** | **Advanced runtime + transport/media compatibility** | 🔨 **Current** |
| 9 | Performance + memory tuning | ⏳ |
| 10 | Final integration, testing + polish | ⏳ |

## ⚖️ License

Flash Proxy is its own implementation. It can use open-source dependencies, but Flash's own rewriting and runtime code is developed independently rather than being a renamed copy of another proxy implementation.

---

<div align="center">
  <sub>Made with ⚡ and an unreasonable amount of browser debugging.</sub>
</div>
