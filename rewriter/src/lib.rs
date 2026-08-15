use wasm_bindgen::prelude::*;
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::{SourceType, Span};
use oxc_ast::ast::*;
use oxc_ast::visit::walk::*;
use oxc_ast::Visit;

// =====================
// CONFIG & UTILS
// =====================

const GLOBAL_OBJS: &[&str] = &["window", "self", "globalThis", "parent", "top", "document"];
const LOCATION_PROPS: &[&str] = &["location", "href", "protocol", "host", "hostname", "port", "pathname", "search", "hash", "origin", "assign", "replace", "reload"];
const URL_PROPS: &[&str] = &["src", "href", "action", "url", "srcdoc", "data", "poster", "background", "formAction"];

fn looks_like_url(val: &str) -> bool {
    if val.starts_with("data:") || val.starts_with("#") || val.starts_with("javascript:") || val.starts_with("blob:") {
        return false;
    }
    val.starts_with("http://")
        || val.starts_with("https://")
        || (val.starts_with("//") && val.len() > 2)
        || (val.starts_with("/") && val.len() > 1)
}

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

fn rewrite_ws_url(val: &str) -> Option<String> {
    if val.starts_with("ws://") || val.starts_with("wss://") {
        return Some(format!("ws://localhost:3000/wisp/{}", val));
    }
    None
}

// =====================
// REPLACEMENT SPAN
// =====================

#[derive(Debug, Clone)]
struct ReplaceSpan {
    start: u32,
    end: u32,
    replacement: String,
}

// =====================
// SCOPE TRACKING
// =====================

#[derive(Debug, Default, Clone)]
struct Scope {
    vars: std::collections::HashSet<String>,
}

impl Scope {
    fn new() -> Self {
        Self::default()
    }
    
    fn insert(&mut self, name: &str) {
        self.vars.insert(name.to_string());
    }
    
    fn contains(&self, name: &str) -> bool {
        self.vars.contains(name)
    }
}

// =====================
// REWRITER STATE
// =====================

struct Rewriter<'a> {
    code: &'a str,
    spans: Vec<ReplaceSpan>,
    page_origin: &'a str,
    fp_prefix: &'a str,
    scope_stack: Vec<Scope>,
}

impl<'a> Rewriter<'a> {
    fn new(code: &'a str, page_origin: &'a str, fp_prefix: &'a str) -> Self {
        Self {
            code,
            spans: Vec::new(),
            page_origin,
            fp_prefix,
            scope_stack: vec![Scope::new()],
        }
    }
    
    fn current_scope(&self) -> &Scope {
        self.scope_stack.last().unwrap()
    }
    
    fn is_global_shadowed(&self, name: &str) -> bool {
        self.scope_stack.iter().any(|s| s.contains(name))
    }
    
    fn is_global_ref(&self, name: &str) -> bool {
        GLOBAL_OBJS.contains(&name) && !self.is_global_shadowed(name)
    }
    
    fn add_span(&mut self, span: Span, replacement: String) {
        self.spans.push(ReplaceSpan {
            start: span.start,
            end: span.end,
            replacement,
        });
    }
    
    fn try_rewrite_url(&mut self, val: &str, span: Span) {
        if let Some(replacement) = rewrite_url(val, self.page_origin, self.fp_prefix) {
            self.add_span(span, replacement);
        }
    }
    
    fn try_rewrite_ws(&mut self, val: &str, span: Span) {
        if let Some(replacement) = rewrite_ws_url(val) {
            self.add_span(span, replacement);
        }
    }
    
    // Check if an expression is or resolves to a global object reference
    fn expr_is_global(&self, expr: &Expression) -> bool {
        match expr {
            Expression::Identifier(ident) => self.is_global_ref(ident.name.as_str()),
            Expression::MemberExpression(member) => self.expr_is_global(&member.object),
            Expression::MetaProperty(meta) => {
                meta.meta.name.as_str() == "import" && meta.property.name.as_str() == "meta"
            }
            _ => false,
        }
    }
    
    fn get_member_chain(&self, expr: &MemberExpression) -> Option<Vec<String>> {
        let mut parts = Vec::new();
        self.collect_member_parts(expr, &mut parts);
        if parts.is_empty() { None } else { Some(parts) }
    }
    
    fn collect_member_parts(&self, expr: &MemberExpression, parts: &mut Vec<String>) {
        match &expr.object {
            Expression::Identifier(ident) => {
                parts.push(ident.name.to_string());
            }
            Expression::MemberExpression(inner) => {
                self.collect_member_parts(inner, parts);
            }
            Expression::ThisExpression(_) => {
                parts.push("this".to_string());
            }
            _ => {}
        }
        
        match &expr.property {
            MemberExpressionProperty::Identifier(ident) => {
                parts.push(ident.name.to_string());
            }
            MemberExpressionProperty::Expression(Expression::StringLiteral(lit)) => {
                parts.push(lit.value.to_string());
            }
            _ => {}
        }
    }
    
    // Check if a member expression accesses a property we need to wrap/intercept
    fn is_sensitive_member_access(&self, expr: &MemberExpression) -> bool {
        if let Some(chain) = self.get_member_chain(expr) {
            if chain.len() >= 2 {
                let first = chain[0].as_str();
                let last = chain.last().unwrap().as_str();
                
                // window.location, self.location, document.location, etc.
                if self.is_global_ref(first) && LOCATION_PROPS.contains(&last) {
                    return true;
                }
                
                // window.document (for base URL normalization escapes)
                if self.is_global_ref(first) && last == "document" {
                    return true;
                }
            }
        }
        false
    }
    
    // Recursively rewrite JS code inside a string (for eval/Function)
    fn rewrite_nested(&self, code: &str) -> String {
        let allocator = Allocator::default();
        let source_type = SourceType::default();
        let ret = Parser::new(&allocator, code, source_type).parse();
        
        let mut nested = Rewriter::new(code, self.page_origin, self.fp_prefix);
        nested.visit_program(&ret.program);
        
        if nested.spans.is_empty() {
            return code.to_string();
        }
        
        nested.spans.sort_by(|a, b| b.start.cmp(&a.start));
        
        let mut result = code.to_string();
        for span in nested.spans {
            let start = span.start as usize;
            let end = span.end as usize;
            let before = &result[..start];
            let after = &result[end..];
            result = format!("{}{}{}", before, span.replacement, after);
        }
        result
    }
}

// =====================
// AST VISITOR
// =====================

impl<'a, 'b> Visit<'a> for Rewriter<'b> {
    // --- SCOPE MANAGEMENT ---
    
    fn visit_function(&mut self, func: &Function<'a>, flags: Option<oxc_ast::ast::FunctionFlags>) {
        self.scope_stack.push(Scope::new());
        // Add function parameters to scope
        for param in &func.params.items {
            if let Some(pat) = &param.pattern.kind {
                self.collect_pattern_ids(pat);
            }
        }
        walk_function(self, func, flags);
        self.scope_stack.pop();
    }
    
    fn visit_arrow_function_expression(&mut self, expr: &ArrowFunctionExpression<'a>) {
        self.scope_stack.push(Scope::new());
        for param in &expr.params.items {
            if let Some(pat) = &param.pattern.kind {
                self.collect_pattern_ids(pat);
            }
        }
        walk_arrow_function_expression(self, expr);
        self.scope_stack.pop();
    }
    
    fn visit_block_statement(&mut self, stmt: &BlockStatement<'a>) {
        self.scope_stack.push(Scope::new());
        walk_block_statement(self, stmt);
        self.scope_stack.pop();
    }
    
    fn visit_for_statement(&mut self, stmt: &ForStatement<'a>) {
        self.scope_stack.push(Scope::new());
        walk_for_statement(self, stmt);
        self.scope_stack.pop();
    }
    
    fn visit_for_in_statement(&mut self, stmt: &ForInStatement<'a>) {
        self.scope_stack.push(Scope::new());
        walk_for_in_statement(self, stmt);
        self.scope_stack.pop();
    }
    
    fn visit_for_of_statement(&mut self, stmt: &ForOfStatement<'a>) {
        self.scope_stack.push(Scope::new());
        walk_for_of_statement(self, stmt);
        self.scope_stack.pop();
    }
    
    fn visit_catch_clause(&mut self, clause: &CatchClause<'a>) {
        self.scope_stack.push(Scope::new());
        if let Some(param) = &clause.param {
            self.collect_pattern_ids(&param.kind);
        }
        walk_catch_clause(self, clause);
        self.scope_stack.pop();
    }
    
    // --- VARIABLE DECLARATIONS (track scope) ---
    
    fn visit_variable_declarator(&mut self, decl: &VariableDeclarator<'a>) {
        self.collect_pattern_ids(&decl.id.kind);
        walk_variable_declarator(self, decl);
    }
    
    // --- STRING LITERALS (URL rewriting) ---
    
    fn visit_string_literal(&mut self, lit: &StringLiteral<'a>) {
        let val = lit.value.as_str();
        if looks_like_url(val) {
            self.try_rewrite_url(val, lit.span);
        } else {
            self.try_rewrite_ws(val, lit.span);
        }
    }
    
    // --- TEMPLATE LITERALS ---
    
    fn visit_template_element(&mut self, elem: &TemplateElement<'a>) {
        if let Some(ref cooked) = elem.value.cooked {
            if looks_like_url(cooked.as_str()) {
                self.try_rewrite_url(cooked.as_str(), elem.span);
            }
        }
    }
    
    // --- IMPORT / EXPORT ---
    
    fn visit_import_declaration(&mut self, decl: &ImportDeclaration<'a>) {
        let val = decl.source.value.as_str();
        self.try_rewrite_url(val, decl.source.span);
        walk_import_declaration(self, decl);
    }
    
    fn visit_export_named_declaration(&mut self, decl: &ExportNamedDeclaration<'a>) {
        if let Some(source) = &decl.source {
            let val = source.value.as_str();
            self.try_rewrite_url(val, source.span);
        }
        walk_export_named_declaration(self, decl);
    }
    
    fn visit_export_all_declaration(&mut self, decl: &ExportAllDeclaration<'a>) {
        let val = decl.source.value.as_str();
        self.try_rewrite_url(val, decl.source.span);
        walk_export_all_declaration(self, decl);
    }
    
    // --- CALL EXPRESSIONS ---
    
    fn visit_call_expression(&mut self, expr: &CallExpression<'a>) {
        // fetch(url)
        if let Expression::Identifier(ident) = &expr.callee {
            if ident.name.as_str() == "fetch" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    self.try_rewrite_url(lit.value.as_str(), lit.span);
                }
            }
        }
        
        // import(url) — dynamic import
        if expr.callee.is_import() && expr.arguments.len() > 0 {
            if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                self.try_rewrite_url(lit.value.as_str(), lit.span);
            }
        }
        
        // eval("...") — recursively rewrite
        if let Expression::Identifier(ident) = &expr.callee {
            if ident.name.as_str() == "eval" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    let rewritten = self.rewrite_nested(lit.value.as_str());
                    if rewritten != lit.value.as_str() {
                        self.add_span(lit.span, rewritten);
                    }
                }
            }
        }
        
        walk_call_expression(self, expr);
    }
    
    // --- NEW EXPRESSIONS ---
    
    fn visit_new_expression(&mut self, expr: &NewExpression<'a>) {
        if let Expression::Identifier(ident) = &expr.callee {
            let name = ident.name.as_str();
            
            // new WebSocket(url)
            if name == "WebSocket" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    self.try_rewrite_ws(lit.value.as_str(), lit.span);
                }
            }
            
            // new Worker(url)
            if name == "Worker" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    self.try_rewrite_url(lit.value.as_str(), lit.span);
                }
            }
            
            // new EventSource(url)
            if name == "EventSource" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    self.try_rewrite_url(lit.value.as_str(), lit.span);
                }
            }
            
            // new Function("...", "body") — rewrite the last argument (body)
            if name == "Function" && expr.arguments.len() > 0 {
                if let Some(arg) = expr.arguments.last() {
                    if let Expression::StringLiteral(lit) = &arg.expression {
                        let rewritten = self.rewrite_nested(lit.value.as_str());
                        if rewritten != lit.value.as_str() {
                            self.add_span(lit.span, rewritten);
                        }
                    }
                }
            }
        }
        
        walk_new_expression(self, expr);
    }
    
    // --- MEMBER EXPRESSIONS (DPSC) ---
    
    fn visit_member_expression(&mut self, expr: &MemberExpression<'a>) {
        // Check if this is a sensitive global access we need to wrap
        if self.is_sensitive_member_access(expr) {
            // For now, we mark it. Full wrapping would replace the entire expr.
            // Scramjet wraps these in helper functions. For byte-span rewrites,
            // we can replace just the property access part.
            // This is a simplified DPSC — full Scramjet does more.
            
            // Example: window.location → __fp$get(window, "location")
            // But byte-span rewrites are limited. We'll do URL rewrites on
            // assignment values instead of full wrapping here.
        }
        walk_member_expression(self, expr);
    }
    
    // --- ASSIGNMENT EXPRESSIONS ---
    
    fn visit_assignment_expression(&mut self, expr: &AssignmentExpression<'a>) {
        // window.location = "..."
        // document.location = "..."
        if let AssignmentTarget::AssignmentTargetIdentifier(target) = &expr.left {
            let name = target.name.as_str();
            if (name == "location" || name.ends_with(".location")) && expr.right.is_string_literal() {
                if let Expression::StringLiteral(lit) = &expr.right {
                    self.try_rewrite_url(lit.value.as_str(), lit.span);
                }
            }
        }
        
        // Check for member expression assignment: window.location.href = "..."
        if let AssignmentTarget::SimpleAssignmentTarget(target) = &expr.left {
            if let SimpleAssignmentTarget::MemberExpression(member) = target {
                if self.is_sensitive_member_access(member) {
                    if let Expression::StringLiteral(lit) = &expr.right {
                        self.try_rewrite_url(lit.value.as_str(), lit.span);
                    }
                }
            }
        }
        
        walk_assignment_expression(self, expr);
    }
    
    // --- OBJECT PATTERN DESTRUCTURE (escape detection) ---
    
    fn visit_object_pattern(&mut self, pat: &ObjectPattern<'a>) {
        // Detect: const { location: x } = window;
        // This is an escape vector. We can't easily fix it with byte spans,
        // but we can detect and warn.
        walk_object_pattern(self, pat);
    }
}

// =====================
// PATTERN ID COLLECTION (for scope tracking)
// =====================

impl<'a> Rewriter<'a> {
    fn collect_pattern_ids(&mut self, pat: &BindingPatternKind) {
        match pat {
            BindingPatternKind::BindingIdentifier(ident) => {
                self.current_scope().insert(ident.name.as_str());
            }
            BindingPatternKind::ObjectPattern(obj) => {
                for prop in &obj.properties {
                    match prop {
                        BindingProperty::BindingPropertyIdentifier(ident) => {
                            self.current_scope().insert(ident.binding.name.as_str());
                        }
                        BindingProperty::BindingPropertyPattern(pat) => {
                            self.collect_pattern_ids(&pat.binding.kind);
                        }
                    }
                }
            }
            BindingPatternKind::ArrayPattern(arr) => {
                for elem in &arr.elements {
                    if let Some(el) = elem {
                        self.collect_pattern_ids(&el.kind);
                    }
                }
            }
            BindingPatternKind::AssignmentPattern(assign) => {
                self.collect_pattern_ids(&assign.left.kind);
            }
        }
    }
}

// =====================
// WASM ENTRY POINT
// =====================

#[wasm_bindgen]
pub fn rewrite_js(code: String, page_origin: String, fp_prefix: String) -> String {
    let allocator = Allocator::default();
    let source_type = SourceType::default();
    let ret = Parser::new(&allocator, &code, source_type).parse();
    
    let mut rewriter = Rewriter::new(&code, &page_origin, &fp_prefix);
    rewriter.visit_program(&ret.program);
    
    if rewriter.spans.is_empty() {
        return code;
    }
    
    // Sort descending so replacements don't shift positions
    rewriter.spans.sort_by(|a, b| b.start.cmp(&a.start));
    
    let mut result = code;
    for span in rewriter.spans {
        let start = span.start as usize;
        let end = span.end as usize;
        
        let before = &result[..start];
        let after = &result[end..];
        let original_slice = &code[start..end];
        
        // Preserve quotes
        let final_replacement = if original_slice.starts_with('"') && original_slice.ends_with('"') {
            format!("\"{}\"", span.replacement)
        } else if original_slice.starts_with('\'') && original_slice.ends_with('\'') {
            format!("'{}'", span.replacement)
        } else if original_slice.starts_with('`') && original_slice.ends_with('`') {
            format!("`{}`", span.replacement)
        } else {
            span.replacement
        };
        
        result = format!("{}{}{}", before, final_replacement, after);
    }
    
    result
}
