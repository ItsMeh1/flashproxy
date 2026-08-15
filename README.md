# Flash Proxy ⚡

Flash Proxy is an experimental web proxy/rewriting engine designed to make proxied sites behave as normally as possible in a browser.

> **Status:** active development. Flash is not yet a drop-in replacement for Scramjet on every complex site.

## What Flash does

- HTTP/HTTPS proxying through `/fp/<absolute-url>`
- HTML rewriting with `htmlparser2`
- CSS `url(...)` and `@import` rewriting
- JavaScript rewriting through the Rust/WASM engine when built
- Conservative JavaScript fallback when WASM is unavailable
- Browser runtime interception for `fetch`, XHR, WebSocket, EventSource, Worker, `window.open`, history APIs and `sendBeacon`
- Server-side, per-browser-session target cookie storage
- Redirect rewriting
- Bare Server and Wisp upgrade support
- A small browser-facing `fpAPI`
- Regression tests for the URL/HTML/CSS rewriting layer

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

## License note

Flash Proxy is its own implementation. The project may use compatible open-source dependencies, but Flash's rewriting/runtime code is not intended to be a renamed copy of another proxy implementation.
