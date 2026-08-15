<div align="center">
  <img src="./logo.png" alt="Flash Proxy" width="220">
  <h1>Flash Proxy ⚡</h1>
  <p>A web proxy and rewriting engine built to make proxied sites behave as normally as possible in a browser.</p>
</div>

> **Status:** active development. Flash is being built in five major parts; this branch is the Part 2 rebuild.

## What Flash does

- HTTP/HTTPS proxying through `/fp/<absolute-url>`
- Parser-based HTML URL rewriting with `htmlparser2`
- CSS `url(...)` and `@import` rewriting
- JavaScript rewriting through the Rust/WASM engine when built
- Conservative JavaScript fallback when WASM is unavailable
- Browser runtime interception for `fetch`, XHR, WebSocket, EventSource, Worker, `window.open`, history APIs and `sendBeacon`
- Server-side, per-browser-session target cookie storage
- Redirect rewriting
- Bare Server and Wisp upgrade support
- A small browser-facing `fpAPI`
- Regression tests for URL/HTML/CSS rewriting

## Run it

```bash
npm install
npm test
npm start
```

Then open `http://localhost:3000`.

The demo UI uses the public API in `src/api.js` and loads proxied pages inside an iframe.

## Rust/WASM JavaScript rewriter

The high-quality JavaScript transform is implemented in `rewriter/src/lib.rs` and uses Oxc's parser/AST visitor. Build it with:

```bash
npm run rewriter:build
```

The Node runtime automatically uses the generated WASM module when it exists. If it cannot be loaded, Flash uses a deliberately conservative fallback instead of silently serving completely untouched JavaScript.

## Architecture

```text
Browser UI
   │
   ▼
fpAPI ─────── iframe
               │
               ▼
          Flash runtime
               │
               ▼
        /fp/<target URL>
               │
       ┌───────┼────────┐
       ▼       ▼        ▼
      HTTP    HTML/CSS  JavaScript
       │       │        │
       │       │     Rust/WASM
       │       │        │
       └───────┴────────┘
               │
               ▼
          target website

WebSockets ──► Wisp
Other proxy traffic ──► Bare Server
```

The important design rule is that **network transport, document rewriting, and browser runtime interception are separate layers**. This makes Flash easier to extend instead of turning the proxy into one giant collection of regexes.

## API

```js
import { fpAPI } from '/fp-api.js';

fpAPI.go('example.com', container);
fpAPI.go('cats', container); // search
fpAPI.goRAW('https://example.com/path', container);
fpAPI.back(container);
fpAPI.forward(container);
fpAPI.reload(container);
```

## Project layout

```text
public/          Demo UI
src/             Browser API, runtime support and URL helpers
rewriters/       HTML, CSS, JS and browser-runtime rewriting
rewriter/        Rust/WASM JavaScript transformer
tests/           Regression tests
server.js        HTTP + Bare + Wisp server
```

## Five-part rebuild

1. **Part 1 — Foundation:** separate transport, URL handling, rewriting and runtime layers.
2. **Part 2 — Resource rewriting:** strengthen URL resolution and HTML/CSS coverage, plus regression tests.
3. **Part 3 — JavaScript/runtime:** deepen AST transforms and browser API emulation.
4. **Part 4 — Networking:** harden cookies, redirects, headers, WebSockets, workers and edge cases.
5. **Part 5 — Compatibility:** integration testing and final fixes against increasingly complex real-world sites.

## License note

Flash Proxy is its own implementation. The project may use compatible open-source dependencies, but Flash's rewriting/runtime code is not intended to be a renamed copy of another proxy implementation.
