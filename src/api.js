/**
 * Flash Proxy browser API.
 * Navigation is kept per target container so multiple embedded browsers can coexist.
 */

import { proxyUrl } from './url.js';

const sessions = new WeakMap();
const bookmarks = new Map();
const historyLog = [];

function getSession(target) {
  if (!target || typeof target !== 'object') throw new TypeError('Flash Proxy target must be a DOM element');
  if (!sessions.has(target)) sessions.set(target, { history: [], index: -1 });
  return sessions.get(target);
}

function getFrame(target) {
  if (target.tagName === 'IFRAME') return target;
  let iframe = target.querySelector('iframe[data-fp-frame]');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.setAttribute('data-fp-frame', 'true');
    iframe.title = 'Flash Proxy browser';
    iframe.referrerPolicy = 'no-referrer';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals';
    iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
    target.replaceChildren(iframe);
  }
  return iframe;
}

function resolveInput(input) {
  const value = String(input || '').trim();
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

export const fpAPI = {
  resolveInput,

  go(input, target) {
    return this._navigate(resolveInput(input), target);
  },

  goRAW(url, target) {
    const value = String(url || '').trim();
    if (!/^https?:\/\//i.test(value)) throw new TypeError('goRAW() requires an absolute HTTP(S) URL');
    return this._navigate(value, target);
  },

  back(target) {
    const session = getSession(target);
    if (session.index <= 0) return null;
    session.index--;
    const url = session.history[session.index];
    navigateFrame(target, url);
    return url;
  },

  forward(target) {
    const session = getSession(target);
    if (session.index >= session.history.length - 1) return null;
    session.index++;
    const url = session.history[session.index];
    navigateFrame(target, url);
    return url;
  },

  reload(target) {
    const frame = getFrame(target);
    if (frame.contentWindow) frame.contentWindow.location.reload();
    else frame.src = frame.src;
  },

  current(target) {
    const session = getSession(target);
    return session.index >= 0 ? session.history[session.index] : null;
  },

  addBookmark(url, title = url) {
    const value = String(url);
    bookmarks.set(value, { url: value, title: String(title), created: Date.now() });
  },

  removeBookmark(url) {
    return bookmarks.delete(String(url));
  },

  getBookmarks() {
    return Array.from(bookmarks.values()).sort((a, b) => b.created - a.created);
  },

  getHistory() {
    return historyLog.map(entry => ({ ...entry }));
  },

  clearHistory() {
    historyLog.length = 0;
  },

  _navigate(url, target) {
    const session = getSession(target);
    session.history = session.history.slice(0, session.index + 1);
    session.history.push(url);
    session.index++;
    const iframe = navigateFrame(target, url);
    historyLog.push({ url, timestamp: Date.now() });
    return { url, iframe };
  }
};

if (typeof window !== 'undefined') window.fpAPI = fpAPI;
