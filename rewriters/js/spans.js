import { parseSync } from 'oxc-parser';

const PROXY_PREFIX = '/proxy';

export function rewriteWithSpans(code, pageUrl, proxyPrefix = PROXY_PREFIX) {
    const base = new URL(pageUrl);
    const spans = [];
    
    const result = parseSync(code, {
        sourceType: 'unambiguous',
        lang: 'js',
    });
    
    const program = JSON.parse(result.program);
    
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        
        // String literals that look like URLs
        if (node.type === 'StringLiteral' && node.value) {
            const val = node.value;
            let newVal = null;
            
            if (val.startsWith('http://') || val.startsWith('https://')) {
                if (!val.startsWith(proxyPrefix)) {
                    newVal = `${proxyPrefix}/${val}`;
                }
            } else if (val.startsWith('//')) {
                newVal = `${proxyPrefix}/https:${val}`;
            } else if (val.startsWith('/') && val.length > 1) {
                newVal = `${proxyPrefix}/${base.origin}${val}`;
            }
            
            if (newVal && node.span) {
                spans.push({
                    start: node.span.start,
                    end: node.span.end,
                    original: val,
                    replacement: newVal,
                });
            }
        }
        
        // Template literals with expressions
        if (node.type === 'TemplateLiteral' && node.quasis) {
            for (const quasi of node.quasis) {
                if (quasi.value?.raw) {
                    const raw = quasi.value.raw;
                    let newRaw = null;
                    
                    if (raw.startsWith('http://') || raw.startsWith('https://')) {
                        if (!raw.startsWith(proxyPrefix)) {
                            newRaw = `${proxyPrefix}/${raw}`;
                        }
                    } else if (raw.startsWith('//')) {
                        newRaw = `${proxyPrefix}/https:${raw}`;
                    } else if (raw.startsWith('/')) {
                        newRaw = `${proxyPrefix}/${base.origin}${raw}`;
                    }
                    
                    if (newRaw && quasi.span) {
                        spans.push({
                            start: quasi.span.start,
                            end: quasi.span.end,
                            original: raw,
                            replacement: newRaw,
                            isTemplate: true,
                        });
                    }
                }
            }
        }
        
        // Call expressions
        if (node.type === 'CallExpression') {
            const callee = node.callee;
            
            // fetch(url)
            if (callee.type === 'Identifier' && callee.name === 'fetch' && node.arguments?.[0]) {
                const arg = node.arguments[0];
                if (arg.type === 'StringLiteral' && arg.span) {
                    // Already handled by StringLiteral walker above
                }
            }
            
            // new WebSocket(url)
            if (callee.type === 'Identifier' && callee.name === 'WebSocket' && node.arguments?.[0]) {
                const arg = node.arguments[0];
                if (arg.type === 'StringLiteral' && arg.value && arg.span) {
                    const val = arg.value;
                    if (val.startsWith('ws://') || val.startsWith('wss://')) {
                        spans.push({
                            start: arg.span.start,
                            end: arg.span.end,
                            original: val,
                            replacement: `ws://localhost:3000/wisp/${val}`,
                        });
                    }
                }
            }
            
            // import(url)
            if (callee.type === 'Import' && node.arguments?.[0]) {
                const arg = node.arguments[0];
                if (arg.type === 'StringLiteral' && arg.span) {
                    // Handled by StringLiteral walker
                }
            }
        }
        
        // Import declarations
        if (node.type === 'ImportDeclaration' && node.source) {
            // Handled by StringLiteral walker
        }
        
        // Recurse
        for (const key of Object.keys(node)) {
            if (key === 'span') continue;
            const child = node[key];
            if (Array.isArray(child)) {
                child.forEach(walk);
            } else {
                walk(child);
            }
        }
    }
    
    walk(program);
    
    // Sort spans by position (descending so we can replace without offset issues)
    spans.sort((a, b) => b.start - a.start);
    
    // Apply replacements
    let rewritten = code;
    for (const span of spans) {
        const before = rewritten.slice(0, span.start);
        const after = rewritten.slice(span.end);
        
        let replacement = span.replacement;
        
        // Preserve quotes
        const originalSlice = code.slice(span.start, span.end);
        if (originalSlice.startsWith('"') && originalSlice.endsWith('"')) {
            replacement = `"${replacement}"`;
        } else if (originalSlice.startsWith("'") && originalSlice.endsWith("'")) {
            replacement = `'${replacement}'`;
        } else if (originalSlice.startsWith('`') && originalSlice.endsWith('`')) {
            replacement = `\`${replacement}\``;
        }
        
        rewritten = before + replacement + after;
    }
    
    return rewritten;
}
