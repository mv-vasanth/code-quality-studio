import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, pushFinding } from "./analyzerUtils.js";

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

  const lineOf = (index) => content.slice(0, index).split(/\r?\n/).length;

  const blankTarget = lineMatches(content, /<a\b(?=[^>]*target\s*=\s*["']_blank["'])(?![^>]*rel\s*=\s*["'][^"']*noopener)[^>]*>/i);
  if (blankTarget.length) add({ ruleId: "PYF-SEC-003", category: "security", severity: "warning",
    title: 'target="_blank" without rel="noopener"', description: `Link at line ${blankTarget[0]} opens a new tab without rel="noopener".`, impact: "The opened page can rewrite window.opener.location and phish the user (reverse tabnabbing).",
    fix: `<a href="{{ url }}" target="_blank" rel="noopener noreferrer">Details</a>`, line: blankTarget[0], reference: "https://owasp.org/www-community/attacks/Reverse_Tabnabbing" });

  const noSri = lineMatches(content, /<script\b(?=[^>]*\bsrc\s*=\s*["']https?:\/\/)(?![^>]*\bintegrity\s*=)[^>]*>/i);
  if (noSri.length) add({ ruleId: "PYF-SEC-004", category: "security", severity: "warning",
    title: "Third-party script without subresource integrity", description: `Remote <script> at line ${noSri[0]} has no integrity/crossorigin attributes.`, impact: "A compromised CDN can serve arbitrary JavaScript into every page.",
    fix: `<script src="https://cdn.example.com/lib.js" integrity="sha384-…" crossorigin="anonymous"></script>`, line: noSri[0], reference: "https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity" });

  let scriptInterp = 0;
  for (const m of content.matchAll(/<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    // Only a real JS context is exploitable — application/json, text/template etc. are data blocks.
    if (type && !/javascript|module|ecmascript/i.test(type[1])) continue;
    if (/\{\{|\{%/.test(m[2])) { scriptInterp = lineOf(m.index + m[0].indexOf(m[2])); break; }
  }
  if (scriptInterp) add({ ruleId: "PYF-SEC-005", category: "security", severity: "critical",
    title: "Template variable interpolated into inline JavaScript", description: `Inline <script> near line ${scriptInterp} embeds template output directly in JS.`, impact: "HTML escaping does not protect a JS string context, so user data can break out and execute.",
    fix: `<script id="cfg" type="application/json">{{ data|json_script_safe }}</script>\n<script>const cfg = JSON.parse(document.getElementById("cfg").textContent);</script>`, line: scriptInterp, reference: "https://owasp.org/www-community/attacks/xss/" });

  let unlabelled = 0;
  for (const m of content.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = m[0];
    if (/type\s*=\s*["'](?:hidden|submit|button|reset|image)["']/i.test(tag)) continue;
    if (/\b(?:aria-label|aria-labelledby|title|placeholder)\s*=/i.test(tag)) continue;
    const before = content.slice(0, m.index);
    // Implicit labelling: <label>Email <input …></label>
    if (before.lastIndexOf("<label") > before.lastIndexOf("</label")) continue;
    const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (id && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${id[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(content)) continue;
    unlabelled = lineOf(m.index); break;
  }
  if (unlabelled) add({ ruleId: "PYF-A11Y-002", category: "accessibility", severity: "warning",
    title: "Form control without an associated label", description: `Control at line ${unlabelled} has no <label for=…>, aria-label or aria-labelledby.`, impact: "Screen-reader users hear an unnamed field and cannot tell what to enter.",
    fix: `<label for="email">Email</label>\n<input id="email" name="email" type="email">`, line: unlabelled, reference: "https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html" });

  const htmlTag = lineMatches(content, /<html\b(?![^>]*\blang\s*=)[^>]*>/i);
  if (htmlTag.length) add({ ruleId: "PYF-A11Y-003", category: "accessibility", severity: "warning",
    title: "<html> without a lang attribute", description: `The root <html> element at line ${htmlTag[0]} declares no language.`, impact: "Screen readers pick the wrong pronunciation rules and translation tooling misfires.",
    fix: `<html lang="en">`, line: htmlTag[0], reference: "https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html" });

  const positiveTabindex = lineMatches(content, /tabindex\s*=\s*["']?[1-9]/i);
  if (positiveTabindex.length) add({ ruleId: "PYF-A11Y-004", category: "accessibility", severity: "warning",
    title: "Positive tabindex value", description: `tabindex greater than 0 at line ${positiveTabindex[0]}.`, impact: "Forces an element ahead of every natural tab stop, scrambling keyboard order for the whole page.",
    fix: `<button type="button">Save</button>  <!-- rely on DOM order; use tabindex="0" or "-1" only -->`, line: positiveTabindex[0], reference: "https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html" });

  const inlineStyle = lineMatches(content, /<[a-z][^>]*\sstyle\s*=\s*["'][^"']+["']/i);
  if (inlineStyle.length) add({ ruleId: "PYF-STD-003", category: "standards", severity: "info",
    title: "Inline style attribute", description: `Inline style at line ${inlineStyle[0]}.`, impact: "Cannot be themed or overridden, and requires 'unsafe-inline' in the style CSP directive.",
    fix: `<div class="card card--highlight">…</div>  <!-- move rules into a stylesheet -->`, line: inlineStyle[0], reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP" });

  const deprecatedLoad = lineMatches(content, /\{%\s*load\s+[^%]*\b(?:staticfiles|admin_static|future|adminmedia)\b/i);
  if (deprecatedLoad.length) add({ ruleId: "PYF-STD-004", category: "standards", severity: "warning",
    title: "Deprecated template tag library loaded", description: `{% load %} of a removed Django tag library at line ${deprecatedLoad[0]}.`, impact: "staticfiles/admin_static/future were removed in Django 3.0; the template raises TemplateSyntaxError after upgrade.",
    fix: `{% load static %}`, line: deprecatedLoad[0], reference: "https://docs.djangoproject.com/en/stable/releases/3.0/#features-removed-in-3-0" });

  const hardcodedStatic = lineMatches(content, /(?:src|href)\s*=\s*["']\/?static\//i);
  if (hardcodedStatic.length) add({ ruleId: "PYF-STD-005", category: "standards", severity: "info",
    title: "Hardcoded static asset path", description: `Asset URL written literally at line ${hardcodedStatic[0]} instead of via {% static %}.`, impact: "Breaks under a CDN, a STATIC_URL change, or hashed/cache-busted filenames.",
    fix: `<img src="{% static 'img/logo.png' %}" alt="Logo">`, line: hardcodedStatic[0], reference: "https://docs.djangoproject.com/en/stable/ref/templates/builtins/#static" });

  const deprecatedTag = lineMatches(content, /<\/?(?:center|font|marquee|blink|big|strike|frame|frameset|acronym)\b/i);
  if (deprecatedTag.length) add({ ruleId: "PYF-STD-006", category: "standards", severity: "info",
    title: "Obsolete HTML element", description: `Presentational/obsolete element at line ${deprecatedTag[0]}.`, impact: "Not in the HTML living standard; rendering is browser-dependent and assistive tech may ignore it.",
    fix: `<p class="text-center">…</p>  <!-- replace <center>/<font> with CSS -->`, line: deprecatedTag[0], reference: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element#obsolete_and_deprecated_elements" });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { unescapedOutputs: unsafe.length, postFormsNoCsrf: forms.length && !hasCsrf ? 1 : 0, imgsWithoutAlt: imgNoAlt.length },
    summary: `Template scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
