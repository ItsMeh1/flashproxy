<div align="center">
  <img src="./logo.png" alt="Flash Proxy" width="220">

  # Flash Proxy ⚡

  **A browser-focused web proxy and rewriting engine.**

  <p>Making proxied websites behave as much like normal websites as the browser and protocol allow.</p>
</div>

---

> 🚧 **Development status:** Flash Proxy has completed its 10-part rebuild on the `flash-rebuild` branch. It is still a development project, so real-site testing is essential before treating it as production-ready.

## ✨ What Flash does

- 🌐 HTTP/HTTPS proxying through `/fp/<absolute-url>`
- 🧩 Parser-based HTML rewriting
- 🎨 CSS `url(...)`, `@import`, inline-style, and stylesheet rewriting
- ⚡ Rust → WebAssembly JavaScript rewriting with a conservative fallback
- 🧠 Browser-runtime interception for dynamic network and navigation APIs
- 🧰 Worker and service-worker compatibility helpers
- 📡 WebSocket/Wisp and Bare transport support
- 📹 WebRTC-aware handling that preserves native ICE/STUN/TURN behavior
- 🍪 Per-browser-session target cookie storage
- ↪️ Redirect rewriting
- 📦 Streaming of binary/media responses instead of trying to rewrite everything
- 🧪 Regression tests, JavaScript syntax checks, and Rust CI checks
- 🖥️ A small browser-facing `fpAPI` and demo UI

## 🚀 Quick start

### Requirements

- Node.js **18+**
- npm
- Rust + Cargo
- `wasm32-unknown-unknown` Rust target
- `wasm-bindgen-cli` for building the WASM rewriter

### First-time setup

```bash
npm install
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
npm run rewriter:build
npm run check
npm start
```

Then open:

```text
http://localhost:3000
```

If the repository already contains a valid generated WASM rewriter and you did not change the Rust source, the rewriter build can be skipped. **If `rewriter/src/lib.rs` changes, rebuild it.**

### Development

```bash
npm run dev
```

### Useful commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run rewriter:build` | Build the Rust/WASM JavaScript rewriter |
| `npm test` | Run regression tests |
| `npm run check` | Check JS syntax and run tests |
| `npm run check:rust` | Check the Rust/WASM project |
| `npm run test:watch` | Continuously run the tests |
| `npm start` | Start Flash |
| `npm run dev` | Start Flash with Node watch mode |

For the full, step-by-step setup—including existing build output, troubleshooting, testing, WebRTC behavior, and development workflow—see **[TUTORIAL.md](./TUTORIAL.md)**.

## ⚡ How the proxy works

```text
Browser / Flash UI
        │
        ▼
   Flash server
        │
        ├── /fp/<target>
        │      │
        │      ├── HTML → parse + rewrite + runtime
        │      ├── CSS  → rewrite URLs
        │      ├── JS   → Rust/WASM + fallback
        │      └── binary/media → stream
        │
        ├── /bare/ → Bare transport
        │
        └── /wisp/ → WebSocket/Wisp transport
```

The important idea is **protocol awareness**. Flash does not try to force every browser protocol through an HTTP URL rewriter.

For example, HTTP resources can become:

```text
/fp/https://example.com/app.js
```

while WebSocket traffic uses the Wisp transport, and WebRTC ICE/STUN/TURN remains native.

## 🧠 Browser runtime

Initial HTML rewriting is only part of the problem. Modern websites create URLs after the page has loaded, so Flash also injects a browser-side runtime.

The runtime covers important browser-created entry points including:

- `fetch()` and `Request`
- `XMLHttpRequest`
- `WebSocket`
- `EventSource`
- `Worker` / `SharedWorker`
- service-worker registration
- worker `importScripts()`
- `window.open()`
- `sendBeacon()`
- history navigation
- dynamic DOM URL attributes
- `srcset` / `imagesrcset`
- relevant SVG URL attributes

The runtime also observes relevant DOM changes so dynamically inserted resources can be handled.

## 📹 WebRTC is intentionally different

Flash can rewrite the JavaScript surrounding a WebRTC application, but it should **not** turn STUN/TURN/ICE endpoints into `/fp/` HTTP URLs.

For example:

```js
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.example.com:3478' }]
});
```

That STUN endpoint is part of ICE negotiation, not a normal HTTP resource. Flash therefore preserves native `RTCPeerConnection`, ICE, STUN, TURN, and WebRTC media semantics.

This is intentional protocol compatibility—not a missing URL rewrite.

## 📦 `fpAPI`

The browser-facing API is exposed at `/fp-api.js`.

```js
import { fpAPI } from '/fp-api.js';

const container = document.querySelector('#browser-container');

fpAPI.go('example.com', container);
fpAPI.go('cats', container);
fpAPI.goRAW('https://example.com/path', container);
fpAPI.back(container);
fpAPI.forward(container);
fpAPI.reload(container);
```

`go()` accepts a domain, URL, or search text. `goRAW()` is for an explicit absolute HTTP(S) URL.

## 🏗️ Project layout

```text
public/                 Flash browser/demo UI
src/url.js              Proxy URL and target resolution
src/api.js              Browser-facing navigation API
src/sw.js               Service-worker support
rewriters/html.js       HTML parser + URL rewriting
rewriters/css.js        CSS rewriting
rewriters/js/           JavaScript rewriter bridge/fallback
rewriters/runtime.js    Browser-side API interception
rewriter/src/lib.rs     Rust/WASM JavaScript transformer
rewriter/build.sh       WASM build script
tests/                  Regression tests
scripts/check-js.mjs    Repository-wide JS syntax checking
server.js               HTTP + Bare + Wisp server
public/                 Browser frontend
logo.png                The beautiful Flash logo ⚡
TUTORIAL.md             Complete setup and usage guide
```

## 🔧 Development workflow

After changing normal JavaScript, HTML, CSS, or server code:

```bash
npm run check
```

After changing the Rust rewriter:

```bash
npm run rewriter:build
npm run check
```

For a clean dependency rebuild on macOS/Linux:

```bash
rm -rf node_modules
npm install
npm run rewriter:build
npm run check
```

On Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
npm run rewriter:build
npm run check
```

Do not delete `package-lock.json` unless you intentionally want to regenerate the dependency lockfile.

## 🧪 Testing real sites

A passing unit test suite does not mean every website will work. Test the complete pipeline with sites that exercise different browser features:

- normal HTML/CSS
- redirects
- images and `srcset`
- Fetch/XHR
- WebSockets
- Workers
- single-page-app history navigation
- service workers
- authentication/cookies
- WebRTC where available

When something breaks, identify the failing protocol or rewriting layer before adding another broad rewrite rule.

## 📚 Documentation

**[Read the complete tutorial →](./TUTORIAL.md)**

The tutorial covers installation, the existing-WASM-build path, rewriter compilation, tests, server startup, proxy URL format, browser APIs, WebRTC, cookies, redirects, troubleshooting, and the recommended development workflow.

## ⚖️ License and dependencies

Flash Proxy's own rewriting/runtime implementation is developed as its own project. It uses third-party open-source packages for pieces such as parsing and transport. See the dependency manifests and their respective licenses for the terms that apply to those components.

---

<div align="center">
  <sub>Made with ⚡ and an unreasonable amount of browser debugging.</sub>
</div>
