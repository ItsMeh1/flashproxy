import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyUrl } from '../src/url.js';
import { rewriteCss } from '../rewriters/css.js';
import { rewriteHtml } from '../rewriters/html.js';

const page = 'https://example.com/dir/index.html';

 test('proxyUrl resolves absolute, root-relative, and relative URLs', () => {
  assert.equal(proxyUrl('https://cdn.example/a.js', page), '/fp/https://cdn.example/a.js');
  assert.equal(proxyUrl('/img/logo.png', page), '/fp/https://example.com/img/logo.png');
  assert.equal(proxyUrl('../app.js', page), '/fp/https://example.com/app.js');
  assert.equal(proxyUrl('#section', page), '#section');
  assert.equal(proxyUrl('data:text/plain,hi', page), 'data:text/plain,hi');
});

test('CSS rewrites url() and @import without touching data URLs', () => {
  const css = `.hero{background:url('../hero.png')} @import "./theme.css"; .x{src:url(data:image/png;base64,abc)}`;
  const out = rewriteCss(css, page);
  assert.match(out, /\/fp\/https:\/\/example\.com\/hero\.png/);
  assert.match(out, /\/fp\/https:\/\/example\.com\/dir\/theme\.css/);
  assert.match(out, /url\(data:image\/png;base64,abc\)/);
});

test('HTML rewrites common URL attributes and injects runtime', async () => {
  const html = '<!doctype html><html><head><title>x</title></head><body><a href="/next">next</a><img src="img/a.png"><form action="/login"><button>go</button></form></body></html>';
  const out = await rewriteHtml(html, page);
  assert.match(out, /href="\/fp\/https:\/\/example\.com\/next"/);
  assert.match(out, /src="\/fp\/https:\/\/example\.com\/dir\/img\/a\.png"/);
  assert.match(out, /action="\/fp\/https:\/\/example\.com\/login"/);
  assert.match(out, /data-flashproxy-runtime/);
});
