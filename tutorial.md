# FlashProxy Lite v2.0.0

> **A serverless, client-side web proxy with intelligent tiered fallback.**
>
> No servers. No deployment. Just open `index.html` in your browser.

---

## Table of Contents

1. [What Is This?](#what-is-this)
2. [How It Works](#how-it-works)
3. [Quick Start](#quick-start)
4. [Architecture & File Structure](#architecture--file-structure)
5. [The Exposable API](#the-exposable-api)
6. [Strategy Deep Dive](#strategy-deep-dive)
7. [Trade-offs: Serverless Proxy Pros & Cons](#trade-offs-serverless-proxy-pros--cons)
8. [Security Considerations](#security-considerations)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Usage](#advanced-usage)
11. [Configuration Reference](#configuration-reference)

---

## What Is This?

FlashProxy Lite is a **zero-server web proxy** that runs entirely in your browser. It takes a URL, fetches the content, rewrites all internal links so they route back through the proxy, and displays the site — all without a backend server.

The key innovation is its **tiered fallback system**:

1. **Direct Fetch** — Tries to fetch the site directly. Fastest. No external services.
2. **IFrame Bridge** — Loads the site in a sandboxed iframe. Works for sites that allow framing.
3. **Service Worker** — Uses a registered Service Worker to intercept and cache requests.
4. **CORS Proxy Fallback** — Only if all else fails, routes through a public CORS proxy.

This means **most of the time you never touch a third-party proxy**. You only fall back when the browser's security model (CORS) absolutely requires it.

---

## How It Works

```
User enters URL
       │
       ▼
┌─────────────────┐
│ 1. Direct Fetch │◄── Tries fetch() with mode: 'cors'
│    (Tier 1)     │    If target allows CORS → SUCCESS
└────────┬────────┘
         │ FAIL (CORS blocked)
         ▼
┌─────────────────┐
│ 2. IFrame Bridge│◄── Loads in sandboxed iframe
│    (Tier 2)     │    If readable → extract & rewrite HTML
└────────┬────────┘    If display-only → show iframe directly
         │ FAIL (X-Frame-Options or unreadable)
         ▼
┌─────────────────┐
│ 3. ServiceWorker│◄── SW attempts fetch + caching
│    (Tier 3)     │    Returns cached content if available
└────────┬────────┘
         │ FAIL (CORS blocked or SW not registered)
         ▼
┌─────────────────┐
│ 4. CORS Proxy   │◄── Tries corsproxy.io, allorigins, codetabs
│    (Tier 4)     │    Rotates through proxies until one works
└─────────────────┘
         │
         ▼
   Rewrite HTML (inject base tag + interception script)
         │
         ▼
   Display in iframe via srcdoc
```

### The Rewriting Engine

When content is successfully fetched, the rewriter:

1. **Injects a `<base>` tag** so relative URLs resolve correctly.
2. **Injects an interception script** that:
   - Captures all link clicks and `postMessage`s them to the parent
   - Intercepts `window.open`, `location.assign`, `history.pushState`
   - Wraps `fetch()` and `XMLHttpRequest` to notify parent of resource loads
   - Intercepts form submissions (GET only; POST warns user)
3. **Rewrites absolute URLs** in `href`, `src`, `srcset`, `action`, CSS `url()`, and meta refresh.
4. **Optionally blocks scripts** and strips cookies.

---

## Quick Start

### Option A: Open Directly

1. Download all files to a folder.
2. Open `index.html` in any modern browser.
3. Enter a URL and hit **GO**.

### Option B: Programmatic API

```html
<script src="./flashproxy-core.js"></script>
<script src="./flashproxy-strategies.js"></script>
<script src="./flashproxy-rewriter.js"></script>
<script>
  (async () => {
    const proxy = new FlashProxyLite({
      strategyOrder: ['direct', 'corsproxy'],
      debug: true
    });
    await proxy.init();

    proxy.addEventListener('load', e => {
      console.log('Loaded via', e.detail.strategy);
      console.log('HTML length:', e.detail.size);
    });

    proxy.addEventListener('error', e => {
      console.error('Failed:', e.detail.error);
    });

    await proxy.navigate('https://example.com');
  })();
</script>
```

### Option C: URL Parameter

```
file:///path/to/index.html?url=https://example.com
```

---

## Architecture & File Structure

```
flashproxy-lite/
├── index.html              # UI shell — loads all scripts
├── flashproxy-core.js      # Core engine, API, history, events
├── flashproxy-strategies.js # All fetch strategies (4 tiers)
├── flashproxy-rewriter.js  # HTML/CSS/JS rewriter
├── flashproxy-ui.js        # Browser UI controller
├── flashproxy-sw.js        # Service Worker (caching + routing)
└── tutorial.md             # This file
```

### Why 5 Scripts?

| File | Responsibility | Can Use Standalone? |
|------|---------------|---------------------|
| `core.js` | State management, history, event system, config | Yes (with limited functionality) |
| `strategies.js` | All network strategies | No (requires core) |
| `rewriter.js` | Content transformation | Yes (pass any HTML string) |
| `ui.js` | DOM bindings, keyboard shortcuts, settings panel | No (requires core) |
| `sw.js` | Service Worker for caching | No (browser loads automatically) |

---

## The Exposable API

### Constructor

```javascript
const proxy = new FlashProxyLite(options);
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strategyOrder` | `string[]` | `['direct','iframe','serviceworker','corsproxy']` | Order of fallback strategies |
| `fallbackProxies` | `object[]` | 3 public proxies | CORS proxies to use in Tier 4 |
| `customProxies` | `object[]` | `[]` | Your own CORS proxy endpoints |
| `rewriteHtml` | `boolean` | `true` | Enable HTML rewriting |
| `blockScripts` | `boolean` | `false` | Strip all `<script>` tags |
| `stripCookies` | `boolean` | `true` | Remove cookie meta tags |
| `timeout` | `number` | `15000` | Per-strategy timeout in ms |
| `maxRetries` | `number` | `2` | Retry attempts per strategy |
| `cacheEnabled` | `boolean` | `true` | Cache successful responses |
| `userAgent` | `string` | `navigator.userAgent` | User-Agent header |
| `debug` | `boolean` | `false` | Console logging |

### Methods

#### `async init()`
Initializes the engine. Registers Service Worker if configured. Must be called before `navigate()`.

```javascript
await proxy.init();
```

#### `async navigate(url, options)`
Navigates to a URL through the proxy chain.

```javascript
await proxy.navigate('https://example.com');
await proxy.navigate('https://example.com', { addHistory: false });
```

**Returns:** `Promise<object>` — The strategy result with `type`, `content`, `strategy`, etc.

#### `back()` / `forward()`
History navigation.

```javascript
await proxy.back();
await proxy.forward();
```

#### `canGoBack()` / `canGoForward()`
Boolean checks.

```javascript
if (proxy.canGoBack()) await proxy.back();
```

#### `addProxy(name, urlTemplate)`
Add a custom CORS proxy. Use `{url}` as the target placeholder.

```javascript
proxy.addProxy('myproxy', 'https://proxy.example.com/?url={url}');
```

#### `removeProxy(name)`
Remove a custom proxy.

#### `setStrategyOrder(order)`
Change strategy priority at runtime.

```javascript
proxy.setStrategyOrder(['direct', 'corsproxy']); // Skip iframe and SW
```

#### `async checkProxyHealth()`
Pings all configured proxies and reports status.

```javascript
const results = await proxy.checkProxyHealth();
// [{ name: 'corsproxy.io', status: 'online', latency: 245 }, ...]
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `proxy.rawHtml` | `string \| null` | The raw fetched HTML |
| `proxy.rewrittenHtml` | `string \| null` | The rewritten HTML (with injected scripts) |
| `proxy.currentUrl` | `string \| null` | The currently loaded URL |
| `proxy.currentStrategy` | `string \| null` | Which strategy succeeded |
| `proxy.isLoading` | `boolean` | Is a navigation in progress? |
| `proxy.history` | `string[]` | Full navigation history |

### Events

All events are standard `CustomEvent` instances. Access detail via `event.detail`.

| Event | Fired When | Detail Fields |
|-------|-----------|---------------|
| `ready` | Engine initialized | `{ version }` |
| `navigate` | Navigation starts | `{ url, options }` |
| `strategy-attempt` | Trying a strategy | `{ strategy, url }` |
| `strategy-fail` | Strategy failed | `{ strategy, url, error }` |
| `proxy-fallback` | Fell back to CORS proxy | `{ proxy, url }` |
| `load` | Page loaded successfully | `{ url, strategy, proxy, contentType, size }` |
| `error` | All strategies failed | `{ url, error, phase }` |
| `health-check` | Health check complete | `{ results }` |
| `config-change` | Config updated | `{ key, value }` |
| `proxy-added` | Proxy added | `{ name, url }` |
| `proxy-removed` | Proxy removed | `{ name }` |

```javascript
proxy.addEventListener('load', e => {
  console.log('Loaded', e.detail.url, 'via', e.detail.strategy);
});

proxy.addEventListener('proxy-fallback', e => {
  console.warn('Had to use fallback proxy:', e.detail.proxy);
});
```

### The UI Controller

```javascript
const ui = new FlashProxyUI(proxyInstance, containerElement);
ui.mount();
```

The UI handles:
- URL bar with protocol indicator
- Back/forward/reload buttons
- Strategy status badge (click for health check)
- Settings panel (proxy selection, script blocking, debug mode)
- Raw/Rendered toggle (`{}` button)
- Loading spinner with strategy progress
- Error screen with retry/back
- Keyboard shortcuts (Ctrl+L, Ctrl+R, Ctrl+Shift+Arrows)
- Proxy health check dashboard

---

## Strategy Deep Dive

### Tier 1: Direct Fetch

**What it does:** Performs a standard `fetch(url, {mode: 'cors'})`.

**When it works:** When the target site sends `Access-Control-Allow-Origin` headers. This is common for APIs and some static sites, but **rare for full HTML pages** from major websites.

**Pros:** Zero latency, zero external dependency, maximum privacy.

**Cons:** Fails for 90%+ of websites because they don't send CORS headers on HTML documents.

**Why include it?** Because when it works, it's instant. And for API exploration, it's the only strategy you need.

---

### Tier 2: IFrame Bridge

**What it does:** Creates a sandboxed `<iframe>` and sets `src` to the target URL.

**When it works:** When the target site does NOT send `X-Frame-Options: DENY` or a restrictive `Content-Security-Policy`.

**Two outcomes:**
1. **Readable iframe:** If the site sends CORS headers on the document, we extract the HTML and rewrite it.
2. **Display-only iframe:** If cross-origin, we can't read the HTML. The iframe is displayed directly. Links are NOT intercepted. This is a degraded mode.

**Pros:** No external proxy needed. Works for sites that allow framing.

**Cons:** Most major sites block framing. Cross-origin iframes can't be rewritten or intercepted.

---

### Tier 3: Service Worker

**What it does:** Registers a Service Worker that intercepts `fetch` events. The SW tries direct fetch and caches successful responses.

**When it works:** The SW can only succeed where direct fetch succeeds — it's still subject to CORS. The value is in **caching** and **offline replay**.

**Pros:** Caches pages for offline use. Can intercept resource requests within the proxied page.

**Cons:** Cannot bypass CORS. Requires HTTPS or localhost. Some browsers restrict SW in private mode.

---

### Tier 4: CORS Proxy Fallback

**What it does:** Iterates through configured public CORS proxies, prepending the target URL to the proxy endpoint.

**Built-in proxies:**
- `corsproxy.io`
- `allorigins.win`
- `codetabs.com`

**Rotation logic:** Proxies are sorted by health status (online first) and latency. If one fails, the next is tried automatically.

**Pros:** Works for virtually any site. Multiple fallbacks means high reliability.

**Cons:** Adds latency. Public proxies can be slow or rate-limited. The proxy operator CAN read your traffic.

---

### Tier X: No-CORS Blob (Experimental)

**What it does:** `fetch(url, {mode: 'no-cors'})` then attempts to create a Blob URL.

**Status:** Limited usefulness. Opaque responses can't be read as text. Included for completeness but not in the default strategy order.

---

## Trade-offs: Serverless Proxy Pros & Cons

| Aspect | ✅ Pros | ❌ Cons |
|--------|---------|---------|
| **Privacy** | No server logs. Requests come from YOUR IP directly. No third party sees your traffic unless CORS proxy fallback is used. | Your real IP is visible to target sites. Public CORS proxies CAN read your traffic when fallback is triggered. |
| **Speed** | Direct fetch is instant (sub-100ms). No proxy hop when CORS allows it. | Proxy fallback adds 200ms–2s latency depending on the public proxy's location and load. |
| **Reliability** | Multiple fallback proxies. If one is down, another is tried. Service Worker provides offline caching. | Public proxies go down, rate-limit, or block sites. No guarantee of 100% uptime. |
| **Security** | No middleman server you don't control (when direct/iframe works). No SSL termination by a third party. | Public CORS proxies terminate SSL and can modify content. XSS in proxied pages is possible if scripts aren't blocked. |
| **Setup** | Zero deployment. Open `index.html` and go. Works from `file://` protocol. | Service Worker requires HTTPS or localhost. Some features disabled in `file://` on certain browsers. |
| **Functionality** | Full HTML rewriting. Link interception. Form handling. History management. | POST forms cannot be proxied client-side (requires a server). Complex SPAs (React/Vue) often break because dynamic `fetch()` calls aren't rewritten. |
| **Cost** | Completely free. No hosting fees. No bandwidth costs to you. | Public proxies are donated resources. Heavy use may get you rate-limited or IP-banned. |
| **Censorship Resistance** | Hard to block — it's just a static HTML file. Can be saved locally and run offline. | Public CORS proxy domains can be blocked by firewalls. Direct fetch reveals the true destination to network observers. |
| **Cookie/Auth** | Cookies are stripped by default. No persistent sessions leak between sites. | You can't stay logged into proxied sites. Session cookies don't persist across navigations. |
| **Content Modification** | Full control over HTML/CSS/JS. Can block ads, scripts, trackers. | Rewriting can break sites. Some sites detect proxy rewriting and refuse to render. |

### When to Use a Serverless Proxy

**✅ Good for:**
- Browsing static/read-only sites
- Accessing content behind restrictive firewalls
- Quick testing of CORS-blocked APIs
- Privacy-conscious users who don't want to trust a single proxy operator
- Offline-first archiving (with Service Worker)

**❌ Bad for:**
- Logging into accounts (cookies don't persist)
- POSTing forms or uploading files
- Sites with heavy client-side JavaScript (SPAs)
- High-traffic or automated scraping
- Sites that actively block proxies

---

## Security Considerations

### 1. CORS Proxy Trust

When the system falls back to a public CORS proxy, that proxy:
- Sees the full URL you requested
- Can read the response content
- Could modify the response before sending it to you
- Logs your IP address and request time

**Mitigation:** Use direct fetch and iframe strategies when possible. Add your own trusted proxy via `addProxy()`.

### 2. XSS in Proxied Content

The rewriter injects a `<script>` into every page to intercept navigation. If the proxied site has a Content Security Policy (CSP) that blocks inline scripts, the interceptor won't run and links will navigate away from the proxy.

**Mitigation:** Enable "Block JavaScript" in settings for untrusted sites.

### 3. SSL/TLS

When using a CORS proxy, SSL is terminated at the proxy. The proxy sees plaintext. The connection between you and the proxy is HTTPS, and the proxy to the target is HTTPS — but the proxy itself is a man-in-the-middle.

**Mitigation:** Don't use public proxies for sensitive data (banking, email, etc.).

### 4. LocalStorage

Settings are stored in `localStorage` under the key `fp-settings-v2`. This includes proxy URLs but NOT browsing history.

### 5. Service Worker Scope

The Service Worker operates on the same origin as `index.html`. It can intercept all requests to that origin. It does NOT intercept cross-origin requests unless explicitly messaged by the client.

---

## Troubleshooting

### "All strategies failed"

**Cause:** The site blocks CORS, blocks framing, and all public proxies are down or blocked.

**Solutions:**
1. Check your internet connection.
2. Try a different URL.
3. Add a custom proxy in Settings.
4. Check if you're behind a corporate firewall that blocks public proxy domains.

### "Strategy: iframe — Display-only mode"

**Cause:** The site loaded in an iframe but is cross-origin. We can't read or rewrite the HTML.

**Solutions:**
1. This is expected for most sites. The site will display but links won't be intercepted.
2. Try a different URL that allows framing.
3. The system will try CORS proxy next if iframe is in your strategy order.

### "Service Worker registration failed"

**Cause:** You're opening the file via `file://` protocol, or the browser doesn't support SW.

**Solutions:**
1. Serve via a local HTTP server: `python -m http.server 8000`
2. Use `npx serve .`
3. Some browsers disable SW in private/incognito mode.

### "Proxy returns 429 Too Many Requests"

**Cause:** You've hit the rate limit of a public CORS proxy.

**Solutions:**
1. Wait a few minutes.
2. Switch to a different proxy in Settings.
3. Add your own custom proxy.

### "Site looks broken / CSS not loading"

**Cause:** The rewriter doesn't proxy resource URLs (images, CSS) by default. The base tag helps, but some sites use absolute URLs that bypass the proxy.

**Solutions:**
1. This is a known limitation of client-side proxies.
2. Enable "Block JavaScript" — some sites load CSS via JS.
3. Use a full server-side proxy for complete resource rewriting.

### "Can't log in / form submission fails"

**Cause:** POST forms require a server to relay the request. Client-side JavaScript cannot POST cross-origin without CORS.

**Solutions:**
1. This is by design — a limitation of ALL serverless proxies.
2. Use a server-side proxy for interactive sites requiring login.

---

## Advanced Usage

### Custom Proxy with Authentication

```javascript
proxy.addProxy('auth-proxy', 'https://user:pass@proxy.example.com/?target={url}');
```

### Headless Mode (No UI)

```javascript
const proxy = new FlashProxyLite({ strategyOrder: ['direct', 'corsproxy'] });
await proxy.init();

const result = await proxy.navigate('https://api.example.com/data');
console.log(result.content); // Raw JSON/text
```

### Offline-First Archiving

```javascript
// Load a page, it's cached by the Service Worker
await proxy.navigate('https://example.com/article-1');
await proxy.navigate('https://example.com/article-2');

// Later, offline:
await proxy.navigate('https://example.com/article-1'); // Served from SW cache
```

### Health Monitoring Dashboard

```javascript
setInterval(async () => {
  const health = await proxy.checkProxyHealth();
  const offline = health.filter(h => h.status === 'offline');
  if (offline.length > 0) {
    console.warn('Offline proxies:', offline.map(o => o.name).join(', '));
  }
}, 60000);
```

### Event-Driven Logging

```javascript
const events = ['navigate', 'strategy-attempt', 'strategy-fail', 'proxy-fallback', 'load', 'error'];
events.forEach(type => {
  proxy.addEventListener(type, e => {
    console.log(`[${type}]`, e.detail);
  });
});
```

---

## Configuration Reference

### Complete Options Object

```javascript
{
  // Strategy priority (left = tried first)
  strategyOrder: ['direct', 'iframe', 'serviceworker', 'corsproxy'],

  // Built-in public proxies (health tracked automatically)
  fallbackProxies: [
    {
      name: 'corsproxy.io',
      url: 'https://corsproxy.io/?url={url}',
      health: null,   // 'online' | 'offline' | 'degraded' | null
      latency: null   // milliseconds
    },
    {
      name: 'allorigins.win',
      url: 'https://api.allorigins.win/raw?url={url}',
      health: null,
      latency: null
    },
    {
      name: 'codetabs.com',
      url: 'https://api.codetabs.com/v1/proxy?quest={url}',
      health: null,
      latency: null
    }
  ],

  // Your own proxies
  customProxies: [],

  // Content processing
  rewriteHtml: true,    // Inject base tag + interception script
  blockScripts: false,  // Strip all <script> tags
  stripCookies: true,   // Remove Set-Cookie meta tags

  // Network
  timeout: 15000,       // ms per strategy attempt
  maxRetries: 2,        // retries per strategy before giving up
  cacheEnabled: true,   // Cache in Map + Service Worker

  // Headers
  userAgent: navigator.userAgent,

  // IFrame
  iframeSandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals',

  // Dev
  debug: false
}
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + L` | Focus URL bar |
| `Ctrl + R` | Reload current page |
| `Ctrl + Shift + ←` | Go back |
| `Ctrl + Shift + →` | Go forward |
| `Enter` (in URL bar) | Navigate |

---

## License & Attribution

FlashProxy Lite is provided as-is for educational and personal use. Public CORS proxies are third-party services with their own terms of use. Respect rate limits. Do not use for illegal activities.

---

*End of Tutorial. Everything you need is in this file.*
