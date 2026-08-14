import { parseSync } from 'oxc-parser';

const FP_PREFIX = '/fp';

export function rewriteJs(code, pageUrl, fpPrefix = FP_PREFIX) {
    const base = new URL(pageUrl);
    
    try {
        const result = parseSync('input.js', code, { sourceType: 'unambiguous' });
        const spans = [];
        
        function getSpan(node) {
            if (node?.span && typeof node.span.start === 'number' && typeof node.span.end === 'number') {
                return { start: node.span.start, end: node.span.end };
            }
            if (typeof node?.start === 'number' && typeof node?.end === 'number') {
                return { start: node.start, end: node.end };
            }
            return null;
        }
        
        function isStringNode(node) {
            if (!node || typeof node !== 'object') return false;
            return (node.type === 'Literal' && typeof node.value === 'string') || node.type === 'StringLiteral';
        }
        
        function looksLikeUrl(val) {
            if (typeof val !== 'string') return false;
            if (val.startsWith('data:') || val.startsWith('#') || val.startsWith('javascript:')) return false;
            return val.startsWith('http://') || val.startsWith('https://') || 
                   (val.startsWith('//') && val.length > 2) || 
                   (val.startsWith('/') && val.length > 1);
        }
        
        function rewriteUrl(val) {
            if (val.startsWith('http://') || val.startsWith('https://')) {
                if (!val.startsWith(fpPrefix)) return `${fpPrefix}/${val}`;
            } else if (val.startsWith('//')) {
                return `${fpPrefix}/https:${val}`;
            } else if (val.startsWith('/')) {
                return `${fpPrefix}/${base.origin}${val}`;
            }
            return val;
        }
        
        function walk(node) {
            if (!node || typeof node !== 'object') return;
            
            if (isStringNode(node)) {
                const val = node.value;
                const span = getSpan(node);
                if (span && looksLikeUrl(val)) {
                    const newVal = rewriteUrl(val);
                    if (newVal !== val) {
                        spans.push({ start: span.start, end: span.end, original: val, replacement: newVal });
                    }
                }
            }
            
            if (node.type === 'TemplateLiteral' && Array.isArray(node.quasis)) {
                for (const quasi of node.quasis) {
                    if (quasi.value?.cooked) {
                        const cooked = quasi.value.cooked;
                        const span = getSpan(quasi);
                        if (span && looksLikeUrl(cooked)) {
                            const newCooked = rewriteUrl(cooked);
                            if (newCooked !== cooked) {
                                spans.push({ start: span.start, end: span.end, original: cooked, replacement: newCooked, isTemplate: true });
                            }
                        }
                    }
                }
            }
            
            if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'WebSocket' && node.arguments?.[0]) {
                const arg = node.arguments[0];
                if (isStringNode(arg) && arg.value && (arg.value.startsWith('ws://') || arg.value.startsWith('wss://'))) {
                    const span = getSpan(arg);
                    if (span) {
                        spans.push({ start: span.start, end: span.end, original: arg.value, replacement: `ws://localhost:3000/wisp/${arg.value}` });
                    }
                }
            }
            
            for (const key of Object.keys(node)) {
                if (key === 'span' || key === 'start' || key === 'end') continue;
                const child = node[key];
                if (Array.isArray(child)) child.forEach(walk);
                else if (child && typeof child === 'object') walk(child);
            }
        }
        
        walk(result.program);
        
        if (spans.length === 0) return code;
        
        spans.sort((a, b) => b.start - a.start);
        
        let rewritten = code;
        for (const span of spans) {
            const before = rewritten.slice(0, span.start);
            const after = rewritten.slice(span.end);
            let replacement = span.replacement;
            const originalSlice = code.slice(span.start, span.end);
            
            if (!span.isTemplate) {
                if (originalSlice.startsWith('"') && originalSlice.endsWith('"')) replacement = `"${replacement}"`;
                else if (originalSlice.startsWith("'") && originalSlice.endsWith("'")) replacement = `'${replacement}'`;
                else if (originalSlice.startsWith('`') && originalSlice.endsWith('`')) replacement = `\`${replacement}\``;
            }
            
            rewritten = before + replacement + after;
        }
        
        return rewritten;
        
    } catch (e) {
        return code;
    }
}
