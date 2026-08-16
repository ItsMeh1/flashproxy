use wasm_bindgen::prelude::*;
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

const WS_PREFIX: &str = "/wisp/";

fn passthrough(value: &str) -> bool {
    let value = value.trim();
    value.is_empty()
        || value.starts_with('#')
        || value.starts_with("data:")
        || value.starts_with("blob:")
        || value.starts_with("javascript:")
        || value.starts_with("mailto:")
        || value.starts_with("tel:")
        || value.starts_with("sms:")
        || value.starts_with("about:")
        || value.starts_with("file:")
        || value.starts_with("chrome:")
        || value.starts_with("chrome-extension:")
        || value.starts_with("moz-extension:")
        || value.starts_with("view-source:")
}

fn is_http(value: &str) -> bool {
    value.starts_with("http://") || value.starts_with("https://")
}

fn is_ws(value: &str) -> bool {
    value.starts_with("ws://") || value.starts_with("wss://")
}

fn normalize_prefix(prefix: &str) -> &str {
    prefix.trim_end_matches('/')
}

fn resolve_url(value: &str, base: &str) -> Option<String> {
    if passthrough(value) { return None; }
    let value = value.trim();
    if is_http(value) { return Some(value.to_string()); }
    if value.starts_with("//") {
        let scheme = if base.starts_with("https:") { "https:" } else { "http:" };
        return Some(format!("{}{}", scheme, value));
    }

    // The WASM entry receives the full document URL. This intentionally keeps
    // pathname semantics for imports such as ./chunk.js and ../asset.js.
    let base = base.trim_end_matches('/');
    if value.starts_with('/') {
        if let Some(origin_end) = base.find("//").and_then(|i| base[i + 2..].find('/').map(|j| i + 2 + j)) {
            return Some(format!("{}{}", &base[..origin_end], value));
        }
        return Some(format!("{}{}", base, value));
    }

    let origin_end = base.find("//").and_then(|i| base[i + 2..].find('/').map(|j| i + 2 + j));
    let origin_end = origin_end?;
    let origin = &base[..origin_end];
    let path = &base[origin_end..];
    let directory = path.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
    let mut parts: Vec<&str> = directory.split('/').filter(|p| !p.is_empty()).collect();
    for part in value.split('/') {
        match part {
            "" | "." => {}
            ".." => { parts.pop(); }
            other => parts.push(other),
        }
    }
    Some(format!("{}/{}", origin, parts.join("/")))
}

fn rewrite_value(value: &str, page_url: &str, prefix: &str) -> Option<String> {
    if passthrough(value) || value.starts_with(prefix) || value.starts_with(WS_PREFIX) { return None; }
    if is_ws(value) { return Some(format!("{}{}", WS_PREFIX, value)); }
    if let Some(target) = resolve_url(value, page_url) {
        return Some(format!("{}/{}", normalize_prefix(prefix), target));
    }
    None
}

fn rewrite_source(code: &str, page_url: &str, prefix: &str) -> String {
    let bytes = code.as_bytes();
    let mut out = String::with_capacity(code.len() + code.len() / 8);
    let mut i = 0usize;
    let mut changed = false;

    while i < bytes.len() {
        // JavaScript comments are copied verbatim so URL-looking text in them
        // can never be rewritten.
        if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'/' {
            let start = i;
            i += 2;
            while i < bytes.len() && bytes[i] != b'\n' { i += 1; }
            out.push_str(&code[start..i]);
            continue;
        }
        if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            let start = i;
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') { i += 1; }
            if i + 1 < bytes.len() { i += 2; }
            out.push_str(&code[start..i]);
            continue;
        }

        let quote = bytes[i];
        if quote != b'\'' && quote != b'"' {
            // Template literals can contain expressions and escaped delimiters;
            // leave the complete template untouched rather than risk corrupting
            // embedded JavaScript. Static template URLs are handled by runtime.
            out.push(bytes[i] as char);
            i += 1;
            continue;
        }

        let start = i;
        i += 1;
        let value_start = i;
        let mut escaped = false;
        while i < bytes.len() {
            if escaped { escaped = false; i += 1; continue; }
            if bytes[i] == b'\\' { escaped = true; i += 1; continue; }
            if bytes[i] == quote { break; }
            i += 1;
        }
        if i >= bytes.len() {
            out.push_str(&code[start..]);
            break;
        }
        let value = &code[value_start..i];
        if let Some(rewritten) = rewrite_value(value, page_url, prefix) {
            out.push(bytes[start] as char);
            out.push_str(&rewritten);
            out.push(bytes[i] as char);
            changed = true;
        } else {
            out.push_str(&code[start..=i]);
        }
        i += 1;
    }

    if changed { out } else { code.to_string() }
}

#[wasm_bindgen]
pub fn rewrite_js(code: String, page_url: String, fp_prefix: String) -> String {
    // Parse first. The lexical transformer intentionally does not attempt to
    // become a second JavaScript parser; malformed input is returned unchanged.
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &code, SourceType::default()).parse();
    if !parsed.errors.is_empty() { return code; }
    rewrite_source(&code, &page_url, &fp_prefix)
}
