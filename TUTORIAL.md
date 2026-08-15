<h1 align="center">Flash Proxy Tutorial</h1>
<div align="center">
  <img src="logo.png" height="200" />
</div>

<div align="center">
  <img src="https://img.shields.io/github/issues/ItsMeh1/flashproxy?style=flat&color=orange" />
  <img src="https://img.shields.io/github/stars/ItsMeh1/flashproxy?style=flat&color=orange" />
</div>

<div align="center">
  [Back to README] (./README.md)
</div>

A Scramjet-like web interception proxy built on **Fastify** with the exact same dependency stack.


## Quick Start & Usage

```bash
npm install
npm start
```
Open http://localhost:3000 or whatever port you have setup.
You can edit & add anything in `/public`.

## API
The API is hosted at (src/api.js)
FlashProxy exposes fpAPI which works with any DOM element — not just iframes.
You can use the API like so:
```javascript
fpAPI.go(input, target)
```

Smart navigation. Auto-detects URLs vs search queries.

| Method | What it does | 1st Variable | 2nd Variable |
| :--- | :--- | :--- | :--- |
| `fpAPI.go(input, target)` | Uses the automatic smart-navigate feature to route either to a website or a search. Your site doesn't need any logic for that task. | The query | Where the page will be displayed (iframe) |
| `fpAPI.goRAW(input, target)` | Navigates to the raw URL. It will not use the automatic smart-navigate system, and will navigate to the given url. | The query | Where the page will be displayed (iframe) |

### FlashProxy API Example

```javascript
import { fpAPI } from '/fp-api.js';

const container = document.getElementById('my-div');

fpAPI.go('youtube.com', container);      // → https://youtube.com
fpAPI.go('how to code', container);      // → Google search
fpAPI.go('192.168.1.1', container);      // → https://192.168.1.1
fpAPI.goRAW('https://example.com', container); // → Directly to example.com
```

You can also use back, forward, and reload controls.

```javascript
fpAPI.back(container);
fpAPI.forward(container);
fpAPI.reload(container);
```

To check the current URL, you can do this.

```javascript
const url = fpAPI.current(container);
```

## Endpoints
| Path         | Purpose                          |
| :------------ | :-------------------------------- |
| `/fp/*`      | Proxy endpoint (was `/proxy`)    |
| `/bare/`     | Bare server for bare-mux clients |
| `/wisp/`     | Wisp WebSocket TCP tunnel        |
| `/sw.js`     | Service Worker                   |
| `/fp-api.js` | FlashProxy API module            |
