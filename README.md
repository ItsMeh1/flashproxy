<div align="center">
  <img src="./logo.png" alt="Flash Proxy" width="220">

  # Flash Proxy ⚡

  **A fast, browser-focused web proxy and rewriting engine.**

  <p>Making proxied websites behave like normal websites is the goal.</p>
</div>

---

> 🚧 **Development status:** Flash Proxy is being rebuilt in five major parts. This branch contains the ongoing **Part 4 networking and compatibility work**.

## ✨ What Flash does

Flash separates the hard parts of browser proxying into layers instead of trying to solve everything with one giant rewriter.

- 🌐 HTTP/HTTPS proxying through `/fp/<absolute-url>`
- 🧩 Parser-based HTML rewriting
- 🎨 CSS `url(...)` and `@import` rewriting
- ⚡ AST-based JavaScript rewriting through Rust/WASM
- 🛟 Conservative JavaScript fallback
- 🧠 Browser runtime interception for Fetch, XHR, WebSocket, EventSource, Workers and navigation APIs
- 🍪 Per-browser-session cookie storage
- ↪️ Redirect rewriting
- 🔌 Bare Server + Wisp transport support
- 🧪 Regression tests
- 🖥️ A small browser-facing `fpAPI`

## 🚀 Quick start

### Requirements

- Node.js 18+
- npm
- Rust + `wasm-pack` if you want to build the optional WASM JavaScript rewriter

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

The high-quality JavaScript transformer lives in `rewriter/src/lib.rs` and uses Oxc's AST machinery.

```bash
npm run rewriter:build
```

Flash can fall back to conservative URL rewriting when the generated WASM module is unavailable.

## 🏗️ Architecture

```text
                         ┌──────────────────┐
                         │   Flash Browser   │
                         │   UI + fpAPI      │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Flash Runtime     │
                         │ fetch / XHR / WS │
                         │ workers / nav    │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   /fp/<target>   │
                         └────────┬─────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
         HTTP transport      Response rewriting   WS transport
              │                   │                   │
              │          ┌────────┼────────┐          │
              │          ▼        ▼        ▼          │
              │        HTML      CSS       JS        │
              │        parser   scanner   Rust/WASM  │
              │          └────────┼────────┘          │
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  ▼
                           Target website
```

### Part 4 focus

Part 4 is about making the layers cooperate reliably:

- request headers are filtered before upstream fetches
- browser-session cookies are stored and selected by domain/path
- redirects become Flash URLs
- rewritten responses no longer advertise stale lengths/encodings
- binary responses can stream instead of being buffered wholesale
- WebSocket/Bare/Wisp routing remains separate from normal HTTP proxying
- HTML rewriting removes integrity metadata that would otherwise reject modified resources

## 📦 API

```js
import { fpAPI } from '/fp-api.js';

fpAPI.go('example.com', container);
fpAPI.go('cats', container); // search
fpAPI.goRAW('https://example.com/path', container);
fpAPI.back(container);
fpAPI.forward(container);
fpAPI.reload(container);
```

## 📁 Project layout

```text
public/          Demo UI
src/             Browser API, URL helpers and service-worker support
rewriters/       HTML, CSS, JS and browser-runtime rewriting
rewriter/        Rust/WASM JavaScript transformer
tests/           Regression tests
server.js        HTTP + Bare + Wisp server
logo.png         The beautiful Flash logo ⚡
```

## 🛠️ Five-part rebuild

| Part | Focus | Status |
|---|---|---|
| 1 | Foundation | ✅ |
| 2 | Resource rewriting | ✅ |
| 3 | JavaScript + browser runtime | ✅ |
| 4 | Networking + compatibility hardening | 🔨 **Current** |
| 5 | Integration testing + final polish | ⏳ |

## 📚 Learn more

- **[Tutorial](./TUTORIAL.md)** — install Flash and understand the request/rewriting flow.
- **[Package configuration](./package.json)** — scripts and dependencies.

## ⚖️ License

Flash Proxy is its own implementation. It can use open-source dependencies, but Flash's own rewriting and runtime code is developed independently rather than being a renamed copy of another proxy implementation.

---

<div align="center">
  <sub>Made with ⚡ and an unreasonable amount of browser debugging.</sub>
</div>
