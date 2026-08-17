use wasm_bindgen::prelude::*;
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

const WS_PREFIX: &str = "/wisp/";

fn passthrough(value: &str) -> bool {
    let value = value.trim();
    let lower = value.to_ascii_lowercase();
    value.is_empty()
        || value.starts_with('#')
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("javascript:")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
        || lower.starts_with("sms:")
        || lower.starts_with("about:")
        || lower.starts_with("file:")
        || lower.starts_with("chrome:")
        || lower.starts_with("chrome-extension:")
        || lower.starts_with("moz-extension:")
        || lower.starts_with("view-source:")
}

fn is_http(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn is_ws(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("ws://") || lower.starts_with("wss://")
}

fn normalize_prefix(prefix: &str) -> &str {
    prefix.trim_end_matches('/')
}

fn origin_and_path(base: &str) -> Option<(&str, &str)> {
    let scheme_end = base.find("://")?;
    let authority_start = scheme_end + 3;
    let path_offset = base[authority_start..].find('/').map(|i| authority_start + i);
    match path_offset {
        Some(offset) => Some((&base[..offset], &base[offset..])),
        None => Some((base, "/")),
    }
}

fn resolve_url(value: &str, base: &str) -> Option<String> {
    if passthrough(value) { return None; }
    let value = value.trim();
    if is_http(value) { return Some(value.to_string()); }

    let (origin, path) = origin_and_path(base.trim())?;
    if value.starts_with("//") {
        let scheme = if base.trim_start().to_ascii_lowercase().starts_with("https:") { "https:" } else { "http:" };
        return Some(format!("{}{}", scheme, value));
    }
    if value.starts_with('/') {
        return Some(format!("{}{}", origin, value));
    }
    if value.starts_with('?') {
        let pathname = path.split(['?', '#']).next().unwrap_or("/");
        return Some(format!("{}{}{}", origin, pathname, value));
    }
    if value.starts_with('#') { return None; }

    let pathname = path.split(['?', '#']).next().unwrap_or("/");
    let directory = pathname.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
    let mut parts: Vec<&str> = directory.split('/').filter(|part| !part.is_empty()).collect();
    for part in value.split('/') {
        match part {
            "" | "." => {}
            ".." => { parts.pop(); }
            other => parts.push(other),
        }
    }
    let resolved_path = format!("/{}/", parts.join("/"));
    let resolved_path = resolved_path.trim_end_matches('/');
    Some(format!("{}{}", origin, if resolved_path.is_empty() { "/" } else { resolved_path }))
}

fn rewrite_value(value: &str, page_url: &str, prefix: &str) -> Option<String> {
    let trimmed = value.trim();
    let prefix = normalize_prefix(prefix);
    if passthrough(trimmed) || trimmed.starts_with(&format!("{}/", prefix)) || trimmed.starts_with(WS_PREFIX) { return None; }
    if is_ws(trimmed) { return Some(format!("{}{}", WS_PREFIX, trimmed)); }
    if let Some(target) = resolve_url(trimmed, page_url) {
        return Some(format!("{}/{}", prefix, target));
    }
    None
}

fn rewrite_source(code: &str, page_url: &str, prefix: &str) -> String {
    let bytes = code.as_bytes();
    let mut out = String::with_capacity(code.len() + code.len() / 8);
    let mut i = 0usize;
    let mut changed = false;

    while i < bytes.len() {
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
    // `unambiguous` accepts both classic scripts and ESM. The old default source
    // type treated the input as a script, causing valid `import`/`export` code to
    // be returned untouched by the WASM path.
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &code, SourceType::unambiguous()).parse();
    if !parsed.errors.is_empty() { return code; }
    rewrite_source(&code, &page_url, &fp_prefix)
}
