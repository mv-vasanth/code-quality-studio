import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.python_frontend.categories.map((c) => c.id);

/** Django / Jinja template rules. Heuristic, regex-based. */
export function analysePythonFrontendLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const add = (r) => pushFinding(findings, r, disabled);

  const unsafe = lineMatches(content, /\|\s*safe\b|autoescape\s+off|\{%\s*autoescape\s+false|mark_safe\s*\(/i);
  if (unsafe.length) add({ ruleId: "PYF-SEC-001", category: "security", severity: "warning",
    title: "Unescaped template output", description: "|safe, mark_safe, or autoescape off renders raw HTML.", impact: "XSS if the value contains user input.",
    fix: "Leave autoescaping on; sanitise server-side if raw HTML is truly needed.", line: unsafe[0], reference: "OWASP XSS" });

  const forms = lineMatches(content, /<form\b[^>]*method\s*=\s*["']post["']/i);
  const hasCsrf = /csrf_token|csrf_field|\{\{\s*csrf/i.test(content);
  if (forms.length && !hasCsrf) add({ ruleId: "PYF-SEC-002", category: "security", severity: "warning",
    title: "POST form without CSRF token", description: "A POST form has no {% csrf_token %}.", impact: "Cross-site request forgery.",
    fix: `<form method="post">{% csrf_token %} … </form>`, line: forms[0], reference: "OWASP CSRF" });

  const imgNoAlt = lineMatches(content, /<img\b(?![^>]*\balt=)[^>]*>/i);
  if (imgNoAlt.length) add({ ruleId: "PYF-A11Y-001", category: "accessibility", severity: "warning",
    title: "<img> without alt", description: "Images need alt text.", impact: "Inaccessible to screen readers.",
    fix: `<img src="…" alt="Descriptive text">`, line: imgNoAlt[0], reference: "WCAG 1.1.1" });

  const inlineHandler = lineMatches(content, /\son(click|mouseover|load|error)\s*=\s*["']/i);
  if (inlineHandler.length) add({ ruleId: "PYF-STD-001", category: "standards", severity: "info",
    title: "Inline event handler", description: "Inline on* handlers hinder CSP and separation of concerns.", impact: "Weaker CSP; harder maintenance.",
    fix: "Attach listeners in a script file instead.", line: inlineHandler[0] });

  const todo = lineMatches(content, /\{#\s*(TODO|FIXME)|<!--\s*(TODO|FIXME)/i);
  if (todo.length) add({ ruleId: "PYF-STD-002", category: "standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.", impact: "Unfinished markup ships.",
    fix: "Resolve or link to an issue.", line: todo[0] });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { unescapedOutputs: unsafe.length, postFormsNoCsrf: forms.length && !hasCsrf ? 1 : 0, imgsWithoutAlt: imgNoAlt.length },
    summary: `Template scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
