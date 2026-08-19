<div align="center">
  <img src="logo.png" alt="Flash Proxy" width="210">

  # Flash Proxy Lite ⚡

  **The static, browser-only side of Flash Proxy.**

  <p>No Node server is required to host the application.</p>
</div>

---

> **Important:** “Static” does not mean “a browser can magically proxy every website.” Browser same-origin and CORS rules still apply. Flash Proxy Lite can read and rewrite a target when the browser is allowed to read it, or when you configure an external CORS-capable endpoint. It cannot replace a real server-side proxy by itself.

## What it is

Flash Proxy Lite is a small static adaptation of Flash Proxy designed to run from GitHub Pages, another static host, or a local development server.

It provides:

- ⚡ a Flash-branded browser UI;
- 🔗 URL, history, reload, and keyboard navigation;
- 🧩 browser-side HTML/CSS rewriting for content the browser can read;
- 🌐 direct CORS fetches when the target permits them;
- 🔁 configurable external CORS-proxy endpoints when direct access is blocked;
- 🪟 display-only iframe fallback for sites that permit embedding;
- 💾 optional Service Worker caching (HTTPS/localhost only);
- 🧠 a small `FlashProxyLite` JavaScript API;
- 📱 responsive UI and accessibility-friendly controls.

## What it cannot do

A static website cannot receive an arbitrary request from a browser and then fetch the destination itself. That is exactly what the Flash Proxy server does.

Therefore Lite **cannot guarantee**:

- bypassing CORS without an external endpoint;
- rewriting a cross-origin iframe's DOM;
- proxying arbitrary POST requests through the static page;
- storing target-site cookies as a server-side proxy would;
- hosting Bare/Wisp endpoints itself;
- turning WebRTC/STUN/TURN into ordinary HTTP proxy traffic.

Those are browser/platform limitations, not missing JavaScript tricks.

## 🚀 Quick start

### Deploy it

There is no `npm install`, Node server, or build step required for the static app.

Upload these files while preserving their paths:

```text
index.html
style.css
logo.png
flashproxy-sw.js
src/
  flashproxy-core.js
  flashproxy-rewriter.js
  flashproxy-strategies.js
  flashproxy-sw.js
  flashproxy-ui.js
```

Then open the hosted `index.html`.

For GitHub Pages, the branch/folder containing these files can be published as a normal static site.

### Local testing

Opening `index.html` directly with `file://` is useful for checking the UI, but browser features such as Service Workers require a secure context. For the most representative test, use a tiny local static server or GitHub Pages.

For example, if Python is installed:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

No Flash Proxy backend is running here; the server is only serving static files.

## How the request flow works

```text
                 Flash Proxy Lite
                        │
                 target URL entered
                        │
                        ▼
                 Direct browser fetch
                    /           \
                 CORS OK       CORS blocked
                   │                │
                   ▼                ▼
              Read + rewrite   External CORS
                                  endpoint
                                      │
                                      ▼
                                Read + rewrite

        Optional: iframe display-only fallback
        Optional: Service Worker cache/offline layer
```

The default order is **Direct → external CORS endpoint**. An iframe strategy is available through the API but is intentionally not the default readable-content path because a cross-origin iframe cannot be inspected by JavaScript.

## 📁 Project structure

```text
fp-lite/
├── index.html
├── style.css
├── logo.png
├── flashproxy-sw.js          # root-scoped SW entry point
├── README.md
├── tutorial.md
└── src/
    ├── flashproxy-core.js
    ├── flashproxy-rewriter.js
    ├── flashproxy-strategies.js
    ├── flashproxy-sw.js
    └── flashproxy-ui.js
```

## API

```js
const proxy = new FlashProxyLite({
  strategyOrder: ['direct', 'corsproxy'],
  fallbackProxies: [
    { name: 'my-proxy', url: 'https://proxy.example/?url={url}' }
  ]
});

await proxy.init();
await proxy.navigate('https://example.com');
```

Useful methods:

```js
await proxy.navigate(url);
await proxy.back();
await proxy.forward();
proxy.canGoBack();
proxy.canGoForward();
proxy.addProxy(name, 'https://proxy.example/?url={url}');
proxy.removeProxy(name);
proxy.setStrategyOrder(['direct', 'corsproxy']);
await proxy.checkProxyHealth();
```

The full API and deployment guide is in **[tutorial.md](./tutorial.md)**.

## WebRTC

Lite does not pretend WebRTC is HTTP. `RTCPeerConnection`, ICE, STUN, TURN, SDP, and media negotiation remain native browser functionality. A static page cannot host a TURN/STUN service or server-side signaling backend.

## ⚠️ Public CORS endpoints

The example fallback endpoints are third-party services and may change, rate-limit, block destinations, or inspect traffic. For anything serious, configure an endpoint you control and trust.

## License / dependencies

Flash Proxy Lite is a browser-side project in this repository. Third-party endpoints and browser APIs have their own terms and limitations. Check the services you configure before using them.

---

<div align="center">
  <sub>Flash Proxy ⚡ — static does not mean magic, but it can still be useful.</sub>
</div>
