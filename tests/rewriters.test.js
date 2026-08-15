import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyUrl, proxyWebSocketUrl, normalizeTarget, isPassthroughUrl } from '../src/url.js';
import { rewriteCss } from '../rewriters/css.js';
import { rewriteHtml } from '../rewriters/html.js';
import { rewriteJs } from '../rewriters/js/rewriter.js';
import { buildRuntime } from '../rewriters/runtime.js';

const page = 'https://example.com/dir/index.html';

test('proxyUrl resolves absolute, root-relative, relative, and query URLs', () => {
  assert.equal(proxyUrl('https://cdn.example/a.js', page), '/fp/https://cdn.example/a.js');
  assert.equal(proxyUrl('/img/logo.png', page), '/fp/https://example.com/img/logo.png');
  assert.equal(proxyUrl('../app.js', page), '/fp/https://example.com/app.js');
  assert.equal(proxyUrl('?v=2', page), '/fp/https://example.com/dir/index.html?v=2');
  assert.equal(proxyUrl('#section', page), '#section');
  assert.equal(proxyUrl('data:text/plain,hi', page), 'data:text/plain,hi');
  assert.equal(proxyUrl('/fp/https://example.com/already', page), '/fp/https://example.com/already');
});

test('URL helpers reject unsupported schemes without destroying them', () => {
  assert.equal(normalizeTarget('javascript:alert(1)', page), null);
  assert.equal(isPassthroughUrl('data:text/plain,hello'), true);
  assert.equal(isPassthroughUrl('#top'), true);
  assert.equal(isPassthroughUrl('/relative'), false);
});

test('websocket URLs resolve against the page URL', () => {
  assert.equal(proxyWebSocketUrl('/socket', page), '/wisp/ws://example.com/socket');
  assert.equal(proxyWebSocketUrl('wss://chat.example/socket', page), '/wisp/wss://chat.example/socket');
  assert.equal(proxyWebSocketUrl('https://example.com/socket', page), 'https://example.com/socket');
});

test('CSS rewrites url() and @import without touching data URLs', () => {
  const css = `.hero{background:url('../hero.png')} @import "./theme.css"; .x{src:url(data:image/png;base64,abc)}`;
  const out = rewriteCss(css, page);
  assert.match(out, /\/fp\/https:\/\/example\.com\/hero\.png/);
  assert.match(out, /\/fp\/https:\/\/example\.com\/dir\/theme\.css/);
  assert.match(out, /url\(data:image\/png;base64,abc\)/);
});

test('HTML rewrites common URL attributes, srcset, ping, style and meta refresh', async () => {
  const html = '<!doctype html><html><head><meta http-equiv="refresh" content="0; url=/next"><style>.x{background:url(./bg.png)}</style></head><body><a href="/next" ping="/analytics https://log.example/ping">next</a><img src="img/a.png" srcset="small.png 1x, /large.png 2x"><form action="/login"><button>go</button></form></body></html>';
  const out = await rewriteHtml(html, page);
  assert.match(out, /href="\/fp\/https:\/\/example\.com\/next"/);
  assert.match(out, /src="\/fp\/https:\/\/example\.com\/dir\/img\/a\.png"/);
  assert.match(out, /srcset="\/fp\/https:\/\/example\.com\/dir\/small\.png 1x, \/fp\/https:\/\/example\.com\/large\.png 2x"/);
  assert.match(out, /data-flashproxy-runtime/);
  assert.match(out, /\/fp\/https:\/\/example\.com\/dir\/bg\.png/);
  assert.doesNotMatch(out, /integrity=/i);
});

test('JavaScript fallback/API leaves data URLs and rewrites network-looking literals', async () => {
  const out = await rewriteJs('fetch("/api/data"); const x="https://cdn.example/a.js"; const y="data:text/plain,ok";', page);
  assert.match(out, /\/fp\/https:\/\/example\.com\/api\/data/);
  assert.match(out, /\/fp\/https:\/\/cdn\.example\/a\.js/);
  assert.match(out, /data:text\/plain,ok/);
});

test('runtime contains the browser interception layer', () => {
  const runtime = buildRuntime(page);
  assert.match(runtime, /FLASH_RUNTIME_INSTALLED/);
  assert.match(runtime, /window\.fetch/);
  assert.match(runtime, /XMLHttpRequest/);
  assert.match(runtime, /WebSocket/);
  assert.match(runtime, /EventSource/);
  assert.match(runtime, /Worker/);
  assert.match(runtime, /pushState/);
});
