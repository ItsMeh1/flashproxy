<div align="center">
  <img src="./logo.png" alt="Flash Proxy" width="180">

  # Flash Proxy ⚡
  ### The practical guide
</div>

---

Welcome to Flash Proxy! This guide gets you from **clone → running proxy → understanding the pipeline → developing it**.

> 💡 Flash is now a **10-part rebuild**. Part 5 is the broad compatibility pass; Parts 6–10 will push the project through harder sites, runtime edge cases, performance work and final integration testing.

## 1. 📦 Install

Flash requires **Node.js 18+**.

```bash
npm install
```

## 2. 🧪 Run the tests

```bash
npm test
```

For a continuously running test process:

```bash
npm run test:watch
```

## 3. ⚡ Start Flash

```bash
npm start
```

Open:

```text
http://localhost:3000
```

For development:

```bash
npm run dev
```

## 4. 🌐 Proxy a URL directly

Flash accepts an absolute HTTP/HTTPS URL after `/fp/`:

```text
http://localhost:3000/fp/https://example.com/
```

The server chooses a response path:

```text
HTML       → HTML parser + URL rewriting + runtime injection
CSS        → CSS URL rewriting
JavaScript → Rust/WASM AST rewriter when available
Binary     → streamed back to the browser
Redirect   → converted into a Flash proxy URL
```

## 5. 🧭 Use the browser API

```js
import { fpAPI } from '/fp-api.js';

const container = document.querySelector('#browser-container');

fpAPI.go('example.com', container);
fpAPI.go('cats', container); // search text
fpAPI.goRAW('https://example.com/some/path', container);
```

Navigation:

```js
fpAPI.back(container);
fpAPI.forward(container);
fpAPI.reload(container);
```

`go()` resolves domains, IP addresses and search text. `goRAW()` requires an absolute HTTP(S) URL.

## 6. 🍪 Cookies

The browser talks to Flash rather than directly to the target site. Flash therefore keeps a per-session cookie jar.

Cookies are selected using:

- domain
- path
- secure flag
- expiration

This keeps proxied sites from accidentally sharing their cookies with one another.

## 7. ↪️ Redirects

If the target returns:

```text
Location: https://example.com/login
```

Flash converts it into:

```text
/fp/https://example.com/login
```

Relative redirects are resolved against the original target URL before they are proxied.

## 8. 🧩 How rewriting works

```text
Browser
   │
   ▼
 fpAPI / iframe
   │
   ▼
 /fp/<target>
   │
   ▼
 HTTP request
   │
   ├───────────────┐
   ▼               ▼
Target         Flash response layer
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
        HTML      CSS       JS
        parser   scanner   AST/WASM
          │        │        │
          └────────┼────────┘
                   ▼
             rewritten page
                   │
                   ▼
             Flash runtime
```

The runtime catches browser APIs that can create new network requests, including Fetch, XHR, WebSocket, EventSource and Workers. Navigation APIs such as `window.open`, `history.pushState` and `history.replaceState` are also covered.

## 9. 🦀 Build the Rust/WASM rewriter

The high-quality JavaScript transformer is in:

```text
rewriter/src/lib.rs
```

Build it with:

```bash
npm run rewriter:build
```

The build script checks for the required Rust tooling and installs the WebAssembly target when `rustup` is available. `wasm-opt` is optional.

If the generated module cannot be loaded, Flash uses a conservative fallback instead of failing the entire response.

## 10. 🔧 Change the code

Useful locations:

```text
server.js              Network transport + response handling
src/url.js             URL normalization/proxy helpers
src/api.js             Browser-facing API
src/sw.js              Service-worker routing
rewriters/html.js      HTML rewriting
rewriters/css.js       CSS rewriting
rewriters/js/          JavaScript rewriting bridge
rewriters/runtime.js   Browser-side interception
rewriter/src/lib.rs    Rust/WASM AST transformer
tests/                 Regression tests
public/                Demo UI
```

After JavaScript-side changes:

```bash
npm test
```

After Rust changes:

```bash
npm run rewriter:build
npm test
```

## 11. ⏱️ Upstream timeouts

Flash does not let a dead upstream request hang forever. The default timeout is 30 seconds.

You can change it with:

```bash
FLASH_UPSTREAM_TIMEOUT=60000 npm start
```

The value is milliseconds.

## 12. 🧪 What Part 5 changed

Part 5 is the **whole-project compatibility pass**. It improves the pieces that have to cooperate:

1. URL normalization
2. Browser navigation/history
3. Fetch + `Request`
4. XHR
5. WebSocket
6. EventSource
7. Workers
8. Service-worker behavior
9. Cookie/session handling
10. upstream timeouts
11. HTML/CSS/JS regression coverage
12. responsive browser-shell UI
13. CI validation
14. WASM build portability

## 13. 🛣️ The ten-part roadmap

- ✅ **Part 1 — Foundation**
- ✅ **Part 2 — Resource rewriting**
- ✅ **Part 3 — JavaScript + runtime**
- ✅ **Part 4 — Networking + compatibility hardening**
- 🔨 **Part 5 — Whole-project compatibility pass**
- ⏳ **Part 6 — Difficult-site compatibility**
- ⏳ **Part 7 — Advanced JS/runtime coverage**
- ⏳ **Part 8 — Transport + media edge cases**
- ⏳ **Part 9 — Performance + memory tuning**
- ⏳ **Part 10 — Final integration, testing + polish**

Part 5 is not being declared “perfect.” The point is to establish a much stronger baseline so Parts 6–10 can focus on failures found through real compatibility testing.

---

<div align="center">
  <strong>⚡ Flash Proxy</strong><br>
  <sub>Build it. Break it. Fix it. Make the web work.</sub>
</div>
