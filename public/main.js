import { fpAPI } from '/fp-api.js';

const container = document.getElementById('browser-container');
const addressBar = document.getElementById('address-bar');

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'flash:navigate' && typeof data.url === 'string') {
    addressBar.value = data.url;
    fpAPI.goRAW(data.url, container);
  }
});

document.getElementById('go').addEventListener('click', () => fpAPI.go(addressBar.value, container));
addressBar.addEventListener('keydown', event => {
  if (event.key === 'Enter') fpAPI.go(addressBar.value, container);
});

document.getElementById('back').addEventListener('click', () => {
  const url = fpAPI.back(container);
  if (url) addressBar.value = url;
});

document.getElementById('forward').addEventListener('click', () => {
  const url = fpAPI.forward(container);
  if (url) addressBar.value = url;
});

document.getElementById('reload').addEventListener('click', () => fpAPI.reload(container));

fpAPI.go('example.com', container);
