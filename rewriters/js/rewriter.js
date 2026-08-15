import { createRequire } from 'node:module';
import { proxyUrl } from '../../src/url.js';

const require = createRequire(import.meta.url);
const FP_PREFIX = '/fp';

let wasmRewrite = null;
let wasmReady = false;

const wasmPromise = (async () => {
  try {
    const wasm = require('../../rewriter/pkg/flashproxy_rewriter.js');
    wasmRewrite = wasm.rewrite_js;
    wasmReady = typeof wasmRewrite === 'function';
    if (wasmReady) console.log('[FlashProxy] Rust/WASM JS rewriter loaded');
  } catch (error) {
    console.warn('[FlashProxy] Rust/WASM rewriter unavailable:', error.message);
  }
})();

function fallbackRewrite(code, pageUrl, fpPrefix) {
  const literal = /(^|[^\\w$])((?:https?:\/\/|\/\/|\/|\.\.\/|\.\/)[^\s"'`<>)]*)/g;
  return String(code).replace(literal, (full, before, value) => {
    const trailing = value.match(/[),.;:!?]+$/)?.[0] || '';
    const core = trailing ? value.slice(0, -trailing.length) : value;
    const rewritten = proxyUrl(core, pageUrl, fpPrefix);
    return before + (rewritten === core ? core : rewritten) + trailing;
  });
}

export async function rewriteJs(code, pageUrl, fpPrefix = FP_PREFIX) {
  await wasmPromise;
  if (wasmReady && wasmRewrite) {
    try {
      return wasmRewrite(code, new URL(pageUrl).origin, fpPrefix);
    } catch (error) {
      console.warn('[FlashProxy] WASM rewrite failed, using fallback:', error.message);
    }
  }
  return fallbackRewrite(code, pageUrl, fpPrefix);
}
