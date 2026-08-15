use wasm_bindgen::prelude::*;
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::{SourceType, Span};
use oxc_ast::ast::*;
use oxc_ast::visit::walk::*;
use oxc_ast::Visit;
use std::collections::HashSet;

// =====================
// GLOBAL CONSTANTS
// =====================

const GLOBAL_OBJS: &[&str] = &["window", "self", "globalThis", "parent", "top", "document"];
const LOCATION_PROPS: &[&str] = &["location", "href", "protocol", "host", "hostname", "port", "pathname", "search", "hash", "origin", "assign", "replace", "reload"];
const URL_ATTRS: &[&str] = &["src", "href", "action", "url", "poster", "background", "formAction", "data", "srcdoc"];

fn looks_like_url(val: &str) -> bool {
    if val.starts_with("data:") || val.starts_with("#") || val.starts_with("javascript:") || val.starts_with("blob:") {
        return false;
    }
    val.starts_with("http://") || val.starts_with("https://")
        || (val.starts_with("//") && val.len() > 2)
        || (val.starts_with("/") && val.len() > 1)
}

fn rewrite_url(val: &str, page_origin: &str, fp_prefix: &str) -> Option<String> {
    if val.starts_with(fp_prefix) { return None; }
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

fn rewrite_ws(val: &str) -> Option<String> {
    if val.starts_with("ws://") || val.starts_with("wss://") {
        return Some(format!("ws://localhost:3000/wisp/{}", val));
    }
    None
}

// =====================
// SPAN TRACKING
// =====================

#[derive(Debug, Clone)]
struct ReplaceSpan {
    start: u32,
    end: u32,
    replacement: String,
    priority: i32, // Higher = outer/wider spans processed first
}

// =====================
// SCOPE
// =====================

#[derive(Debug, Default, Clone)]
struct Scope {
    vars: HashSet<String>,
}

impl Scope {
    fn insert(&mut self, name: &str) { self.vars.insert(name.to_string()); }
    fn contains(&self, name: &str) -> bool { self.vars.contains(name) }
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
            code, spans: Vec::new(), page_origin, fp_prefix,
            scope_stack: vec![Scope::new()],
        }
    }

    fn current_scope(&self) -> &Scope { self.scope_stack.last().unwrap() }
    fn is_shadowed(&self, name: &str) -> bool { self.scope_stack.iter().any(|s| s.contains(name)) }
    fn is_global(&self, name: &str) -> bool { GLOBAL_OBJS.contains(&name) && !self.is_shadowed(name) }

    fn add_span(&mut self, span: Span, replacement: String, priority: i32) {
        self.spans.push(ReplaceSpan { start: span.start, end: span.end, replacement, priority });
    }

    fn try_url(&mut self, val: &str, span: Span) {
        if let Some(rep) = rewrite_url(val, self.page_origin, self.fp_prefix) {
            self.add_span(span, rep, 0);
        }
    }

    fn try_ws(&mut self, val: &str, span: Span) {
        if let Some(rep) = rewrite_ws(val) {
            self.add_span(span, rep, 0);
        }
    }

    // Check if expression is a reference to a global object
    fn expr_is_global(&self, expr: &Expression) -> bool {
        match expr {
            Expression::Identifier(ident) => self.is_global(ident.name.as_str()),
            Expression::MemberExpression(member) => self.expr_is_global(&member.object),
            Expression::MetaProperty(meta) => meta.meta.name.as_str() == "import" && meta.property.name.as_str() == "meta",
            _ => false,
        }
    }

    // Get chain of property names from a member expression
    fn member_chain(&self, expr: &MemberExpression) -> Vec<String> {
        let mut parts = Vec::new();
        self.collect_member(expr, &mut parts);
        parts
    }

    fn collect_member(&self, expr: &MemberExpression, parts: &mut Vec<String>) {
        match &expr.object {
            Expression::Identifier(ident) => parts.push(ident.name.to_string()),
            Expression::MemberExpression(inner) => self.collect_member(inner, parts),
            Expression::ThisExpression(_) => parts.push("this".to_string()),
            _ => {}
        }
        match &expr.property {
            MemberExpressionProperty::Identifier(ident) => parts.push(ident.name.to_string()),
            MemberExpressionProperty::Expression(Expression::StringLiteral(lit)) => parts.push(lit.value.to_string()),
            _ => {}
        }
    }

    // Check if this member expr accesses a sensitive property on a global
    fn is_sensitive_access(&self, expr: &MemberExpression) -> bool {
        let chain = self.member_chain(expr);
        if chain.len() < 2 { return false; }
        let first = chain[0].as_str();
        let last = chain.last().unwrap().as_str();
        self.is_global(first) && (LOCATION_PROPS.contains(&last) || URL_ATTRS.contains(&last))
    }

    // Check if bare identifier "location" refers to window.location
    fn is_bare_location(&self, name: &str) -> bool {
        name == "location" && !self.is_shadowed("location")
    }

    // Build __fp$get(...) wrapper string from a member chain
    fn build_get_wrapper(&self, chain: &[String]) -> String {
        if chain.len() < 2 { return chain.join("."); }
        let mut result = format!("__fp$get({},\"{}\")", chain[0], chain[1]);
        for i in 2..chain.len() {
            result = format!("__fp$get({},\"{}\")", result, chain[i]);
        }
        result
    }

    // Recursively rewrite JS inside a string (for eval/Function)
    fn rewrite_nested(&self, code: &str) -> String {
        let allocator = Allocator::default();
        let ret = Parser::new(&allocator, code, SourceType::default()).parse();
        let mut nested = Rewriter::new(code, self.page_origin, self.fp_prefix);
        nested.visit_program(&ret.program);
        if nested.spans.is_empty() { return code.to_string(); }
        nested.spans.sort_by(|a, b| b.start.cmp(&a.start));
        let mut result = code.to_string();
        for span in nested.spans {
            let s = span.start as usize;
            let e = span.end as usize;
            result = format!("{}{}{}", &result[..s], span.replacement, &result[e..]);
        }
        result
    }
}

// =====================
// PATTERN COLLECTION
// =====================

impl<'a> Rewriter<'a> {
    fn collect_pattern(&mut self, pat: &BindingPatternKind) {
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
                            self.collect_pattern(&pat.binding.kind);
                        }
                    }
                }
            }
            BindingPatternKind::ArrayPattern(arr) => {
                for elem in &arr.elements {
                    if let Some(el) = elem { self.collect_pattern(&el.kind); }
                }
            }
            BindingPatternKind::AssignmentPattern(assign) => {
                self.collect_pattern(&assign.left.kind);
            }
        }
    }
}

// =====================
// AST VISITOR
// =====================

impl<'a, 'b> Visit<'a> for Rewriter<'b> {
    // --- SCOPE MANAGEMENT ---
    fn visit_function(&mut self, func: &Function<'a>, flags: Option<oxc_ast::ast::FunctionFlags>) {
        self.scope_stack.push(Scope::new());
        for param in &func.params.items {
            if let Some(pat) = &param.pattern.kind { self.collect_pattern(pat); }
        }
        walk_function(self, func, flags);
        self.scope_stack.pop();
    }

    fn visit_arrow_function_expression(&mut self, expr: &ArrowFunctionExpression<'a>) {
        self.scope_stack.push(Scope::new());
        for param in &expr.params.items {
            if let Some(pat) = &param.pattern.kind { self.collect_pattern(pat); }
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
        if let Some(left) = &stmt.left {
            match left {
                ForStatementLeft::VariableDeclaration(decl) => {
                    for d in &decl.declarations { self.collect_pattern(&d.id.kind); }
                }
                ForStatementLeft::AssignmentTarget(target) => {
                    if let AssignmentTarget::AssignmentTargetIdentifier(ident) = target {
                        self.current_scope().insert(ident.name.as_str());
                    }
                }
                _ => {}
            }
        }
        walk_for_in_statement(self, stmt);
        self.scope_stack.pop();
    }

    fn visit_for_of_statement(&mut self, stmt: &ForOfStatement<'a>) {
        self.scope_stack.push(Scope::new());
        if let Some(left) = &stmt.left {
            match left {
                ForStatementLeft::VariableDeclaration(decl) => {
                    for d in &decl.declarations { self.collect_pattern(&d.id.kind); }
                }
                ForStatementLeft::AssignmentTarget(target) => {
                    if let AssignmentTarget::AssignmentTargetIdentifier(ident) = target {
                        self.current_scope().insert(ident.name.as_str());
                    }
                }
                _ => {}
            }
        }
        walk_for_of_statement(self, stmt);
        self.scope_stack.pop();
    }

    fn visit_catch_clause(&mut self, clause: &CatchClause<'a>) {
        self.scope_stack.push(Scope::new());
        if let Some(param) = &clause.param { self.collect_pattern(&param.kind); }
        walk_catch_clause(self, clause);
        self.scope_stack.pop();
    }

    fn visit_variable_declarator(&mut self, decl: &VariableDeclarator<'a>) {
        self.collect_pattern(&decl.id.kind);
        walk_variable_declarator(self, decl);
    }

    // --- STRING LITERALS ---
    fn visit_string_literal(&mut self, lit: &StringLiteral<'a>) {
        let val = lit.value.as_str();
        if looks_like_url(val) { self.try_url(val, lit.span); }
        else { self.try_ws(val, lit.span); }
    }

    // --- TEMPLATE LITERALS ---
    fn visit_template_element(&mut self, elem: &TemplateElement<'a>) {
        if let Some(ref cooked) = elem.value.cooked {
            let val = cooked.as_str();
            if looks_like_url(val) { self.try_url(val, elem.span); }
        }
    }

    // --- IMPORT / EXPORT ---
    fn visit_import_declaration(&mut self, decl: &ImportDeclaration<'a>) {
        self.try_url(decl.source.value.as_str(), decl.source.span);
        walk_import_declaration(self, decl);
    }

    fn visit_export_named_declaration(&mut self, decl: &ExportNamedDeclaration<'a>) {
        if let Some(source) = &decl.source {
            self.try_url(source.value.as_str(), source.span);
        }
        walk_export_named_declaration(self, decl);
    }

    fn visit_export_all_declaration(&mut self, decl: &ExportAllDeclaration<'a>) {
        self.try_url(decl.source.value.as_str(), decl.source.span);
        walk_export_all_declaration(self, decl);
    }

    // --- CALL EXPRESSIONS ---
    fn visit_call_expression(&mut self, expr: &CallExpression<'a>) {
        // fetch(url)
        if let Expression::Identifier(ident) = &expr.callee {
            if ident.name.as_str() == "fetch" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    self.try_url(lit.value.as_str(), lit.span);
                }
            }
        }

        // import(url)
        if expr.callee.is_import() && expr.arguments.len() > 0 {
            if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                self.try_url(lit.value.as_str(), lit.span);
            }
        }

        // eval("...")
        if let Expression::Identifier(ident) = &expr.callee {
            if ident.name.as_str() == "eval" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    let rewritten = self.rewrite_nested(lit.value.as_str());
                    if rewritten != lit.value.as_str() {
                        self.add_span(lit.span, rewritten, 5);
                    }
                }
            }
        }

        // (0, eval)("...") — indirect eval
        if let Expression::SequenceExpression(seq) = &expr.callee {
            if let Some(Expression::Identifier(ident)) = seq.expressions.last() {
                if ident.name.as_str() == "eval" && expr.arguments.len() > 0 {
                    if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                        let rewritten = self.rewrite_nested(lit.value.as_str());
                        if rewritten != lit.value.as_str() {
                            self.add_span(lit.span, rewritten, 5);
                        }
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

            if name == "WebSocket" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    self.try_ws(lit.value.as_str(), lit.span);
                }
            }

            if name == "Worker" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    self.try_url(lit.value.as_str(), lit.span);
                }
            }

            if name == "EventSource" && expr.arguments.len() > 0 {
                if let Expression::StringLiteral(lit) = &expr.arguments[0].expression {
                    self.try_url(lit.value.as_str(), lit.span);
                }
            }

            if name == "Function" && expr.arguments.len() > 0 {
                if let Some(arg) = expr.arguments.last() {
                    if let Expression::StringLiteral(lit) = &arg.expression {
                        let rewritten = self.rewrite_nested(lit.value.as_str());
                        if rewritten != lit.value.as_str() {
                            self.add_span(lit.span, rewritten, 5);
                        }
                    }
                }
            }
        }

        walk_new_expression(self, expr);
    }

    // --- MEMBER EXPRESSIONS (DPSC GET) ---
    fn visit_member_expression(&mut self, expr: &MemberExpression<'a>) {
        if self.is_sensitive_access(expr) {
            let chain = self.member_chain(expr);
            let wrapper = self.build_get_wrapper(&chain);
            // Priority 10 = high, outer expressions processed first
            self.add_span(expr.span, wrapper, 10);
            // Don't visit children — we've covered this entire expression
            return;
        }
        walk_member_expression(self, expr);
    }

    // --- ASSIGNMENT EXPRESSIONS (DPSC SET) ---
    fn visit_assignment_expression(&mut self, expr: &AssignmentExpression<'a>) {
        // Case 1: window.location = "..."
        if let AssignmentTarget::SimpleAssignmentTarget(SimpleAssignmentTarget::MemberExpression(member)) = &expr.left {
            if self.is_sensitive_access(member) {
                let chain = self.member_chain(member);
                if chain.len() >= 2 {
                    let obj = if chain.len() == 2 {
                        chain[0].clone()
                    } else {
                        self.build_get_wrapper(&chain[..chain.len()-1])
                    };
                    let prop = chain.last().unwrap();
                    
                    // Rewrite URL in right side if it's a string
                    let right_str = match &expr.right {
                        Expression::StringLiteral(lit) => {
                            let val = lit.value.as_str();
                            if looks_like_url(val) {
                                rewrite_url(val, self.page_origin, self.fp_prefix).unwrap_or(val.to_string())
                            } else {
                                val.to_string()
                            }
                        }
                        _ => self.code[expr.right.span().start as usize..expr.right.span().end as usize].to_string()
                    };
                    
                    let replacement = format!("__fp$set({},\"\",{})", obj, prop, right_str);
                    self.add_span(expr.span, replacement, 10);
                    return; // Don't visit children
                }
            }
        }

        // Case 2: location = "..." (bare identifier, implicit window.location)
        if let AssignmentTarget::AssignmentTargetIdentifier(target) = &expr.left {
            if self.is_bare_location(target.name.as_str()) {
                let right_str = match &expr.right {
                    Expression::StringLiteral(lit) => {
                        let val = lit.value.as_str();
                        if looks_like_url(val) {
                            rewrite_url(val, self.page_origin, self.fp_prefix).unwrap_or(val.to_string())
                        } else {
                            val.to_string()
                        }
                    }
                    _ => self.code[expr.right.span().start as usize..expr.right.span().end as usize].to_string()
                };
                let replacement = format!("__fp$set(window,\"location\",{})", right_str);
                self.add_span(expr.span, replacement, 10);
                return;
            }
        }

        walk_assignment_expression(self, expr);
    }

    // --- IDENTIFIER REFERENCES (bare location) ---
    fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'a>) {
        // If bare `location` is used as a value (not assignment target), wrap it
        if self.is_bare_location(ident.name.as_str()) {
            self.add_span(ident.span, "__fp$get(window,\"location\")".to_string(), 10);
        }
    }

    // --- OBJECT PATTERN DESTRUCTURE (escape patch) ---
    fn visit_object_pattern(&mut self, pat: &ObjectPattern<'a>) {
        // Detect: const { location } = window; or const { location: x } = window;
        // We try to find if the source is a global reference
        // This is tricky with byte spans — we'd need to replace the entire declarator
        // For now, we let it through (Scramjet handles this with more complex AST transforms)
        walk_object_pattern(self, pat);
    }
}

// =====================
// FILTER OVERLAPPING SPANS
// =====================

fn filter_spans(mut spans: Vec<ReplaceSpan>) -> Vec<ReplaceSpan> {
    // Sort by priority desc, then by length desc (outer first)
    spans.sort_by(|a, b| {
        b.priority.cmp(&a.priority)
            .then_with(|| (b.end - b.start).cmp(&(a.end - a.start)))
    });
    
    let mut result = Vec::new();
    let mut covered = Vec::new(); // ranges that are already covered
    
    for span in spans {
        let s = span.start;
        let e = span.end;
        let mut overlaps = false;
        for (cs, ce) in &covered {
            if s < *ce && e > *cs { // overlap
                overlaps = true;
                break;
            }
        }
        if !overlaps {
            covered.push((s, e));
            result.push(span);
        }
    }
    
    // Sort by start descending for replacement
    result.sort_by(|a, b| b.start.cmp(&a.start));
    result
}

// =====================
// WASM ENTRY
// =====================

#[wasm_bindgen]
pub fn rewrite_js(code: String, page_origin: String, fp_prefix: String) -> String {
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, &code, SourceType::default()).parse();
    
    let mut rewriter = Rewriter::new(&code, &page_origin, &fp_prefix);
    rewriter.visit_program(&ret.program);
    
    if rewriter.spans.is_empty() {
        return code;
    }
    
    let spans = filter_spans(rewriter.spans);
    let mut result = code;
    
    for span in spans {
        let s = span.start as usize;
        let e = span.end as usize;
        let before = &result[..s];
        let after = &result[e..];
        let original = &code[s..e];
        
        // Preserve quotes
        let replacement = if original.starts_with('"') && original.ends_with('"') {
            format!("\"{}\"", span.replacement)
        } else if original.starts_with('\'') && original.ends_with('\'') {
            format!("'{}'", span.replacement)
        } else if original.starts_with('`') && original.ends_with('`') {
            format!("`{}`", span.replacement)
        } else {
            span.replacement
        };
        
        result = format!("{}{}{}", before, replacement, after);
    }
    
    result
}
