import { parseSync } from 'oxc-parser';

const PROXY_PREFIX = '/proxy';

export function rewriteJs(code, pageUrl, proxyPrefix = PROXY_PREFIX) {
    const base = new URL(pageUrl);
    
    try {
        // Parse with Oxc — filename, source, options
        const result = parseSync('input.js', code, {
            sourceType: 'unambiguous',
        });
        
        const spans = [];
        
        function getSpan(node) {
            if (node.span && typeof node.span.start === 'number' && typeof node.span.end === 'number') {
                return { start: node.span.start, end: node.span.end };
            }
            if (typeof node.start === 'number' && typeof node.end === 'number') {
                return { start: node.start, end: node.end };
            }
            return null;
        }
        
        function isStringNode(node) {
            if (!node || typeof node !== 'object') return false;
            // Oxc can use either 'Literal' (ESTree) or 'StringLiteral'
            const isLiteralString = node.type === 'Literal' && typeof node.value === 'string';
            const isStringLiteral = node.type === 'StringLiteral';
            return isLiteralString || isStringLiteral;
        }
        
        function looksLikeUrl(val) {
            if (typeof val !== 'string') return false;
            if (val.startsWith('data:') || val.startsWith('#') || val.startsWith('javascript:')) return false;
            if (val.startsWith('http://') || val.startsWith('https://')) return true;
            if (val.startsWith('//') && val.length > 2) return true;
            if (val.startsWith('/') && val.length > 1) return true;
            return false;
        }
        
        function rewriteUrl(val) {
            if (val.startsWith('http://') || val.startsWith('https://')) {
                if (!val.startsWith(proxyPrefix)) return `${proxyPrefix}/${val}`;
            } else if (val.startsWith('//')) {
                return `${proxyPrefix}/https:${val}`;
            } else if (val.startsWith('/')) {
                return `${proxyPrefix}/${base.origin}${val}`;
            }
            return val;
        }
        
        // Walk the AST recursively
        function walk(node) {
            if (!node || typeof node !== 'object') return;
            
            // === STRING LITERALS ===
            if (isStringNode(node)) {
                const val = node.value;
                const span = getSpan(node);
                
                if (span && looksLikeUrl(val)) {
                    const newVal = rewriteUrl(val);
                    if (newVal !== val) {
                        spans.push({
                            start: span.start,
                            end: span.end,
                            original: val,
                            replacement: newVal,
                        });
                    }
                }
            }
            
            // === TEMPLATE LITERAL QUASIS ===
            if (node.type === 'TemplateLiteral' && Array.isArray(node.quasis)) {
                for (const quasi of node.quasis) {
                    if (quasi.value && typeof quasi.value.cooked === 'string') {
                        const cooked = quasi.value.cooked;
                        const span = getSpan(quasi);
                        
                        if (span && looksLikeUrl(cooked)) {
                            const newCooked = rewriteUrl(cooked);
                            if (newCooked !== cooked) {
                                spans.push({
                                    start: span.start,
                                    end: span.end,
                                    original: cooked,
                                    replacement: newCooked,
                                    isTemplate: true,
                                });
                            }
                        }
                    }
                }
            }
            
            // Recurse into children
            for (const key of Object.keys(node)) {
                if (key === 'span' || key === 'start' || key === 'end') continue;
                const child = node[key];
                if (Array.isArray(child)) {
                    child.forEach(walk);
                } else if (child && typeof child === 'object') {
                    walk(child);
                }
            }
        }
        
        walk(result.program);
        
        if (spans.length === 0) return code;
        
        // Sort descending so replacements don't shift positions
        spans.sort((a, b) => b.start - a.start);
        
        let rewritten = code;
        for (const span of spans) {
            const before = rewritten.slice(0, span.start);
            const after = rewritten.slice(span.end);
            
            let replacement = span.replacement;
            const originalSlice = code.slice(span.start, span.end);
            
            // Preserve quotes from original source
            if (!span.isTemplate) {
                if (originalSlice.startsWith('"') && originalSlice.endsWith('"')) {
                    replacement = `"${replacement}"`;
                } else if (originalSlice.startsWith("'") && originalSlice.endsWith("'")) {
                    replacement = `'${replacement}'`;
                } else if (originalSlice.startsWith('`') && originalSlice.endsWith('`')) {
                    replacement = `\`${replacement}\``;
                }
            } else {
                // Template quasi: preserve backticks if present
                if (originalSlice.startsWith('`') && originalSlice.endsWith('`')) {
                    replacement = `\`${replacement}\``;
                }
            }
            
            rewritten = before + replacement + after;
        }
        
        return rewritten;
        
    } catch (e) {
        console.warn('[Oxc rewrite failed]', e.message);
        return code;
    }
}
