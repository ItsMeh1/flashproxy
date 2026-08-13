// This runs in your browser chrome (not inside the proxied page)

const iframe = document.getElementById('browser-frame');
const addressBar = document.getElementById('address-bar');

// Register Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.error('SW failed:', err));
}

// When user hits "Go"
document.getElementById('go').addEventListener('click', () => {
    const url = addressBar.value.trim();
    if (!url.startsWith('http')) {
        addressBar.value = 'https://' + url;
    }
    navigateTo(addressBar.value);
});

addressBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('go').click();
});

function navigateTo(url) { // main navigation function for simplicity
    // Load the site THROUGH the proxy
    // The Service Worker will intercept and rewrite everything
    iframe.src = '/proxy/' + url;
}

// Back/Forward buttons
document.getElementById('back').addEventListener('click', () => {
    iframe.contentWindow.history.back();
});
document.getElementById('forward').addEventListener('click', () => {
    iframe.contentWindow.history.forward();
});
document.getElementById('reload').addEventListener('click', () => {
    iframe.contentWindow.location.reload();
});

// Initial load
navigateTo('https://example.com');
