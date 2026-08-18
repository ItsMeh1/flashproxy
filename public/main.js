import { fpAPI } from '/fp-api.js';

const container = document.getElementById('browser-container');
const addressBar = document.getElementById('address-bar');
const status = document.getElementById('status');
const addressForm = document.getElementById('address-form');
const buttons = {
  back: document.getElementById('back'),
  forward: document.getElementById('forward'),
  reload: document.getElementById('reload'),
  go: document.getElementById('go')
};
const frame = () => container.querySelector('iframe[data-fp-frame]');

function setStatus(text, state = 'idle') {
  status.textContent = text;
  status.dataset.state = state;
}

function updateAddress(url) {
  if (url) addressBar.value = url;
}

function updateControls() {
  const current = fpAPI.current(container);
  buttons.back.disabled = !current;
  buttons.forward.disabled = !current;
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`Error: ${message}`, 'error');
  updateControls();
}

function navigate(input) {
  const value = String(input ?? '').trim();
  if (!value) {
    addressBar.focus();
    setStatus('Enter a URL or search term.', 'error');
    return;
  }

  try {
    const result = fpAPI.go(value, container);
    updateAddress(result.url);
    setStatus(`Loading ${result.url}`, 'loading');
    updateControls();
  } catch (error) {
    showError(error);
  }
}

addressForm.addEventListener('submit', event => {
  event.preventDefault();
  navigate(addressBar.value);
});

buttons.back.addEventListener('click', () => {
  try {
    const url = fpAPI.back(container);
    if (url) {
      updateAddress(url);
      setStatus(`Loading ${url}`, 'loading');
    }
  } catch (error) {
    showError(error);
  }
  updateControls();
});

buttons.forward.addEventListener('click', () => {
  try {
    const url = fpAPI.forward(container);
    if (url) {
      updateAddress(url);
      setStatus(`Loading ${url}`, 'loading');
    }
  } catch (error) {
    showError(error);
  }
  updateControls();
});

buttons.reload.addEventListener('click', () => {
  try {
    fpAPI.reload(container);
    setStatus('Reloading…', 'loading');
  } catch (error) {
    showError(error);
  }
});

window.addEventListener('message', event => {
  if (event.source !== frame()?.contentWindow) return;
  const data = event.data;
  if (!data || data.type !== 'flash:navigate' || typeof data.url !== 'string') return;
  try {
    const result = fpAPI.goRAW(data.url, container);
    updateAddress(result.url);
    setStatus(`Loading ${result.url}`, 'loading');
    updateControls();
  } catch (error) {
    showError(error);
  }
});

container.addEventListener('load', event => {
  if (event.target?.matches?.('iframe[data-fp-frame]')) {
    setStatus('Ready', 'ready');
    const current = fpAPI.current(container);
    updateAddress(current);
    updateControls();
  }
}, true);

container.addEventListener('error', event => {
  if (event.target?.matches?.('iframe[data-fp-frame]')) setStatus('The proxied page failed to load.', 'error');
}, true);

window.addEventListener('keydown', event => {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) return;
  if (event.key.toLowerCase() === 'l') {
    event.preventDefault();
    addressBar.focus();
    addressBar.select();
  } else if (event.key === 'r') {
    event.preventDefault();
    buttons.reload.click();
  }
});

navigate('example.com');
updateControls();
