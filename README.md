<p align="center">
  <img src="logo.png" alt="Logo" width="400">
</p>

# FlashProxy

A Scramjet-like web interception proxy built from scratch.

## Run

```bash
npm install
npm start
```
Open http://localhost:3000.

## API
fp.go("youtube.com")      // URL
fp.go("how to code")      // Search query
fp.go("192.168.1.1")      // IP address
fp.goRaw("https://...")   // Bypass detection

It automatically formats searches, links, everything. All of it for you automatically.

## Architecture
Server: Express + Wisp WebSocket tunneling
Cookie Jar: Per-domain cookie storage and forwarding
Rewriters: HTML/CSS/JS URL rewriting + runtime injection
SW: Request interception for same-origin sandboxing


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

Made with ❤️ by @ItsMeh1
Made with the help of Kimi K2.6
