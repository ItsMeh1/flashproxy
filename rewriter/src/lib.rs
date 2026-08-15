use wasm_bindgen::prelude::*;
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_ast::ast::*;
use oxc_ast::visit::walk::*;
use oxc_ast::Visit;

/// Check if a string looks like a URL we should rewrite
fn looks_like_url(val: &str) -> bool {
    if val.starts_with("data:") || val.starts_with("#") || val.starts_with("javascript:") {
        return false;
    }
    val.starts_with("http://")
        || val.starts_with("https://")
        || (val.starts_with("//") && val.len() > 2)
        || (val.starts_with("/") && val.len() > 1)
}

/// Rewrite a URL string
fn rewrite_url(val: &str, page_origin: &str, fp_prefix: &str) -> Option<String> {
    if val.starts_with(fp_prefix) {
        return None;
    }
    if val.starts_with("http://") || val.starts_with("https://") {
        return Some(format!("{}/{}", fp_prefix, val));
    }
    if val.starts_with("//") {
        return Some(format!("{}/https:{}", fp_prefix, val));
    }
    if val.starts_with("/") {
        return Some(format!("{}/{}{}", fp_prefix, page_origin, val));
    }
    None
}

/// Visitor that collects byte spans for replacement
struct UrlRewriter<'a> {
    code: &'a str,
    spans: Vec<(u32, u32, String)>,
    page_origin: &'a str,
    fp_prefix: &'a str,
}

impl<'a> UrlRewriter<'a> {
    fn try_rewrite(&mut self, val: &str, span: oxc_span::Span) {
        if let Some(replacement) = rewrite_url(val, self.page_origin, self.fp_prefix) {
            self.spans.push((span.start, span.end, replacement));
        }
    }
}

impl<'a, 'b> Visit<'a> for UrlRewriter<'b> {
    fn visit_string_literal(&mut self, lit: &StringLiteral<'a>) {
        self.try_rewrite(lit.value.as_str(), lit.span);
    }

    fn visit_template_element(&mut self, elem: &TemplateElement<'a>) {
        if let Some(ref cooked) = elem.value.cooked {
            self.try_rewrite(cooked.as_str(), elem.span);
        }
    }

    fn visit_new_expression(&mut self, expr: &NewExpression<'a>) {
        // Check for: new WebSocket("ws://...")
        if let Expression::Identifier(ident) = &expr.callee {
            if ident.name.as_str() == "WebSocket" {
                if let Some(arg) = expr.arguments.first() {
                    if let Expression::StringLiteral(lit) = &arg.expression {
                        let val = lit.value.as_str();
                        if val.starts_with("ws://") || val.starts_with("wss://") {
                            let replacement = format!("ws://localhost:3000/wisp/{}", val);
                            self.spans.push((lit.span.start, lit.span.end, replacement));
                        }
                    }
                }
            }
        }
        walk_new_expression(self, expr);
    }
}

/// Main entry point called from JavaScript
#[wasm_bindgen]
pub fn rewrite_js(code: String, page_origin: String, fp_prefix: String) -> String {
    let allocator = Allocator::default();
    let source_type = SourceType::default();
    let ret = Parser::new(&allocator, &code, source_type).parse();

    let mut rewriter = UrlRewriter {
        code: &code,
        spans: Vec::new(),
        page_origin: &page_origin,
        fp_prefix: &fp_prefix,
    };

    rewriter.visit_program(&ret.program);

    if rewriter.spans.is_empty() {
        return code;
    }

    // Sort descending so replacements don't shift positions
    rewriter.spans.sort_by(|a, b| b.0.cmp(&a.0));

    let mut result = code;
    for (start, end, replacement) in rewriter.spans {
        let start = start as usize;
        let end = end as usize;

        let before = &result[..start];
        let after = &result[end..];
        let original_slice = &code[start..end];

        // Preserve quotes from original source
        let final_replacement = if original_slice.starts_with('"') && original_slice.ends_with('"') {
            format!("\"{}\"", replacement)
        } else if original_slice.starts_with('\'') && original_slice.ends_with('\'') {
            format!("'{}'", replacement)
        } else if original_slice.starts_with('`') && original_slice.ends_with('`') {
            format!("`{}`", replacement)
        } else {
            replacement
        };

        result = format!("{}{}{}", before, final_replacement, after);
    }

    result
}
