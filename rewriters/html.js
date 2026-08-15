import { parseDocument } from 'htmlparser2';
import { render } from 'dom-serializer';
import { Element, Text } from 'domhandler';
import { proxyUrl } from '../src/url.js';
import { rewriteCss } from './css.js';
import { rewriteJs } from './js/index.js';
import { buildRuntime } from './runtime.js';

const URL_ATTRIBUTES = new Set([
  'href', 'src', 'action', 'formaction', 'poster', 'background', 'cite', 'data', 'manifest',
  'longdesc', 'profile', 'usemap', 'icon', 'itemid', 'itemprop', 'itemtype'
]);
const SCRIPT_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript', 'module']);

function rewriteSrcset(value, baseUrl, prefix) {
  return String(value).split(',').map(candidate => {
    const match = candidate.trim().match(/^(\S+)(.*)$/s);
    if (!match) return candidate;
    return `${proxyUrl(match[1], baseUrl, prefix)}${match[2]}`;
  }).join(', ');
}
function rewritePing(value, baseUrl, prefix) {
  return String(value).split(/\s+/).filter(Boolean).map(url => proxyUrl(url, baseUrl, prefix)).join(' ');
}
function rewriteMetaRefresh(value, baseUrl, prefix) {
  return String(value).replace(/(\burl\s*=\s*)([^;]+)/i, (_, head, target) => `${head}${proxyUrl(target.trim(), baseUrl, prefix)}`);
}
function rewriteUrlAttribute(name, value, baseUrl, prefix) {
  if (name === 'ping') return rewritePing(value, baseUrl, prefix);
  if (name === 'srcset' || name === 'imagesrcset') return rewriteSrcset(value, baseUrl, prefix);
  return proxyUrl(value, baseUrl, prefix);
}

function walk(node, baseUrl, prefix) {
  if (!node?.children) return;
  for (const child of node.children) {
    if (!child) continue;
    const attrs = child.attribs || {};
    const tag = String(child.name || '').toLowerCase();

    for (const [name, value] of Object.entries(attrs)) {
      const lower = name.toLowerCase();
      if (value == null) continue;
      if (URL_ATTRIBUTES.has(lower) || lower === 'srcset' || lower === 'imagesrcset' || lower === 'ping') attrs[name] = rewriteUrlAttribute(lower, value, baseUrl, prefix);
      else if (lower === 'style') attrs[name] = rewriteCss(value, baseUrl, prefix);
    }

    if (tag === 'script' || tag === 'link' || tag === 'style') {
      delete attrs.integrity;
      delete attrs.crossorigin;
    }
    if (tag === 'meta' && String(attrs['http-equiv'] || '').toLowerCase() === 'refresh' && attrs.content) attrs.content = rewriteMetaRefresh(attrs.content, baseUrl, prefix);
    if (tag === 'base' && attrs.href) attrs.href = proxyUrl(attrs.href, baseUrl, prefix);

    if (tag === 'style') {
      const css = child.children?.map(c => c.type === 'text' ? c.data : '').join('') || '';
      if (css) child.children = [new Text(rewriteCss(css, baseUrl, prefix))];
    }
    if (tag === 'iframe' && attrs.srcdoc) {
      const embedded = parseDocument(attrs.srcdoc, { decodeEntities: false });
      walk(embedded, baseUrl, prefix);
      attrs.srcdoc = render(embedded, { encodeEntities: false });
    }
    walk(child, baseUrl, prefix);
  }
}

function collectInlineScripts(node, output = []) {
  if (!node?.children) return output;
  for (const child of node.children) {
    if (String(child.name || '').toLowerCase() === 'script' && !child.attribs?.src) output.push(child);
    collectInlineScripts(child, output);
  }
  return output;
}

function injectRuntime(document, pageUrl, prefix) {
  const alreadyInjected = collectInlineScripts(document).some(script => script.attribs?.['data-flashproxy-runtime'] !== undefined);
  if (alreadyInjected) return;
  const script = new Element('script', { 'data-flashproxy-runtime': '' }, [new Text(buildRuntime(pageUrl, prefix))]);
  const html = document.children.find(node => node.type === 'tag' && node.name === 'html');
  const head = html?.children?.find(node => node.type === 'tag' && node.name === 'head');
  if (head) head.children.push(script);
  else document.children.push(script);
}

export async function rewriteHtml(html, pageUrl, fpPrefix = '/fp') {
  const document = parseDocument(String(html), { decodeEntities: false });
  walk(document, pageUrl, fpPrefix);

  for (const script of collectInlineScripts(document)) {
    if (script.attribs?.['data-flashproxy-runtime'] !== undefined) continue;
    const type = String(script.attribs?.type || '').split(';')[0].trim().toLowerCase();
    if (!SCRIPT_TYPES.has(type)) continue;
    const source = script.children?.map(c => c.type === 'text' ? c.data : '').join('') || '';
    if (!source.trim()) continue;
    try {
      script.children = [new Text(await rewriteJs(source, pageUrl, fpPrefix))];
    } catch (error) {
      console.warn('[FlashProxy] JS rewrite failed:', error.message);
    }
  }

  injectRuntime(document, pageUrl, fpPrefix);
  return render(document, { encodeEntities: false });
}
