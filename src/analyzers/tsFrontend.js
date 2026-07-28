import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.ts_frontend.categories.map((c) => c.id);

/** React / DOM frontend rules. Heuristic, regex-based. */
export function analyseTsFrontendLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const add = (r) => pushFinding(findings, r, disabled);

  const dxss = lineMatches(content, /dangerouslySetInnerHTML|\.innerHTML\s*=/);
  if (dxss.length) add({ ruleId: "TSF-SEC-001", category: "security", severity: "warning",
    title: "Unsanitised HTML injection", description: "dangerouslySetInnerHTML / innerHTML= with dynamic data risks XSS.", impact: "Attacker markup executes in the browser.",
    fix: "Render text, or sanitise with DOMPurify before injecting HTML.", line: dxss[0], reference: "OWASP XSS" });

  const blank = lineMatches(content, /target\s*=\s*["']_blank["']/).filter((ln) => !/rel\s*=/.test(content.split(/\r?\n/)[ln - 1] || ""));
  if (blank.length) add({ ruleId: "TSF-SEC-002", category: "security", severity: "warning",
    title: "target=\"_blank\" without rel", description: "Opens a reverse-tabnabbing vector.", impact: "The new page can control the opener.",
    fix: `<a href={url} target="_blank" rel="noopener noreferrer">`, line: blank[0] });

  const effectNoDeps = lineMatches(content, /useEffect\s*\(\s*\(\s*\)\s*=>/).filter((ln) => {
    const win = content.split(/\r?\n/).slice(ln - 1, ln + 12).join("\n");
    return !/\}\s*,\s*\[/.test(win);
  });
  if (effectNoDeps.length) add({ ruleId: "TSF-HOOK-001", category: "hooks", severity: "warning",
    title: "useEffect without dependency array", description: "An effect with no deps array runs after every render.", impact: "Wasted work, loops, or duplicate requests.",
    fix: `useEffect(() => { /* ... */ }, [deps]);`, line: effectNoDeps[0], reference: "https://react.dev/reference/react/useEffect" });

  const idxKey = lineMatches(content, /key\s*=\s*\{\s*(i|idx|index)\s*\}/);
  if (idxKey.length) add({ ruleId: "TSF-HOOK-002", category: "hooks", severity: "info",
    title: "Array index as React key", description: "Index keys break identity when the list reorders.", impact: "Wrong state/DOM reuse on updates.",
    fix: `items.map((it) => <Row key={it.id} … />)`, line: idxKey[0] });

  const imgNoAlt = lineMatches(content, /<img\b(?![^>]*\balt=)[^>]*>/i);
  if (imgNoAlt.length) add({ ruleId: "TSF-A11Y-001", category: "accessibility", severity: "warning",
    title: "<img> without alt", description: "Images need alt text (empty alt for decorative).", impact: "Inaccessible to screen readers.",
    fix: `<img src={src} alt="Descriptive text" />`, line: imgNoAlt[0], reference: "WCAG 1.1.1" });

  const divClick = lineMatches(content, /<(div|span)\b[^>]*onClick=/i).filter((ln) => !/role=/.test(content.split(/\r?\n/)[ln - 1] || ""));
  if (divClick.length) add({ ruleId: "TSF-A11Y-002", category: "accessibility", severity: "info",
    title: "Click handler on non-interactive element", description: "onClick on a div/span isn't keyboard-accessible.", impact: "Keyboard/AT users can't activate it.",
    fix: "Use a <button>, or add role + keyboard handlers.", line: divClick[0] });

  const anyUse = lineMatches(content, /:\s*any\b|as\s+any\b/);
  if (anyUse.length) add({ ruleId: "TSF-TYP-001", category: "type_safety", severity: "warning",
    title: "Use of any", description: "any disables type checking for props/state.", impact: "Runtime bugs in components.",
    fix: "Type props/state explicitly or use unknown + narrowing.", line: anyUse[0] });

  const domInReact = lineMatches(content, /document\.(getElementById|querySelector)\s*\(/);
  if (domInReact.length) add({ ruleId: "TSF-PER-001", category: "performance", severity: "info",
    title: "Direct DOM access in component", description: "Reaching into the DOM bypasses React's model.", impact: "Fights the virtual DOM; subtle bugs.",
    fix: "Use refs (useRef) or state instead of document queries.", line: domInReact[0] });

  const clog = lineMatches(content, /console\.(log|debug)\s*\(/);
  if (clog.length) add({ ruleId: "TSF-STD-001", category: "standards", severity: "info",
    title: "console logging", description: "Leftover console.* ships to production.", impact: "Noise; possible data leak.",
    fix: "Remove or gate behind a debug flag.", line: clog[0] });

  const todo = lineMatches(content, /\/\/\s*(TODO|FIXME)/i);
  if (todo.length) add({ ruleId: "TSF-STD-002", category: "standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.", impact: "Unfinished logic ships.",
    fix: "Resolve or link to an issue.", line: todo[0] });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { anyUsages: anyUse.length, imgsWithoutAlt: imgNoAlt.length, effectsNoDeps: effectNoDeps.length, xssRisks: dxss.length },
    summary: `Frontend scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
