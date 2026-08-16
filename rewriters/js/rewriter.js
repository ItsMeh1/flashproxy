import { createRequire } from 'node:module';
import { proxyUrl, proxyWebSocketUrl } from '../../src/url.js';

const require = createRequire(import.meta.url);
const FP_PREFIX = '/fp';
const WS_PREFIX = '/wisp/';
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

function rewriteString(value, pageUrl, fpPrefix) {
  const [core, trailing] = stripTrailing(value);
  if (/^(?:wss?:)/i.test(core)) {
    const rewritten = proxyWebSocketUrl(core, pageUrl, WS_PREFIX);
    return rewritten + trailing;
  }
  const rewritten = proxyUrl(core, pageUrl, fpPrefix);
  return rewritten === core ? value : rewritten + trailing;
}

function fallbackRewrite(code, pageUrl, fpPrefix) {
  const source = String(code);
  let output = source;

  // This fallback is intentionally lexical rather than a global regex over all
  // text. It handles common static resource literals while leaving comments,
  // identifiers, and arbitrary application strings alone. The AST/WASM path is
  // still preferred and is responsible for deeper syntax-aware transformations.
  output = output.replace(/(["'`])((?:https?:\/\/|wss?:\/\/|\/\/|\/|\.\.\/|\.\/)[^"'`\\\r\n]*)\1/g, (full, quote, value) => {
    const rewritten = rewriteString(value, pageUrl, fpPrefix);
    return quote + rewritten + quote;
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
