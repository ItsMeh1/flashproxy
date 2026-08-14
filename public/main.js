// This is a demo for your websites main.js. You can change this file later on in your own app.

import { fpAPI } from '/fp-api.js';

const container = document.getElementById('browser-container');
const addressBar = document.getElementById('address-bar');

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('SW registered'))
        .catch(err => console.error('SW error:', err));
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.__fp_nav) {
        addressBar.value = e.data.__fp_nav;
        fpAPI.goRAW(e.data.__fp_nav, container);
    }
});

document.getElementById('go').addEventListener('click', () => {
    fpAPI.go(addressBar.value, container);
});

addressBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fpAPI.go(addressBar.value, container);
});

document.getElementById('back').addEventListener('click', () => {
    fpAPI.back(container);
    const cur = fpAPI.current(container);
    if (cur) addressBar.value = cur;
});

document.getElementById('forward').addEventListener('click', () => {
    fpAPI.forward(container);
    const cur = fpAPI.current(container);
    if (cur) addressBar.value = cur;
});

document.getElementById('reload').addEventListener('click', () => {
    fpAPI.reload(container);
});

fpAPI.go('example.com', container);
