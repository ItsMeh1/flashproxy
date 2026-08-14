import { parseDocument } from 'htmlparser2';
import { render } from 'dom-serializer';
import { Element, Text } from 'domhandler';
import { removeElement } from 'domutils';

const URL_ATTRS = ['href', 'src', 'action', 'poster', 'data-src', 'data-href', 'data-url', 'content'];

function rewriteUrl(url, base, fpPrefix) {
    if (!url || url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:')) return url;
    if (url.startsWith(fpPrefix)) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return `${fpPrefix}/${url}`;
    if (url.startsWith('//')) return `${fpPrefix}/https:${url}`;
    if (url.startsWith('/')) return `${fpPrefix}/${base.origin}${url}`;
    try {
        return `${fpPrefix}/${new URL(url, base).href}`;
    } catch {
        return url;
    }
}

export function rewriteHtml(html, pageUrl, fpPrefix) {
    const base = new URL(pageUrl);
    const doc = parseDocument(html, { lowerCaseAttributeNames: false, decodeEntities: true });
    
    const elements = [];
    function walk(node) {
        if (node.type === 'tag') {
            elements.push(node);
            if (node.children) for (const child of node.children) walk(child);
        }
    }
    for (const child of doc.children) walk(child);
    
    for (const el of elements) {
        for (const attr of URL_ATTRS) {
            if (el.attribs[attr]) {
                el.attribs[attr] = rewriteUrl(el.attribs[attr], base, fpPrefix);
            }
        }
        
        if (el.name === 'base' && el.attribs.href) {
            el.attribs.href = rewriteUrl(el.attribs.href, base, fpPrefix);
        }
        
        if (el.name === 'link' && el.attribs.rel === 'manifest') {
            removeElement(el);
            continue;
        }
        
        if (el.name === 'meta' && el.attribs['http-equiv']?.toLowerCase() === 'content-security-policy') {
            removeElement(el);
            continue;
        }
    }
    
    const injection = new Element('script', { 'data-flashproxy': '' });
    const injectionText = new Text(`(function(){
'use strict';
const __pp='${fpPrefix}';
const __page='${pageUrl}';
const __origin='${base.origin}';
window.__flashproxy_page=__page;
const _f=window.fetch,_x=window.XMLHttpRequest,_w=window.WebSocket,_e=window.EventSource,_W=window.Worker,_o=window.open,_sb=navigator.sendBeacon,_ps=history.pushState,_rs=history.replaceState;
window.fetch=function(u,o){try{if(typeof u==='string'){if(u.startsWith('http'))u=__pp+'/'+u;else if(u.startsWith('/'))u=__pp+'/'+__origin+u;}else if(u instanceof Request){const r=u.url;u=new Request(r.startsWith('http')?__pp+'/'+r:r.startsWith('/')?__pp+'/'+__origin+r:r,u);}return _f(u,o);}catch(e){return new Promise((res,rej)=>{const x=new _x();x.open(o?.method||'GET',u,true);if(o?.headers)for(const[k,v]of Object.entries(o.headers))x.setRequestHeader(k,v);x.onload=()=>res(new Response(x.response,{status:x.status}));x.onerror=rej;x.send(o?.body||null);});}};
window.XMLHttpRequest=function(){const x=new _x(),op=x.open;x.open=function(m,u,a,user,pw){if(typeof u==='string'){if(u.startsWith('http'))u=__pp+'/'+u;else if(u.startsWith('/'))u=__pp+'/'+__origin+u;}return op.call(x,m,u,a,user,pw);};return x;};
window.WebSocket=function(url,p){if(typeof url==='string'&&(url.startsWith('ws://')||url.startsWith('wss://'))){url=(location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/wisp/'+url;}return new _w(url,p);};
window.EventSource=function(url,o){if(typeof url==='string'){if(url.startsWith('http'))url=__pp+'/'+url;else if(url.startsWith('/'))url=__pp+'/'+__origin+url;}return new _e(url,o);};
window.Worker=function(url,o){if(typeof url==='string'){if(url.startsWith('http'))url=__pp+'/'+url;else if(url.startsWith('/'))url=__pp+'/'+__origin+url;}return new _W(url,o);};
window.open=function(url,t,f){if(typeof url==='string'){if(url.startsWith('http'))url=__pp+'/'+url;else if(url.startsWith('/'))url=__pp+'/'+__origin+url;}return _o(url,t,f);};
navigator.sendBeacon=function(url,d){if(typeof url==='string'){if(url.startsWith('http'))url=__pp+'/'+url;else if(url.startsWith('/'))url=__pp+'/'+__origin+url;}return _sb.call(navigator,url,d);};
const _loc=new URL(__page);
Object.defineProperty(window,'location',{get:()=>_loc,set:(v)=>{if(typeof v==='string'){if(v.startsWith('http'))window.top.postMessage({__fp_nav:v},'*');else if(v.startsWith('/'))window.top.postMessage({__fp_nav:__origin+v},'*');else _loc.href=v;}}});
Object.defineProperty(document,'location',{get:()=>_loc,set:(v)=>{window.location=v;}});
history.pushState=function(s,t,u){if(typeof u==='string'){if(u.startsWith('http'))u=__pp+'/'+u;else if(u.startsWith('/'))u=__pp+'/'+__origin+u;}return _ps.call(history,s,t,u);};
history.replaceState=function(s,t,u){if(typeof u==='string'){if(u.startsWith('http'))u=__pp+'/'+u;else if(u.startsWith('/'))u=__pp+'/'+__origin+u;}return _rs.call(history,s,t,u);};
console.log('[FlashProxy] Injected');
})();`);
    injection.children = [injectionText];
    injectionText.parent = injection;
    
    const head = elements.find(el => el.name === 'head');
    if (head) {
        head.children.unshift(injection);
        injection.parent = head;
    } else {
        const htmlEl = elements.find(el => el.name === 'html');
        if (htmlEl) {
            htmlEl.children.unshift(injection);
            injection.parent = htmlEl;
        } else {
            doc.children.unshift(injection);
            injection.parent = doc;
        }
    }
    
    return render(doc, { decodeEntities: false });
}
