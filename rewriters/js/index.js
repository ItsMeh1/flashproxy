import { rewriteWithSpans } from './spans.js';
import { rewriteWithAST } from './ast.js';

export function rewriteJs(code, pageUrl, proxyPrefix) {
    // Try fast span-based rewriting first
    try {
        return rewriteWithSpans(code, pageUrl, proxyPrefix);
    } catch (e) {
        console.warn('[JS] Span rewrite failed, falling back to AST:', e.message);
    }
    
    // Fallback to full AST rewrite for complex cases
    try {
        return rewriteWithAST(code, pageUrl, proxyPrefix);
    } catch (e) {
        console.warn('[JS] AST rewrite failed, returning raw:', e.message);
        return code;
    }
}
