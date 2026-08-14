// This runs in your browser chrome (not inside the proxied page)

const iframe = document.getElementById('browser-frame');
const addressBar = document.getElementById('address-bar');

const iframe = document.getElementById('browser-frame');
const addressBar = document.getElementById('address-bar');

// Register Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('SW registered'))
        .catch(err => console.error('SW error:', err));
}

// Listen for navigation from iframe
window.addEventListener('message', (e) => {
    if (e.data && e.data.__fp_nav) {
        addressBar.value = e.data.__fp_nav;
        navigateTo(e.data.__fp_nav);
    }
});

function navigateTo(url) {
    if (!url.startsWith('http')) url = 'https://' + url;
    addressBar.value = url;
    iframe.src = '/proxy/' + url;
}

document.getElementById('go').addEventListener('click', () => navigateTo(addressBar.value));
addressBar.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigateTo(addressBar.value); });

document.getElementById('back').addEventListener('click', () => iframe.contentWindow.history.back());
document.getElementById('forward').addEventListener('click', () => iframe.contentWindow.history.forward());
document.getElementById('reload').addEventListener('click', () => iframe.contentWindow.location.reload());

navigateTo('https://example.com');

// Initial load
navigateTo('https://example.com');
