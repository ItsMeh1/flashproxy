<div align="center">
  <img src="./logo.png" alt="Flash Proxy" width="180">

  # Flash Proxy ⚡
  ### Complete setup, build, test, and usage guide
</div>

---

Welcome to **Flash Proxy**! This guide is written to be followed from top to bottom. If you have never worked on the project before, **start at Step 1 and do not skip ahead** until the previous step succeeds.

> **Quick idea:** Flash has two important pieces: the Node.js proxy/server and the optional high-quality Rust → WebAssembly JavaScript rewriter. You can run Flash with the JavaScript fallback, but building the WASM rewriter gives the full rewriting path.

## Before you start

You need:

- **Node.js 18 or newer**
- **npm** (included with normal Node.js installations)
- **Git**, if you are cloning the repository
- **Rust + Cargo + rustup** for building the WASM rewriter
- The `wasm32-unknown-unknown` Rust target
- `wasm-bindgen-cli` for the WASM build script
- `wasm-opt` is recommended but optional

### Check Node and npm

```bash
node --version
npm --version
```

Node must be **18+**.

### Check Rust tooling

```bash
rustc --version
cargo --version
rustup --version
```

If you do not have Rust, install it with the official Rust toolchain installer, then reopen your terminal.

---

# Step 1 — Get Flash Proxy

If you already have the repository, open a terminal in the Flash Proxy directory and continue to Step 2.

Otherwise:

```bash
git clone https://github.com/ItsMeh1/flashproxy.git
cd flashproxy
```

If you are working on a development branch such as `flash-rebuild`, switch to that branch before continuing:

```bash
git checkout flash-rebuild
```

---

# Step 2 — Install the Node dependencies

From the repository root:

```bash
npm install
```

This installs the server, transports, HTML/CSS helpers, parser dependencies, and development tools used by Flash.

If `node_modules/` already exists and you are simply updating your checkout, running `npm install` again is safe.

### Clean install when dependencies look broken

If npm is behaving strangely, remove the installed dependencies and install again.

macOS/Linux:

```bash
rm -rf node_modules
npm install
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

Do **not** delete `package-lock.json` unless you intentionally want to regenerate the dependency lockfile.

---

# Step 3 — Check whether the WASM rewriter is already built

Before building anything, look inside:

```text
rewriter/
```

and check whether the build output expected by the project's rewriter loader is already present.

If a valid built rewriter is already there, **you do not have to rebuild it just to start Flash**. You can continue to Step 4 and test the existing build.

However, rebuild it if:

- you changed `rewriter/src/lib.rs`;
- you checked out a different commit/branch;
- the WASM output is missing;
- the loader reports that the module cannot be loaded;
- or you want to make certain the generated output matches the source.

> **Important:** generated WASM output is build output, not the Rust source itself. If you change the Rust rewriter, rebuild it before testing the full application.

---

# Step 4 — Prepare the Rust WASM toolchain

Flash's Rust rewriter targets WebAssembly.

First make sure the target exists:

```bash
rustup target add wasm32-unknown-unknown
```

Then make sure the WebAssembly binding tool is available:

```bash
wasm-bindgen --version
```

If it is missing, install it with:

```bash
cargo install wasm-bindgen-cli
```

`wasm-opt` is optional. If you have Binaryen installed, the build can optimize the generated WASM, but Flash does not require it just to build the rewriter.

---

# Step 5 — Build the Flash JavaScript rewriter

Now build the Rust → WASM rewriter:

```bash
npm run rewriter:build
```

This runs the project's build script in:

```text
rewriter/build.sh
```

The source code for the transformer is here:

```text
rewriter/src/lib.rs
```

### If the build fails

Run the Rust check directly:

```bash
npm run check:rust
```

If the failure says the WebAssembly target is missing:

```bash
rustup target add wasm32-unknown-unknown
```

If the failure says `wasm-bindgen` is missing:

```bash
cargo install wasm-bindgen-cli
```

Then run the build again:

```bash
npm run rewriter:build
```

### If you already have a valid built rewriter

You can skip rebuilding and continue to Step 6. If you are unsure whether it is valid, rebuilding is the safest option.

---

# Step 6 — Run the complete project checks

Now validate the JavaScript side of the repository:

```bash
npm run check
```

This performs the repository's JavaScript syntax checks and runs the Node test suite.

You can also run only the tests:

```bash
npm test
```

For an interactive development test loop:

```bash
npm run test:watch
```

### Recommended order after a Rust change

Use this sequence:

```bash
npm run rewriter:build
npm run check
```

### Recommended order after a JavaScript/server change

Use:

```bash
npm run check
```

There is no reason to rebuild the WASM module when you have only changed ordinary JavaScript, HTML, CSS, or documentation.

---

# Step 7 — Start Flash Proxy

Once the checks pass:

```bash
npm start
```

The server normally listens on:

```text
http://localhost:3000
```

Open that address in your browser.

For development, use:

```bash
npm run dev
```

The development command uses Node's watch mode and restarts the server when the watched server files change.

---

# Step 8 — Test a proxied website

Flash's direct proxy route is:

```text
/fp/<absolute-target-url>
```

For example:

```text
http://localhost:3000/fp/https://example.com/
```

You can also use the Flash browser UI if it is enabled by the current frontend.

A successful HTML request goes through approximately this pipeline:

```text
Browser
   │
   ▼
Flash server
   │
   ▼
Target website
   │
   ▼
Response classification
   │
   ├── HTML → HTML rewriting + runtime injection
   ├── CSS  → CSS URL rewriting
   ├── JS   → WASM rewriter when available
   └── Other data → streamed response
   │
   ▼
Browser
```

---

# Step 9 — Understand the proxy URL format

If the target is:

```text
https://example.com/path/page.html
```

Flash represents it as:

```text
/fp/https://example.com/path/page.html
```

The target URL remains HTTP/HTTPS while the `/fp/` prefix tells Flash that the request should be fetched through the proxy.

WebSockets use a separate transport path. Flash does **not** turn STUN/TURN URLs into ordinary `/fp/` URLs.

That distinction is important for WebRTC.

---

# Step 10 — Use the browser API

The browser-facing API is exposed by the project as `fpAPI`.

A basic example is:

```js
import { fpAPI } from '/fp-api.js';

const container = document.querySelector('#browser-container');

fpAPI.go('example.com', container);
```

You can navigate to a domain or search text with `go()`:

```js
fpAPI.go('example.com', container);
fpAPI.go('cats', container);
```

For an exact absolute HTTP(S) URL, use `goRAW()`:

```js
fpAPI.goRAW('https://example.com/some/path', container);
```

Navigation controls:

```js
fpAPI.back(container);
fpAPI.forward(container);
fpAPI.reload(container);
```

The API maintains navigation state per target container.

---

# Step 11 — Understand what the browser runtime rewrites

Flash has a browser-side runtime for APIs that can create network requests after the initial page load.

The runtime covers important APIs including:

- `fetch()`
- `Request`
- `XMLHttpRequest`
- `WebSocket`
- `EventSource`
- `Worker`
- `SharedWorker`
- `navigator.serviceWorker.register()`
- `importScripts()`
- `window.open()`
- `navigator.sendBeacon()`
- `history.pushState()`
- `history.replaceState()`
- dynamically changed DOM URL attributes
- `srcset` and `imagesrcset`

It also watches DOM mutations so URLs inserted after page load can be handled.

This is necessary because many modern sites are single-page applications. The initial HTML may contain almost none of the URLs the application will request later.

---

# Step 12 — WebRTC: what Flash does and does not rewrite

Flash supports the surrounding browser APIs needed by sites that use WebRTC, but **WebRTC is not the same thing as an HTTP URL**.

Flash intentionally does not rewrite ICE servers such as:

```js
{
  urls: 'stun:stun.example.com:3478'
}
```

and it does not rewrite SDP candidates into `/fp/` URLs.

That is intentional. STUN/TURN and ICE negotiation use their own protocols and transport semantics. Blindly converting them into ordinary HTTP proxy URLs would break peer connection establishment.

The native browser implementations of these APIs remain available, including:

```js
RTCPeerConnection
RTCDataChannel
```

So a WebRTC application can still perform its own signaling and peer negotiation normally, subject to the browser, network, and the target application's signaling architecture.

---

# Step 13 — Cookies and sessions

The proxy sits between the browser and target server, so Flash has to handle target cookies rather than allowing the browser to send them directly to the target.

Cookie handling considers properties such as:

- domain
- path
- `Secure`
- expiration

This prevents unrelated proxied targets from accidentally sharing their session cookies.

---

# Step 14 — Redirects

Suppose the target responds with:

```http
Location: https://example.com/login
```

Flash resolves the target URL and keeps navigation inside the proxy rather than sending the browser directly to the target origin.

Relative redirects are resolved against the target response URL before being converted to a Flash proxy URL.

---

# Step 15 — Learn where everything lives

The most useful files are:

```text
server.js              Main server and request/response pipeline
src/url.js             URL normalization and proxy URL helpers
src/api.js             Browser-facing navigation API
src/sw.js              Service-worker routing
rewriters/html.js      HTML parsing and rewriting
rewriters/css.js       CSS URL rewriting
rewriters/js/          JavaScript rewriter bridge/fallback
rewriters/runtime.js   Browser-side API interception
rewriter/src/lib.rs    Rust/WASM JavaScript transformer
rewriter/build.sh      WASM build script
tests/                 Regression tests
scripts/check-js.mjs   Repository-wide JS syntax checking
public/                Flash browser/demo frontend
.github/workflows/     Continuous integration checks
package.json           Commands and dependencies
README.md              Project overview
TUTORIAL.md            This guide
```

---

# Step 16 — Development workflow

The safest workflow is:

### You changed only JS/CSS/HTML/server code

```bash
npm run check
npm start
```

### You changed the Rust rewriter

```bash
npm run rewriter:build
npm run check
npm start
```

### You changed dependencies

```bash
npm install
npm run check
```

### You changed both Rust and JavaScript

```bash
npm install
npm run rewriter:build
npm run check
npm start
```

### You want a clean rebuild

macOS/Linux:

```bash
rm -rf node_modules
npm install
npm run rewriter:build
npm run check
npm start
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
npm run rewriter:build
npm run check
npm start
```

---

# Step 17 — Common problems

## `npm: command not found`

Install Node.js and reopen your terminal.

Then verify:

```bash
node --version
npm --version
```

## `cargo: command not found`

Install Rust and reopen your terminal.

Verify:

```bash
rustc --version
cargo --version
```

## `wasm32-unknown-unknown` is missing

Run:

```bash
rustup target add wasm32-unknown-unknown
```

Then rebuild:

```bash
npm run rewriter:build
```

## `wasm-bindgen` is missing

Run:

```bash
cargo install wasm-bindgen-cli
```

Then rebuild the rewriter.

## The WASM rewriter cannot be loaded

First rebuild it:

```bash
npm run rewriter:build
```

Then run:

```bash
npm run check
```

Flash has a conservative JavaScript fallback, so a missing WASM artifact should not make every ordinary response unusable, but the WASM path is preferred for the strongest JavaScript rewriting.

## Port 3000 is already in use

Stop the process currently using the port, or inspect the server configuration before starting another Flash instance. Do not run several copies against the same port.

## A proxied website looks broken

First determine which layer is failing:

1. Does `/fp/https://example.com/` load at all?
2. Does the response have the expected content type?
3. Does ordinary HTML load while JavaScript fails?
4. Does the site work until a dynamic API request occurs?
5. Is the failure a WebSocket, worker, service worker, WebRTC, or cookie problem?

Then run:

```bash
npm run check
```

and inspect the browser console/network panel.

Do not immediately add another broad regex to the JavaScript rewriter. Identify the actual URL/API path first; broad rewrites can break unrelated application strings.

---

# Step 18 — Testing checklist before calling a change finished

Run the complete check:

```bash
npm run check
```

If the Rust rewriter changed:

```bash
npm run check:rust
npm run rewriter:build
npm run check
```

Then manually test at least:

- a normal HTML page;
- a page with CSS;
- a page with images and `srcset`;
- a page with redirects;
- a page with Fetch/XHR requests;
- a WebSocket application;
- a Worker application;
- an SPA using `history.pushState()`;
- a site using service-worker registration;
- a WebRTC application, if available for testing.

When testing WebRTC, remember that native ICE/STUN/TURN behavior is intentionally different from ordinary HTTP resource proxying.

---

# Step 19 — CI validation

The repository includes GitHub Actions validation.

The CI workflow installs dependencies, runs the JavaScript checks/tests, validates `package.json`, installs the Rust WebAssembly target, and runs the Rust check.

That means a successful local check is useful, but you should still look at the CI result for the exact commit when collaborating on the repository.

---

# Step 20 — The complete first-time setup, condensed

If you just want the exact sequence after cloning, this is it:

```bash
git clone https://github.com/ItsMeh1/flashproxy.git
cd flashproxy
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

If the repository already contains a valid built WASM rewriter, you may skip `npm run rewriter:build` for a first run. **If you changed the Rust rewriter, build it again.**

---

# ⚡ Final mental model

You do not need to memorize the entire codebase. Remember these layers:

```text
             YOUR BROWSER
                  │
                  ▼
            Flash frontend
                  │
                  ▼
            Flash server
                  │
                  ▼
             Target site
                  │
                  ▼
        ┌──────────────────┐
        │ Response layer   │
        ├──────────────────┤
        │ HTML rewriter    │
        │ CSS rewriter     │
        │ JS/WASM rewriter │
        │ Cookie handling  │
        │ Redirect handling│
        │ Streaming        │
        └────────┬─────────┘
                 │
                 ▼
          Flash runtime
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
     Fetch      XHR       WebSocket
       │         │         │
     Worker   EventSource  etc.

WebRTC remains native where its protocols require it:
ICE → STUN/TURN → SDP → RTCPeerConnection
```

When something breaks, ask **which layer is responsible** before changing code. That makes debugging Flash dramatically easier.

---

<div align="center">
  <strong>⚡ Flash Proxy</strong><br>
  <sub>Build it. Test it. Break it. Fix it. Make the web work.</sub>
</div>
