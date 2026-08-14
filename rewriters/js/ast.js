import { parseSync } from 'oxc-parser';

const PROXY_PREFIX = '/proxy';

export function rewriteWithAST(code, pageUrl, proxyPrefix = PROXY_PREFIX) {
    const base = new URL(pageUrl);
    
    const result = parseSync(code, {
        sourceType: 'unambiguous',
        lang: 'js',
    });
    
    const program = JSON.parse(result.program);
    const spans = [];
    
    function walk(node, parent = null) {
        if (!node || typeof node !== 'object') return;
        
        // === URL STRING REWRITES ===
        if (node.type === 'StringLiteral' && node.value && node.span) {
            const val = node.value;
            let newVal = null;
            
            // Only rewrite if parent context suggests it's a URL
            const isUrlContext = isUrlUsageContext(node, parent);
            
            if (isUrlContext) {
                if (val.startsWith('http://') || val.startsWith('https://')) {
                    if (!val.startsWith(proxyPrefix)) newVal = `${proxyPrefix}/${val}`;
                } else if (val.startsWith('//')) {
                    newVal = `${proxyPrefix}/https:${val}`;
                } else if (val.startsWith('/')) {
                    newVal = `${proxyPrefix}/${base.origin}${val}`;
                }
            }
            
            if (newVal) {
                spans.push({ start: node.span.start, end: node.span.end, original: val, replacement: newVal });
            }
        }
        
        // === DPSC: Member Expression wrapping ===
        // window.location → __fp$wrap(window).location
        if (node.type === 'MemberExpression' && node.span) {
            const chain = getMemberChain(node);
            if (chain && isGlobalAccess(chain[0])) {
                // For now, just track these. Full DPSC requires more infrastructure.
                // This is where you'd add wrapper calls.
            }
        }
        
        // === eval() rewriting ===
        if (node.type === 'CallExpression') {
            const callee = node.callee;
            
            // eval("...")
            if (callee.type === 'Identifier' && callee.name === 'eval' && node.arguments?.[0]) {
                const arg = node.arguments[0];
                if (arg.type === 'StringLiteral' && arg.value && arg.span) {
                    // Recursively rewrite the eval'd code
                    try {
                        const rewrittenEval = rewriteWithAST(arg.value, pageUrl, proxyPrefix);
                        spans.push({
                            start: arg.span.start,
                            end: arg.span.end,
                            original: arg.value,
                            replacement: rewrittenEval,
                        });
                    } catch {
                        // Leave as-is if recursive rewrite fails
                    }
                }
            }
            
            // new Function("...", "...")
            if (callee.type === 'Identifier' && callee.name === 'Function' && node.arguments?.length > 0) {
                const lastArg = node.arguments[node.arguments.length - 1];
                if (lastArg.type === 'StringLiteral' && lastArg.value && lastArg.span) {
                    try {
                        const rewrittenFunc = rewriteWithAST(lastArg.value, pageUrl, proxyPrefix);
                        spans.push({
                            start: lastArg.span.start,
                            end: lastArg.span.end,
                            original: lastArg.value,
                            replacement: rewrittenFunc,
                        });
                    } catch {
                        // Leave as-is
                    }
                }
            }
        }
        
        // Recurse
        for (const key of Object.keys(node)) {
            if (key === 'span') continue;
            const child = node[key];
            if (Array.isArray(child)) {
                child.forEach(c => walk(c, node));
            } else if (typeof child === 'object') {
                walk(child, node);
            }
        }
    }
    
    walk(program);
    
    // Apply spans (descending order)
    spans.sort((a, b) => b.start - a.start);
    let rewritten = code;
    for (const span of spans) {
        const before = rewritten.slice(0, span.start);
        const after = rewritten.slice(span.end);
        let replacement = span.replacement;
        
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

// Helpers
function isUrlUsageContext(node, parent) {
    if (!parent) return false;
    
    // fetch(url)
    if (parent.type === 'CallExpression' && parent.callee?.type === 'Identifier' && parent.callee.name === 'fetch') {
        return parent.arguments?.[0] === node;
    }
    
    // new WebSocket(url)
    if (parent.type === 'NewExpression' && parent.callee?.type === 'Identifier' && parent.callee.name === 'WebSocket') {
        return parent.arguments?.[0] === node;
    }
    
    // new Worker(url)
    if (parent.type === 'NewExpression' && parent.callee?.type === 'Identifier' && parent.callee.name === 'Worker') {
        return parent.arguments?.[0] === node;
    }
    
    // new EventSource(url)
    if (parent.type === 'NewExpression' && parent.callee?.type === 'Identifier' && parent.callee.name === 'EventSource') {
        return parent.arguments?.[0] === node;
    }
    
    // import(url)
    if (parent.type === 'CallExpression' && parent.callee?.type === 'Import') {
        return parent.arguments?.[0] === node;
    }
    
    // ImportDeclaration source
    if (parent.type === 'ImportDeclaration') {
        return parent.source === node;
    }
    
    // Export declarations
    if (parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration') {
        return parent.source === node;
    }
    
    // XMLHttpRequest.open(method, url)
    if (parent.type === 'CallExpression' && parent.callee?.type === 'MemberExpression') {
        const prop = parent.callee.property;
        if (prop?.type === 'Identifier' && prop.name === 'open' && parent.arguments?.[1] === node) {
            return true;
        }
    }
    
    // history.pushState/replaceState(state, title, url)
    if (parent.type === 'CallExpression' && parent.callee?.type === 'MemberExpression') {
        const prop = parent.callee.property;
        if (prop?.type === 'Identifier' && ['pushState', 'replaceState'].includes(prop.name) && parent.arguments?.[2] === node) {
            return true;
        }
    }
    
    // navigator.sendBeacon(url, data)
    if (parent.type === 'CallExpression' && parent.callee?.type === 'MemberExpression') {
        const obj = parent.callee.object;
        const prop = parent.callee.property;
        if (obj?.type === 'Identifier' && obj.name === 'navigator' &&
            prop?.type === 'Identifier' && prop.name === 'sendBeacon' &&
            parent.arguments?.[0] === node) {
            return true;
        }
    }
    
    // window.open(url)
    if (parent.type === 'CallExpression' && parent.callee?.type === 'Identifier' && parent.callee.name === 'open' && parent.arguments?.[0] === node) {
        return true;
    }
    
    // Assignment to location.href / window.location / document.location
    if (parent.type === 'AssignmentExpression') {
        const left = parent.left;
        if (left?.type === 'MemberExpression') {
            const chain = getMemberChain(left);
            if (chain) {
                const str = chain.join('.');
                if (str.includes('location') || str.includes('href')) return true;
            }
        }
    }
    
    // Object property values: { url: '...', src: '...', href: '...' }
    if (parent.type === 'ObjectProperty' && parent.value === node && parent.key?.type === 'Identifier') {
        const keyName = parent.key.name;
        if (['url', 'src', 'href', 'endpoint', 'api', 'base', 'websocket', 'ws', 'wss'].includes(keyName)) {
            return true;
        }
    }
    
    return false;
}

function getMemberChain(node) {
    if (!node) return null;
    const parts = [];
    
    function walk(n) {
        if (n.type === 'Identifier') {
            parts.unshift(n.name);
        } else if (n.type === 'MemberExpression') {
            if (n.property?.type === 'Identifier') parts.unshift(n.property.name);
            else if (n.property?.type === 'StringLiteral') parts.unshift(n.property.value);
            walk(n.object);
        } else if (n.type === 'ThisExpression') {
            parts.unshift('this');
        }
    }
    
    walk(node);
    return parts.length > 0 ? parts : null;
}

function isGlobalAccess(name) {
    return ['window', 'self', 'globalThis', 'parent', 'top', 'document'].includes(name);
}
