# ⚡ Flash Proxy Lite — Complete Tutorial

<div align="center"><img src="./logo.png" alt="Flash Proxy" width="180"></div>

This is the guide for the **static** Flash Proxy build. Follow it from top to bottom the first time.

## 1. Understand the important limitation first

Flash Proxy Lite runs in the browser. That means the browser's security model still applies.

A static page **cannot** do this by itself:

```text
Browser → static HTML/JS → fetch any website → return private response
```

because `fetch()` is subject to CORS.

So Lite has three realistic modes:

1. **Direct** — works when the destination permits browser access.
2. **External CORS endpoint** — a remote server you configure performs the cross-origin fetch.
3. **Iframe display-only** — useful when a site allows framing, but the parent cannot inspect or rewrite a cross-origin document.

A Service Worker can cache the static app and same-origin resources, but it does **not** remove CORS.

---

## 2. Get the files

You do not need Node.js or npm to deploy the static application.

Keep this structure intact:

```text
fp-lite/
├── index.html
├── style.css
├── logo.png
├── flashproxy-sw.js
├── README.md
├── tutorial.md
└── src/
    ├── flashproxy-core.js
    ├── flashproxy-rewriter.js
    ├── flashproxy-strategies.js
    ├── flashproxy-sw.js
    └── flashproxy-ui.js
```

Do not move the files inside `src/` unless you also update every script path and Service Worker path.

---

## 3. Test the UI locally

You can double-click `index.html`, but `file://` has extra browser restrictions. A local static server is better for testing.

If Python is installed:

```bash
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080/
```

This Python server is **only serving files**. It is not a Flash Proxy server and it does not proxy target websites.

You can also deploy the folder to GitHub Pages, Netlify, Cloudflare Pages, or another static host.

---

## 4. Check that the files load

Open browser DevTools → Console.

The page should load without errors such as:

```text
FlashProxyLite is not defined
FlashProxyStrategies is not defined
FlashProxyRewriter is not defined
Failed to load resource
```

The script order in `index.html` matters:

```html
<script src="./src/flashproxy-core.js"></script>
<script src="./src/flashproxy-strategies.js"></script>
<script src="./src/flashproxy-rewriter.js"></script>
<script src="./src/flashproxy-ui.js"></script>
```

Core loads first, then strategies/rewriting, then the UI.

---

## 5. Try a CORS-friendly target

Start with a target that explicitly allows browser requests.

Enter a URL such as:

```text
https://example.com/
```

If the destination does not allow CORS, the direct strategy will fail. **That does not mean the code is broken.** It means the browser correctly refused to expose the response to JavaScript.

---

## 6. Add a remote CORS endpoint

To read arbitrary cross-origin HTML, you need a server somewhere to perform the cross-origin request.

The endpoint template must contain:

```text
{url}
```

For example:

```text
https://your-proxy.example/?url={url}
```

In the Lite UI, open Settings and enter a name and endpoint template.

Or configure it directly:

```js
const proxy = new FlashProxyLite({
  fallbackProxies: [
    {
      name: 'My CORS endpoint',
      url: 'https://your-proxy.example/?url={url}'
    }
  ],
  strategyOrder: ['direct', 'corsproxy']
});
```

**Only use endpoints you trust and are allowed to use.** The operator can potentially see the URLs and content passing through it.

---

## 7. Initialize the engine

```js
const proxy = new FlashProxyLite({
  strategyOrder: ['direct', 'corsproxy']
});

await proxy.init();
```

Initialization discovers the browser-side strategy and rewriter modules. Service Worker registration is disabled by default because it is optional and cannot bypass CORS.

To enable the cache layer on HTTPS/localhost:

```js
const proxy = new FlashProxyLite({
  enableServiceWorker: true,
  strategyOrder: ['direct', 'corsproxy']
});
await proxy.init();
```

The Service Worker is a cache/offline layer, **not a CORS bypass**.

---

## 8. Navigate

```js
await proxy.navigate('https://example.com/');
```

You can also use a hostname:

```js
await proxy.navigate('example.com');
```

Lite normalizes it to HTTPS.

Only `http:` and `https:` URLs are accepted as navigation targets.

---

## 9. Understand the result

A successful readable response looks roughly like:

```js
{
  type: 'text',
  content: '<!doctype html>…',
  contentType: 'text/html',
  url: 'https://example.com/',
  strategy: 'direct'
}
```

If an external endpoint was used:

```js
{
  strategy: 'corsproxy',
  proxy: 'My CORS endpoint'
}
```

An iframe result is different:

```js
{
  type: 'iframe',
  iframeElement: HTMLIFrameElement,
  displayOnly: true
}
```

`displayOnly: true` means JavaScript in the parent cannot inspect the cross-origin document.

---

## 10. What the rewriter does

When Flash can actually read the HTML, `FlashProxyRewriter` uses the browser's `DOMParser` rather than trying to parse arbitrary HTML with a pile of regular expressions.

It handles important things such as:

- `href`
- `src`
- `action`
- `formaction`
- `poster`
- `cite`
- `background`
- `data`
- `manifest`
- `usemap`
- `srcset`
- `imagesrcset`
- inline `style`
- `<style>` CSS
- stylesheet links
- meta refresh
- inline script removal when `blockScripts` is enabled

Relative URLs are resolved against the document's effective `<base>` URL.

The runtime also handles basic parent navigation messages for links, GET forms, `window.open()`, and History API calls.

---

## 11. Why resources are not blindly rewritten to `/fp/`

The server version can create a URL such as:

```text
/fp/https://example.com/app.js
```

because its server actually receives that request and fetches the target.

A static page cannot do the same thing merely by creating that URL. There is no Flash server waiting at `/fp/`.

Therefore Lite keeps ordinary resolved resource URLs and relies on browser permissions or an externally hosted endpoint.

This is one of the biggest differences between Flash Proxy and Flash Proxy Lite.

---

## 12. History

The core keeps its own navigation history:

```js
await proxy.navigate('https://example.com');
await proxy.navigate('https://example.org');

console.log(proxy.canGoBack());
await proxy.back();
await proxy.forward();
```

You can inspect it with:

```js
console.log(proxy.history);
```

Reload without adding another history entry:

```js
await proxy.navigate(proxy.currentUrl, { addHistory: false });
```

---

## 13. Change strategy order

```js
proxy.setStrategyOrder(['direct', 'corsproxy']);
```

Or use the iframe fallback explicitly:

```js
proxy.setStrategyOrder(['direct', 'iframe', 'corsproxy']);
```

Remember that iframe mode is **display-only** for cross-origin pages. It is not a DOM-access workaround.

---

## 14. Add and remove endpoints

```js
proxy.addProxy(
  'My endpoint',
  'https://proxy.example/?url={url}'
);

proxy.removeProxy('My endpoint');
```

The template must include `{url}`.

Lite URL-encodes the target before inserting it.

---

## 15. Check endpoint health

```js
const results = await proxy.checkProxyHealth();
console.table(results);
```

Possible results include:

```text
online
```

```text
degraded
```

```text
offline
```

A health check only tells you that the endpoint responded to the test request. It does not prove that every target website will work through it.

---

## 16. Service Worker setup

The root file:

```text
flashproxy-sw.js
```

loads the worker implementation from:

```text
src/flashproxy-sw.js
```

Keeping the entry point at the site root matters because a Service Worker's default scope is based on its URL.

Service Workers require a secure context such as:

```text
https://your-site.example/
```

or:

```text
http://localhost:8080/
```

They generally will not work from:

```text
file://…
```

Again: the worker caches requests; it does not bypass CORS.

---

## 17. WebSockets and WebRTC

Lite cannot host the Wisp/Bare transport server used by the full Flash Proxy project.

A static page can still use native browser WebSockets when the target/server permits them, but it cannot turn an arbitrary WebSocket server into a same-origin proxy by itself.

WebRTC is also native:

```text
RTCPeerConnection
ICE
STUN
TURN
SDP
```

Those are not HTTP resources and should not be rewritten into `/fp/` URLs.

A static Lite deployment also does not provide a signaling server or TURN server.

---

## 18. POST forms and authentication

A browser-only implementation cannot safely turn arbitrary cross-origin POST requests into a server-side proxy request.

Similarly, stripping cookies does not create a logged-in server-side session.

Expect many authenticated applications to work poorly or not at all unless the application itself permits the required browser requests.

---

## 19. Troubleshooting

### Blank iframe

The target may block framing with `X-Frame-Options` or CSP. A static page cannot override those headers.

### Direct strategy says CORS

That is expected for a target that does not grant your static site's origin access.

Configure a CORS-capable endpoint if you need readable HTML.

### CORS endpoint fails

Check:

- endpoint URL contains `{url}`;
- endpoint is reachable;
- endpoint returns CORS headers allowing your Lite site's origin;
- endpoint accepts the target URL format;
- endpoint is not rate-limited;
- browser console for the exact CORS error.

### Service Worker does not register

Use HTTPS or localhost and confirm `flashproxy-sw.js` exists at the site's root.

### `FlashProxyLite is not defined`

Check the script paths in `index.html` and make sure all files were uploaded.

### CSS/UI is missing

Make sure this file exists beside `index.html`:

```text
style.css
```

and that `index.html` contains:

```html
<link rel="stylesheet" href="./style.css">
```

### A site loads but links behave strangely

The runtime can intercept common link/history cases, but arbitrary application code, sandboxing, CSP, cross-origin frames, and browser security policies can still prevent full compatibility.

---

## 20. Test checklist

Before calling a change finished, test:

- [ ] `index.html` loads without console errors.
- [ ] Logo displays.
- [ ] URL bar works.
- [ ] Empty URL does not crash the UI.
- [ ] Direct navigation works for a CORS-friendly target.
- [ ] CORS failure produces a useful error/fallback.
- [ ] A configured external endpoint can be selected.
- [ ] Back/Forward work after multiple navigations.
- [ ] Reload does not create duplicate history entries.
- [ ] Relative HTML URLs resolve correctly.
- [ ] CSS `url()` values resolve correctly.
- [ ] `srcset` works.
- [ ] Meta refresh is handled.
- [ ] Script blocking removes scripts when enabled.
- [ ] Mobile layout remains usable.
- [ ] Service Worker registration only happens when explicitly enabled.
- [ ] Service Worker works from HTTPS/localhost.
- [ ] Cross-origin iframe behavior is correctly treated as display-only.
- [ ] WebRTC is not incorrectly treated as an HTTP proxy problem.

---

## 21. The honest comparison

```text
Flash Proxy
───────────
Browser → Flash server → target
                 │
                 └── can actually fetch/rewrite responses

Flash Proxy Lite
────────────────
Browser → static files
             │
             ├── direct browser request (CORS permitting)
             │
             └── external CORS endpoint (when configured)
```

Lite is not meant to fake the second half of that first diagram. It is meant to push as much of Flash's browser-side functionality as possible into a deploy-anywhere static package while respecting what browsers actually allow.

That makes the project smaller, easier to deploy, and useful for CORS-friendly sites and externally hosted proxy endpoints—without pretending that a static HTML file can become a server.

---

<div align="center">
  <strong>⚡ Flash Proxy Lite</strong><br>
  <sub>Static. Honest. Browser-native.</sub>
</div>
