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
    console.warn('[FlashProxy] Rust/WASM JS rewriter unavailable:', error.message);
  }
})();

function stripTrailing(value) {
  const match = value.match(/[),.;:!?]+$/);
  if (!match) return [value, ''];
  return [value.slice(0, -match[0].length), match[0]];
}

function fallbackRewrite(code, pageUrl, fpPrefix) {
  const source = String(code);
  let output = source;

  // Keep the fallback deliberately conservative. It only touches string/template
  // literals that clearly contain a URL-like token; comments and identifiers are
  // not rewritten. The AST/WASM rewriter remains the preferred path.
  output = output.replace(/(["'`])((?:https?:\/\/|\/\/|\/|\.\.\/|\.\/)[^"'`\\\r\n]*)\1/g, (full, quote, value) => {
    const [core, trailing] = stripTrailing(value);
    const rewritten = proxyUrl(core, pageUrl, fpPrefix);
    return quote + (rewritten === core ? value : rewritten + trailing) + quote;
  });

  output = output.replace(/\b(?:new\s+)?WebSocket\s*\(\s*(["'`])((?:wss?:\/\/|\/)[^"'`]+)\1/g, (full, quote, value) => {
    const rewritten = proxyWebSocketUrl(value, pageUrl, '/wisp/');
    return full.replace(value, rewritten);
  });

  return output;
}

export async function rewriteJs(code, pageUrl, fpPrefix = FP_PREFIX) {
  await wasmPromise;
  if (wasmReady && wasmRewrite) {
    try {
      const result = wasmRewrite(String(code), new URL(pageUrl).origin, fpPrefix);
      return typeof result === 'string' ? result : String(code);
    } catch (error) {
      console.warn('[FlashProxy] WASM rewrite failed; using fallback:', error.message);
    }
  }
  return fallbackRewrite(code, pageUrl, fpPrefix);
}
