<h1 align="center">Flash Proxy</h1>
<div align="center">
  <img src="logo.png" height="200" />
</div>

<div align="center">
  <img src="https://img.shields.io/github/issues/ItsMeh1/flashproxy?style=flat&color=orange" />
  <img src="https://img.shields.io/github/stars/ItsMeh1/flashproxy?style=flat&color=orange" />
</div>

[📦 Getting Started](./TUTORIAL.md) 

# Prerequisites

You'll need these to run Flash Proxy.
```bash
# 1. Node.js 18+ (you probably have this)
node --version

# 2. Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 3. WASM target for Rust
rustup target add wasm32-unknown-unknown

# 4. wasm-bindgen-cli (bridges Rust WASM to JS)
cargo install wasm-bindgen-cli

# 5. wasm-opt (Binaryen — optimizes .wasm size & speed)
# macOS:
brew install binaryen
# Ubuntu/Debian:
sudo apt install binaryen
# Windows (via chocolatey):
choco install binaryen
# Or download from: https://github.com/WebAssembly/binaryen/releases
```

Verify everything:

```bash
rustc --version        # Should print 1.80+
wasm-bindgen --version # Should print 0.2.x
wasm-opt --version     # Should print version 120+
```

## Build & Run

```bash
# 1. Build WASM (one time, or after changing Rust)
cd rewriter && bash build.sh

# 2. Commit pkg/ so others don't need Rust (optional)
git add rewriter/pkg/
git commit -m "Add prebuilt WASM"

# 3. Run
npm start
```

```bash
npm install
npm start
```
Open http://localhost:3000.

## API
```javascript
fp.go("youtube.com")      // URL
fp.go("how to code")      // Search query
fp.go("192.168.1.1")      // IP address
fp.goRaw("https://...")   // Bypass detection
```

It automatically formats searches, links, everything. All of it for you automatically.

## Architecture
Oxc Parser: Fast Rust-based JS AST parsing for byte-span rewrites
Cookie Jar: Per-domain cookie storage with automatic forwarding
Wisp: WebSocket TCP tunneling for WebSocket proxying
Rewriters: HTML/CSS/JS URL rewriting + runtime API injection


---

## How to Use

```bash
mkdir flashproxy && cd flashproxy
# Create all files above in their folders
npm install
npm start
# Open http://localhost:3000
# Type "example.com" or "youtube.com" and hit Go
```
This is a working proxy. It has a cookie jar, handles all HTTP methods, rewrites HTML/CSS/JS, injects runtime shims, and runs a Wisp server for WebSockets. It won't beat Scramjet or other proxy systems on complex sites yet, but the architecture is the same.


---

## Features & Stuff

| Feature | Status |
|--------|--------|
| **Oxc parser** (`oxc-parser`) | ✅ Back in `rewriters/js/rewriter.js` |
| **Oxc walker** (`oxc-walker`) | ✅ In `package.json` for future use |
| **Cookie jar** | ✅ Full per-domain storage + forwarding |
| **All HTTP methods** | ✅ `app.all()` with body forwarding |
| **Wisp server** | ✅ Proper `wisp-js/server` import |
| **Redirect handling** | ✅ 301/302 rewritten to proxy URLs |
| **Security header stripping** | ✅ CSP, X-Frame-Options removed |
| **Template literal rewriting** | ✅ Via Oxc AST |
| **Smart `fp.go()`** | ✅ Auto URL vs search detection |
| **File structure** | ✅ Matches your screenshot |

Run `npm install && npm start`. It works.

Made with ❤️ by @ItsMeh1
Made with the help of Kimi K2.6
