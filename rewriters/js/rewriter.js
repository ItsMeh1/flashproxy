import { createRequire } from 'node:module';
import { proxyUrl, proxyWebSocketUrl } from '../../src/url.js';

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
  const rewriteString = (value) => {
    if (/^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(value)) return value;
    if (/^(?:https?:\/\/|\/\/|\/|\.\.?\/)/i.test(value)) return proxyUrl(value, pageUrl, fpPrefix);
    return value;
  };

  let output = String(code);
  output = output.replace(/(["'`])((?:https?:\/\/|\/\/|\/|\.\.\/|\.\/)[^"'`]*?)\1/g, (full, quote, value) => {
    const rewritten = rewriteString(value);
    return rewritten === value ? full : `${quote}${rewritten}${quote}`;
  });

  output = output.replace(/new\s+WebSocket\(\s*(["'])(ws:\/\/|wss:\/\/)([^"']+)\1/gi, (full, quote, _scheme, rest) => {
    const rewritten = proxyWebSocketUrl(`${_scheme}${rest}`, pageUrl, '/wisp/');
    return full.replace(`${_scheme}${rest}`, rewritten);
  });

  return output;
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
