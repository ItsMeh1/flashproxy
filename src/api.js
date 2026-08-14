/**
 * FlashProxy API
 * Works with ANY DOM element. Creates iframe automatically if needed.
 */

import { openDB } from 'idb';

const dbPromise = openDB('flashproxy', 1, {
    upgrade(db) {
        db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('bookmarks', { keyPath: 'url' });
        db.createObjectStore('settings');
    }
});

const sessions = new WeakMap();

function getSession(target) {
    if (!sessions.has(target)) {
        sessions.set(target, { history: [], index: -1 });
    }
    return sessions.get(target);
}

function getFrame(target) {
    if (target.tagName === 'IFRAME') return target;
    
    let iframe = target.querySelector('iframe[data-fp-frame]');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.setAttribute('data-fp-frame', 'true');
        iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
        iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads';
        target.innerHTML = '';
        target.appendChild(iframe);
    }
    return iframe;
}

function resolveInput(input) {
    input = (input || '').trim();
    if (!input) return 'https://example.com';
    
    if (/^https?:\/\//i.test(input)) return input;
    if (input.startsWith('//')) return 'https:' + input;
    
    if (/^([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}/i.test(input) && !input.includes(' ')) return 'https://' + input;
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(input) && !input.includes(' ')) return 'https://' + input;
    if (/^localhost(:\d+)?/i.test(input) && !input.includes(' ')) return 'https://' + input;
    
    return 'https://www.google.com/search?q=' + encodeURIComponent(input);
}

export const fpAPI = {
    async go(input, target) {
        const url = resolveInput(input);
        return this._navigate(url, target);
    },

    async goRAW(url, target) {
        return this._navigate(url, target);
    },

    back(target) {
        const session = getSession(target);
        if (session.index > 0) {
            session.index--;
            const url = session.history[session.index];
            getFrame(target).src = '/fp/' + url;
            return url;
        }
        return null;
    },

    forward(target) {
        const session = getSession(target);
        if (session.index < session.history.length - 1) {
            session.index++;
            const url = session.history[session.index];
            getFrame(target).src = '/fp/' + url;
            return url;
        }
        return null;
    },

    reload(target) {
        getFrame(target).contentWindow.location.reload();
    },

    current(target) {
        const session = getSession(target);
        return session.index >= 0 ? session.history[session.index] : null;
    },

    async addBookmark(url, title) {
        const db = await dbPromise;
        await db.put('bookmarks', { url, title, created: Date.now() });
    },

    async getBookmarks() {
        const db = await dbPromise;
        return db.getAll('bookmarks');
    },

    async getHistory() {
        const db = await dbPromise;
        return db.getAll('history');
    },

    _navigate(url, target) {
        const session = getSession(target);
        session.history = session.history.slice(0, session.index + 1);
        session.history.push(url);
        session.index++;
        
        const iframe = getFrame(target);
        iframe.src = '/fp/' + url;
        
        dbPromise.then(db => db.add('history', { url, timestamp: Date.now() }));
        
        return { url, iframe };
    }
};

if (typeof window !== 'undefined') window.fpAPI = fpAPI;
