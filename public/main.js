import { fpAPI } from '/fp-api.js';

const container = document.getElementById('browser-container');
const addressBar = document.getElementById('address-bar');
const status = document.getElementById('status');
const frame = () => container.querySelector('iframe[data-fp-frame]');

function setStatus(text) {
  status.textContent = text;
}

function updateAddress(url) {
  if (url) addressBar.value = url;
}

function navigate(input) {
  try {
    const result = fpAPI.go(input, container);
    updateAddress(result.url);
    setStatus(`Loading ${result.url}`);
  } catch (error) {
    setStatus(error.message);
  }
}

document.getElementById('address-form').addEventListener('submit', event => {
  event.preventDefault();
  navigate(addressBar.value);
});

document.getElementById('back').addEventListener('click', () => {
  const url = fpAPI.back(container);
  if (url) updateAddress(url);
});

document.getElementById('forward').addEventListener('click', () => {
  const url = fpAPI.forward(container);
  if (url) updateAddress(url);
});

document.getElementById('reload').addEventListener('click', () => {
  fpAPI.reload(container);
  setStatus('Reloading…');
});

window.addEventListener('message', event => {
  if (event.source !== frame()?.contentWindow) return;
  const data = event.data;
  if (!data || data.type !== 'flash:navigate' || typeof data.url !== 'string') return;
  try {
    const result = fpAPI.goRAW(data.url, container);
    updateAddress(result.url);
    setStatus(`Loading ${result.url}`);
  } catch (error) {
    setStatus(error.message);
  }
});

container.addEventListener('load', event => {
  if (event.target?.matches?.('iframe[data-fp-frame]')) setStatus('Ready');
}, true);

navigate('example.com');
