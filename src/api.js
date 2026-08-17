/** Flash Proxy browser API. Navigation state is isolated per target container. */

import { proxyUrl } from './url.js';

const sessions = new WeakMap();
const bookmarks = new Map();
const historyLog = [];

function assertTarget(target) {
  if (!target || typeof target !== 'object' || typeof target.querySelector !== 'function') throw new TypeError('Flash Proxy target must be a DOM element');
  return target;
}
function getSession(target) {
  assertTarget(target);
  if (!sessions.has(target)) sessions.set(target, { history: [], index: -1 });
  return sessions.get(target);
}
function getFrame(target) {
  assertTarget(target);
  if (target.tagName === 'IFRAME') return target;
  let iframe = target.querySelector('iframe[data-fp-frame]');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.setAttribute('data-fp-frame', 'true');
    iframe.title = 'Flash Proxy browser';
    iframe.referrerPolicy = 'no-referrer';
    iframe.loading = 'eager';
    iframe.allow = 'camera; microphone; autoplay; fullscreen; display-capture; gamepad; clipboard-read; clipboard-write';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';
    iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
    target.replaceChildren(iframe);
  }
  return iframe;
}
function resolveInput(input) {
  const value = String(input ?? '').trim();
  if (!value) return 'https://example.com/';
  if (/^(?:https?|wss?|ftp):\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (/^(?:localhost(?::\d+)?|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?:[/:?#].*)?$/i.test(value)) return `https://${value}`;
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/:?#].*)?$/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
function navigateFrame(target, url) {
  const frame = getFrame(target);
  frame.src = proxyUrl(url, location.href);
  return frame;
}
function recordHistory(session, url) {
  session.history = session.history.slice(0, session.index + 1);
  session.history.push(url);
  session.index = session.history.length - 1;
}

export const fpAPI = {
  resolveInput,
  go(input, target) { return this._navigate(resolveInput(input), target); },
  goRAW(url, target) {
    const value = String(url ?? '').trim();
    if (!/^https?:\/\//i.test(value)) throw new TypeError('goRAW() requires an absolute HTTP(S) URL');
    return this._navigate(value, target);
  },
  back(target) {
    const session = getSession(target);
    if (session.index <= 0) return null;
    const url = session.history[--session.index];
    navigateFrame(target, url);
    return url;
  },
  forward(target) {
    const session = getSession(target);
    if (session.index >= session.history.length - 1) return null;
    const url = session.history[++session.index];
    navigateFrame(target, url);
    return url;
  },
  reload(target) {
    const frame = getFrame(target);
    try { frame.contentWindow?.location?.reload?.(); } catch { frame.src = frame.src; }
    return frame;
  },
  current(target) {
    const session = getSession(target);
    return session.index >= 0 ? session.history[session.index] : null;
  },
  addBookmark(url, title = url) {
    const value = String(url ?? '').trim();
    if (!/^https?:\/\//i.test(value)) throw new TypeError('Bookmark URL must be HTTP(S)');
    bookmarks.set(value, { url: value, title: String(title ?? value), created: Date.now() });
    return true;
  },
  removeBookmark(url) { return bookmarks.delete(String(url ?? '')); },
  getBookmarks() { return Array.from(bookmarks.values()).sort((a, b) => b.created - a.created).map(entry => ({ ...entry })); },
  getHistory() { return historyLog.map(entry => ({ ...entry })); },
  clearHistory() { historyLog.length = 0; },
  _navigate(url, target) {
    if (!/^https?:\/\//i.test(url)) throw new TypeError('Flash navigation requires an HTTP(S) URL');
    const session = getSession(target);
    recordHistory(session, url);
    const iframe = navigateFrame(target, url);
    historyLog.push({ url, timestamp: Date.now() });
    return { url, iframe };
  }
};

if (typeof window !== 'undefined') window.fpAPI = fpAPI;
