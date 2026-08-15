import { parseDocument } from 'htmlparser2';
import { render } from 'dom-serializer';
import { Element, Text } from 'domhandler';
import { proxyUrl } from '../src/url.js';
import { rewriteCss } from './css.js';
import { rewriteJs } from './js/index.js';
import { buildRuntime } from './runtime.js';

const URL_ATTRIBUTES = new Set([
  'href', 'src', 'action', 'formaction', 'poster', 'background', 'cite', 'data', 'manifest',
  'longdesc', 'ping', 'profile', 'usemap', 'icon', 'itemid', 'itemprop', 'itemtype'
]);

function rewriteSrcset(value, baseUrl, prefix) {
  return String(value).split(',').map(candidate => {
    const match = candidate.trim().match(/^(\S+)(.*)$/);
    if (!match) return candidate;
    return `${proxyUrl(match[1], baseUrl, prefix)}${match[2]}`;
  }).join(', ');
}

function rewriteMetaRefresh(value, baseUrl, prefix) {
  return String(value).replace(/(\burl\s*=\s*)([^;]+)/i, (_, head, target) => `${head}${proxyUrl(target.trim(), baseUrl, prefix)}`);
}

function walk(node, baseUrl, prefix) {
  if (!node?.children) return;
  for (const child of node.children) {
    if (!child?.children && child.type !== 'tag' && child.type !== 'script' && child.type !== 'style') continue;
    const attrs = child.attribs || {};
    const tag = String(child.name || '').toLowerCase();

    for (const [name, value] of Object.entries(attrs)) {
      const lower = name.toLowerCase();
      if (value == null) continue;
      if (lower === 'srcset' || lower === 'imagesrcset') attrs[name] = rewriteSrcset(value, baseUrl, prefix);
      else if (URL_ATTRIBUTES.has(lower)) attrs[name] = proxyUrl(value, baseUrl, prefix);
      else if (lower === 'style') attrs[name] = rewriteCss(value, baseUrl, prefix);
    }

    if (tag === 'meta' && String(attrs['http-equiv'] || '').toLowerCase() === 'refresh' && attrs.content) {
      attrs.content = rewriteMetaRefresh(attrs.content, baseUrl, prefix);
    }

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

function injectRuntime(document, pageUrl, prefix) {
  if (document.children.some(node => node.type === 'tag' && node.attribs?.['data-flashproxy-runtime'] !== undefined)) return;
  const script = new Element('script', { 'data-flashproxy-runtime': '' }, [new Text(buildRuntime(pageUrl, prefix))]);
  const html = document.children.find(node => node.type === 'tag' && node.name === 'html');
  const head = html?.children?.find(node => node.type === 'tag' && node.name === 'head');
  if (head) head.children.push(script);
  else document.children.push(script);
}

export async function rewriteHtml(html, pageUrl, fpPrefix = '/fp') {
  const document = parseDocument(String(html), { decodeEntities: false });
  walk(document, pageUrl, fpPrefix);

  const scripts = [];
  const collectScripts = node => {
    if (!node?.children) return;
    for (const child of node.children) {
      if ((child.type === 'script' || child.name === 'script') && !child.attribs?.src) scripts.push(child);
      collectScripts(child);
    }
  };
  collectScripts(document);

  for (const script of scripts) {
    const type = String(script.attribs?.type || '').toLowerCase();
    if (type && !type.includes('javascript') && type !== 'module' && type !== 'text/ecmascript') continue;
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
