<div align="center">
  <img src="./logo.png" alt="Flash Proxy" width="220">

  # Flash Proxy ⚡

  **A fast, browser-focused web proxy and rewriting engine.**

  <p>Making proxied websites behave like normal websites is the goal.</p>
</div>

---

> 🚧 **Development status:** Flash Proxy is now a **10-part rebuild**. This branch is on **Part 5: compatibility hardening**.

## ✨ What Flash does

Flash separates browser compatibility into layers instead of trying to solve everything with one giant rewriter.

- 🌐 HTTP/HTTPS proxying through `/fp/<absolute-url>`
- 🧩 Parser-based HTML rewriting
- 🎨 CSS `url(...)` and `@import` rewriting
- ⚡ AST-based JavaScript rewriting through Rust/WASM
- 🛟 Conservative JavaScript fallback
- 🧠 Browser runtime interception for Fetch, XHR, WebSocket, EventSource, Workers and navigation APIs
- 🍪 Per-browser-session cookie storage
- ↪️ Redirect rewriting
- 🔌 Bare Server + Wisp transport support
- ⏱️ Bounded upstream requests with configurable timeouts
- 🧪 Regression tests + CI checks
- 🖥️ A small browser-facing `fpAPI`

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

The JavaScript transformer lives in `rewriter/src/lib.rs` and uses Oxc's AST machinery.

```bash
npm run rewriter:build
```

If the generated WASM module is unavailable, Flash falls back to conservative URL rewriting instead of taking down the whole page.

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

## 🧠 Part 5 focus — compatibility hardening

Part 5 is intentionally broad. The goal is to make the pieces behave like **one proxy** rather than a collection of independent experiments.

This pass improves:

- URL normalization and scheme handling
- browser navigation/history
- Fetch and `Request` interception
- XHR, WebSocket, EventSource and Worker interception
- CSS/HTML/JS regression coverage
- upstream timeouts
- service-worker behavior
- CI validation
- mobile/responsive browser-shell UI
- WASM build portability
- documentation and project tooling

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
| **5** | **Whole-project compatibility pass** | 🔨 **Current** |
| 6 | Difficult-site compatibility | ⏳ |
| 7 | Advanced JS/runtime coverage | ⏳ |
| 8 | Transport + media edge cases | ⏳ |
| 9 | Performance + memory tuning | ⏳ |
| 10 | Final integration, testing + polish | ⏳ |

## 📚 Learn more

- **[Tutorial](./TUTORIAL.md)** — install Flash and understand the request/rewriting flow.
- **[Package configuration](./package.json)** — scripts and dependencies.

## ⚖️ License

Flash Proxy is its own implementation. It can use open-source dependencies, but Flash's own rewriting and runtime code is developed independently rather than being a renamed copy of another proxy implementation.

---

<div align="center">
  <sub>Made with ⚡ and an unreasonable amount of browser debugging.</sub>
</div>
