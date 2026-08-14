const iframe = document.getElementById('browser-frame');
const addressBar = document.getElementById('address-bar');

// =====================
// FlashProxy API
// =====================

const FlashProxy = {
    resolve(input) {
        input = input.trim();
        if (!input) return 'https://example.com';
        
        if (/^https?:\/\//i.test(input)) return input;
        if (input.startsWith('//')) return 'https:' + input;
        
        // Domain, IP, or localhost
        if (/^([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}/i.test(input) && !input.includes(' ')) return 'https://' + input;
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(input) && !input.includes(' ')) return 'https://' + input;
        if (/^localhost(:\d+)?/i.test(input) && !input.includes(' ')) return 'https://' + input;
        
        // Search query
        return 'https://www.google.com/search?q=' + encodeURIComponent(input);
    },

    go(input) {
        const url = this.resolve(input);
        navigateTo(url);
        return url;
    },

    goRaw(url) {
        navigateTo(url);
        return url;
    }
};

window.fp = FlashProxy;

// =====================
// Service Worker
// =====================

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('SW registered'))
        .catch(err => console.error('SW error:', err));
}

// =====================
// Navigation
// =====================

window.addEventListener('message', (e) => {
    if (e.data && e.data.__fp_nav) {
        addressBar.value = e.data.__fp_nav;
        navigateTo(e.data.__fp_nav);
    }
});

function navigateTo(url) {
    addressBar.value = url;
    iframe.src = '/proxy/' + url;
}

// =====================
// Event Listeners
// =====================

document.getElementById('go').addEventListener('click', () => fp.go(addressBar.value));

addressBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fp.go(addressBar.value);
});

document.getElementById('back').addEventListener('click', () => {
    try { iframe.contentWindow.history.back(); } catch {}
});

document.getElementById('forward').addEventListener('click', () => {
    try { iframe.contentWindow.history.forward(); } catch {}
});

document.getElementById('reload').addEventListener('click', () => {
    try { iframe.contentWindow.location.reload(); } catch {}
});

// =====================
// Initial Load
// =====================

fp.go('example.com');
