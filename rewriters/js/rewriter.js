import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const FP_PREFIX = '/fp';

let wasmRewrite = null;
let wasmReady = false;

const wasmPromise = (async () => {
    try {
        const wasm = require('../../rewriter/pkg/flashproxy_rewriter.js');
        wasmRewrite = wasm.rewrite_js;
        wasmReady = true;
        console.log('[WASM] Rust rewriter loaded');
    } catch (e) {
        console.warn('[WASM] Not available:', e.message);
    }
})();

export async function rewriteJs(code, pageUrl, fpPrefix = FP_PREFIX) {
    await wasmPromise;
    if (wasmReady && wasmRewrite) {
        return wasmRewrite(code, new URL(pageUrl).origin, fpPrefix);
    }
    console.warn('[WASM] Falling back to raw JS (no rewrite)');
    return code;
}
