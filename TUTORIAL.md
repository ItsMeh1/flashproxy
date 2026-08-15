<div align="center">
  <img src="./logo.png" alt="Flash Proxy" width="180">

  # Flash Proxy ⚡
  ### The practical guide
</div>

---

Welcome to Flash Proxy! This guide gets you from **clone → running proxy → understanding the pipeline → developing it**.

> 💡 Flash is still under active development. Some advanced sites will need the Part 5 compatibility work before they behave perfectly.

## 1. 📦 Install

Flash requires **Node.js 18+**.

```bash
npm install
```

## 2. 🧪 Run the tests

```bash
npm test
```

The tests exercise the URL and rewriting layers. Run them after changing a rewriter so small changes do not quietly break existing behavior.

## 3. ⚡ Start Flash

```bash
npm start
```

Open:

```text
http://localhost:3000
```

For development, use:

```bash
npm run dev
```

## 4. 🌐 Proxy a URL directly

Flash accepts an absolute HTTP/HTTPS URL after `/fp/`:

```text
http://localhost:3000/fp/https://example.com/
```

The server fetches the target and chooses a response path:

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

`go()` accepts normal browser-style input such as domains, IP addresses and search text. `goRAW()` takes the URL as-is.

Navigation helpers:

```js
fpAPI.back(container);
fpAPI.forward(container);
fpAPI.reload(container);
```

## 6. 🍪 What happens to cookies?

The browser talks to Flash, so the target site's cookies cannot simply be left as ordinary target-domain cookies.

Flash instead keeps a per-session cookie jar and selects cookies using the target's:

- domain
- path
- secure flag
- expiration

That lets multiple proxied sites keep separate cookie state inside the same Flash session.

## 7. ↪️ What happens to redirects?

Suppose the target returns:

```text
Location: https://example.com/login
```

Flash converts it to a Flash URL so the browser stays inside the proxy:

```text
/fp/https://example.com/login
```

Relative redirects are resolved against the original target URL first.

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

The browser runtime then catches APIs that can create new network requests, including Fetch, XHR, WebSocket, EventSource and Workers.

## 9. 🦀 Build the Rust/WASM rewriter

The high-quality JavaScript transformer is in:

```text
rewriter/src/lib.rs
```

Build it with:

```bash
npm run rewriter:build
```

The generated module is used automatically when available. If it cannot be loaded, Flash uses a conservative fallback instead of making the whole page fail.

## 10. 🔧 Change the code

Useful locations:

```text
server.js              Network transport + response handling
src/url.js             URL normalization/proxy helpers
src/api.js             Browser-facing API
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

## 11. 🧠 Part 4 notes

Part 4 is primarily about **network reliability**, not making the UI flashy.

The important rules are:

1. Keep target cookies isolated per Flash session.
2. Never forward hop-by-hop headers blindly.
3. Do not claim a stale `Content-Length` after rewriting a response.
4. Do not keep upstream compression when Flash needs to inspect the body.
5. Rewrite redirects before returning them.
6. Stream large/binary resources when possible.
7. Keep WebSocket/Wisp and Bare transport separate from normal HTTP fetching.
8. If Flash modifies resource bytes, stale integrity metadata must not survive.

## 12. 🚀 What's next?

The five-part plan is:

- ✅ **Part 1 — Foundation**
- ✅ **Part 2 — Resource rewriting**
- ✅ **Part 3 — JavaScript + runtime**
- 🔨 **Part 4 — Networking + compatibility**
- ⏳ **Part 5 — Integration testing + final polish**

Part 5 is where we can hammer Flash against difficult real-world pages, find the weird failures, and fix them instead of assuming everything works because `example.com` loaded.

---

<div align="center">
  <strong>⚡ Flash Proxy</strong><br>
  <sub>Build it. Break it. Fix it. Make the web work.</sub>
</div>
