# Flash Proxy tutorial

## 1. Install

Flash Proxy needs Node.js 18+.

```bash
npm install
```

## 2. Run the tests

```bash
npm test
```

These tests cover the URL, CSS and HTML rewriting layer.

## 3. Start Flash

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## 4. Use the proxy directly

A target URL is placed after `/fp/`:

```text
http://localhost:3000/fp/https://example.com/
```

Flash fetches the target, rewrites the response when it is HTML/CSS/JavaScript, and returns it through the Flash origin.

## 5. Use the browser API

```js
import { fpAPI } from '/fp-api.js';

fpAPI.go('example.com', document.querySelector('#browser-container'));
fpAPI.goRAW('https://example.com/some/path', document.querySelector('#browser-container'));
```

`go()` accepts a URL, domain, IP, or search text. `goRAW()` skips that input detection.

## 6. Build the Rust rewriter

Flash has an AST-based Rust/WASM JavaScript transformer. Install the Rust/WASM prerequisites, then run:

```bash
npm run rewriter:build
```

When the generated module is present, Flash uses it automatically. If it is unavailable, Flash falls back to conservative string URL rewriting instead of failing the entire page.

## 7. What is happening

```text
browser
  ↓
Flash API / iframe
  ↓
/fp/<target>
  ↓
HTTP fetch
  ↓
┌───────────────┬──────────────┬────────────────┐
│ HTML          │ CSS          │ JavaScript     │
│ parser        │ URL scanner  │ Rust/WASM AST  │
└───────────────┴──────────────┴────────────────┘
  ↓
rewritten response
  ↓
browser runtime
```

The runtime also intercepts important browser APIs such as `fetch`, XHR, WebSocket, workers, EventSource, history and `window.open`.

## Development

```bash
npm run dev
```

After changing the Rust rewriter:

```bash
npm run rewriter:build
```

Then run:

```bash
npm test
```
