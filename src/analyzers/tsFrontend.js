import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.ts_frontend.categories.map((c) => c.id);

/** React / DOM frontend rules. Heuristic, regex-based. */
export function analyseTsFrontendLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
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

  // ── Security ──
  const evalUse = lineMatches(content, /\beval\s*\(|\bnew\s+Function\s*\(/);
  if (evalUse.length) add({ ruleId: "TSF-SEC-003", category: "security", severity: "critical",
    title: "Dynamic code execution", description: `eval()/new Function() executes strings as code (line ${evalUse[0]}).`, impact: "Any attacker-controlled string becomes executable code in the user's session.",
    fix: `// Before\nconst value = eval(expression);\n// After\nconst value = SAFE_OPS[expression]?.() ?? null;`, line: evalUse[0], reference: "OWASP Code Injection" });

  const hardSecret = lineMatches(content, /\b(?:api[-_]?key|password|secret|access[-_]?token|auth[-_]?token|client[-_]?secret)\s*[:=]\s*["'`][^"'`\s]{8,}["'`]/i)
    .filter((ln) => !/process\.env|import\.meta\.env|getenv/.test(lines[ln - 1] || ""));
  if (hardSecret.length) add({ ruleId: "TSF-SEC-004", category: "security", severity: "critical",
    title: "Hardcoded credential in client code", description: `A literal key/password/token is assigned on line ${hardSecret[0]}.`, impact: "Bundled client code is public; the credential is readable by anyone loading the app.",
    fix: `const apiKey = import.meta.env.VITE_PUBLIC_API_KEY; // non-secret, injected at build time`, line: hardSecret[0], reference: "OWASP Secrets Management" });

  // ── Hooks ──
  const asyncEffect = lineMatches(content, /useEffect\s*\(\s*async\b/);
  if (asyncEffect.length) add({ ruleId: "TSF-HOOK-003", category: "hooks", severity: "warning",
    title: "async function passed to useEffect", description: `useEffect receives an async callback on line ${asyncEffect[0]}; React treats the returned Promise as a cleanup function.`, impact: "Cleanup never runs and React logs a warning; unmounted components can still set state.",
    fix: `useEffect(() => {\n  let active = true;\n  (async () => {\n    const data = await load();\n    if (active) setData(data);\n  })();\n  return () => { active = false; };\n}, [load]);`, line: asyncEffect[0], reference: "https://react.dev/reference/react/useEffect" });

  const effectStarts = lineMatches(content, /useEffect\s*\(/);
  const noCleanup = effectStarts.filter((ln) => {
    const win = lines.slice(ln - 1, ln + 24);
    const endIdx = win.findIndex((l, i) => i > 0 && /^\s*\}\s*(?:,\s*\[[^\]]*\])?\s*\)\s*;?\s*$/.test(l));
    const body = (endIdx === -1 ? win : win.slice(0, endIdx + 1)).join("\n");
    const subscribes = /addEventListener\s*\(|setInterval\s*\(|\.subscribe\s*\(|new\s+WebSocket\s*\(|new\s+(?:Resize|Intersection|Mutation)Observer\s*\(/.test(body);
    return subscribes && !/\breturn\b/.test(body);
  });
  if (noCleanup.length) add({ ruleId: "TSF-HOOK-004", category: "hooks", severity: "warning",
    title: "Effect subscribes without cleanup", description: `The effect at line ${noCleanup[0]} registers a listener/interval/observer but returns no cleanup function.`, impact: "Handlers accumulate on every re-render and keep running after unmount — memory leaks and duplicate work.",
    fix: `useEffect(() => {\n  const id = setInterval(tick, 1000);\n  return () => clearInterval(id);\n}, [tick]);`, line: noCleanup[0], reference: "https://react.dev/reference/react/useEffect#connecting-to-an-external-system" });

  const stateNames = [...content.matchAll(/const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*set[\w$]*\s*\]\s*=\s*useState/g)].map((m) => m[1]);
  const mutatedState = stateNames.length
    ? lineMatches(content, new RegExp(`\\b(?:${stateNames.join("|")})\\s*(?:\\.(?:push|pop|shift|unshift|splice|sort|reverse)\\s*\\(|(?:\\.[\\w$]+|\\[[^\\]]+\\])\\s*=(?!=))`))
    : [];
  if (mutatedState.length) add({ ruleId: "TSF-HOOK-005", category: "hooks", severity: "critical",
    title: "State mutated directly instead of via its setter", description: `A useState value is mutated in place on line ${mutatedState[0]} rather than replaced through set*().`, impact: "React compares state by reference, so the mutation does not re-render — the UI silently shows stale data.",
    fix: `// Before\nitems.push(next);\n// After\nsetItems((prev) => [...prev, next]);`, line: mutatedState[0], reference: "https://react.dev/learn/updating-objects-in-state" });

  const propNames = new Set();
  for (const m of content.matchAll(/(?:function\s+[A-Z][\w$]*\s*\(|=\s*)\(?\s*\{([^}]{0,300})\}\s*(?::[^)]*)?\)?\s*(?:=>|\{)/g)) {
    for (const p of m[1].split(",")) {
      const name = p.split(/[:=]/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) propNames.add(name);
    }
  }
  const propState = lineMatches(content, /useState(?:<[^>]*>)?\s*\(\s*props\.[\w$]+\s*\)/)
    .concat(propNames.size
      ? lineMatches(content, new RegExp(`useState(?:<[^>]*>)?\\s*\\(\\s*(?:${[...propNames].join("|")})\\s*\\)`))
      : []);
  if (propState.length) add({ ruleId: "TSF-HOOK-006", category: "hooks", severity: "warning",
    title: "useState initialised from a prop", description: `State on line ${propState[0]} is seeded from a prop, which is only read on the first render.`, impact: "Later prop updates are ignored, so the component renders a stale copy of its parent's data.",
    fix: `// Derive instead of copying\nconst displayName = props.name;\n// …or key the component so it remounts when the prop identity changes\n<Profile key={userId} name={name} />`, line: propState[0], reference: "https://react.dev/learn/choosing-the-state-structure#avoid-duplication-in-state" });

  // ── Accessibility ──
  const iconBtnRe = /<button\b(?:(?!aria-label|aria-labelledby)[^>])*>\s*(?:\{\s*)?<(?:svg|Icon|[A-Z][\w$]*Icon)\b/g;
  const iconBtn = [...content.matchAll(iconBtnRe)].map((m) => content.slice(0, m.index).split(/\r?\n/).length);
  if (iconBtn.length) add({ ruleId: "TSF-A11Y-003", category: "accessibility", severity: "warning",
    title: "Icon-only button without an accessible name", description: `The button at line ${iconBtn[0]} contains only an icon and carries no aria-label.`, impact: "Screen readers announce it as an unlabelled button, so the action is unusable without sight.",
    fix: `<button aria-label="Delete item" onClick={onDelete}>\n  <TrashIcon aria-hidden="true" />\n</button>`, line: iconBtn[0], reference: "WCAG 4.1.2 Name, Role, Value" });

  const unlabelledInput = lineMatches(content, /<input\b(?![^>]*\b(?:aria-label|aria-labelledby|id)\s*=)(?![^>]*\btype\s*=\s*["'](?:hidden|submit|button|reset)["'])[^>]*>/i);
  if (unlabelledInput.length) add({ ruleId: "TSF-A11Y-004", category: "accessibility", severity: "warning",
    title: "Form input with no label association", description: `The <input> on line ${unlabelledInput[0]} has no id, aria-label or aria-labelledby to tie it to a label.`, impact: "Assistive tech reads an anonymous field, and clicking the visible label does not focus it.",
    fix: `<label htmlFor="email">Email</label>\n<input id="email" type="email" value={email} onChange={onChange} />`, line: unlabelledInput[0], reference: "WCAG 3.3.2 Labels or Instructions" });

  // ── Performance ──
  // An arrow that just forwards to a useCallback/useMemo-stabilised handler is the
  // idiomatic way to pass a row parameter — flagging it would fire on correct code.
  const stableHandlers = new Set(
    [...content.matchAll(/(?:const|let)\s+([\w$]+)\s*=\s*(?:useCallback|useMemo)\s*\(/g)].map((m) => m[1]),
  );
  const mapStarts = lineMatches(content, /\.map\s*\(/);
  const inlineHandlerInList = mapStarts.filter((ln) =>
    lines.slice(ln - 1, ln + 14).some((l) => {
      const m = /\bon[A-Z][\w$]*\s*=\s*\{\s*(?:\([^)]*\)|[\w$]+)\s*=>\s*([\w$]+)?/.exec(l);
      return m !== null && !(m[1] && stableHandlers.has(m[1]));
    }));
  if (inlineHandlerInList.length) add({ ruleId: "TSF-PER-002", category: "performance", severity: "info",
    title: "Inline arrow handler inside a list render", description: `The .map() starting at line ${inlineHandlerInList[0]} creates a new function for every row on every render.`, impact: "Every child gets a fresh prop identity, defeating memoisation and re-rendering the whole list.",
    fix: `const handleSelect = useCallback((id: string) => select(id), [select]);\nitems.map((it) => <Row key={it.id} id={it.id} onSelect={handleSelect} />)`, line: inlineHandlerInList[0], reference: "https://react.dev/reference/react/useCallback" });

  const inlineObjProp = lineMatches(content, /\s[a-zA-Z][\w-]*\s*=\s*\{\{/);
  if (inlineObjProp.length) add({ ruleId: "TSF-PER-003", category: "performance", severity: "info",
    title: "Inline object literal passed as a prop", description: `An object literal is constructed inline as a prop on line ${inlineObjProp[0]}.`, impact: "A new reference each render breaks React.memo and shallow prop comparison in the child.",
    fix: `const rowStyle = useMemo(() => ({ padding: 8 }), []);\n<Row style={rowStyle} />`, line: inlineObjProp[0], reference: "https://react.dev/reference/react/memo" });

  const oversized = lines.length > 300;
  if (oversized) add({ ruleId: "TSF-PER-004", category: "performance", severity: "info",
    title: "Oversized component file", description: `${filename} is ${lines.length} lines long.`, impact: "Large files re-render as a unit and are hard to memoise, test, or code-split.",
    fix: "Extract sub-components and hooks into their own modules, then lazy-load the heavy branches.", line: null, reference: "Team standards" });

  // ── Standards ──
  const dbg = lineMatches(content, /\bdebugger\b/);
  if (dbg.length) add({ ruleId: "TSF-STD-003", category: "standards", severity: "warning",
    title: "debugger statement committed", description: `A debugger statement remains on line ${dbg[0]}.`, impact: "Execution halts whenever devtools are open, and the statement ships to production builds.",
    fix: "Remove the debugger statement before committing.", line: dbg[0] });

  const blockingDialog = lineMatches(content, /\b(?:window\.)?(?:alert|confirm)\s*\(/);
  if (blockingDialog.length) add({ ruleId: "TSF-STD-004", category: "standards", severity: "info",
    title: "Native blocking dialog", description: `alert()/confirm() is called on line ${blockingDialog[0]}.`, impact: "Blocks the main thread, cannot be styled or tested, and is suppressed in some embedded contexts.",
    fix: `setConfirmOpen(true); // render an accessible <Dialog /> instead`, line: blockingDialog[0] });

  // ── Type safety ──
  const tsIgnore = lineMatches(content, /@ts-(?:ignore|nocheck)\b/);
  if (tsIgnore.length) add({ ruleId: "TSF-TYP-002", category: "type_safety", severity: "warning",
    title: "@ts-ignore / @ts-nocheck suppression", description: `Type checking is suppressed on line ${tsIgnore[0]}.`, impact: "Silences the error permanently, including new errors introduced later on the same line.",
    fix: `// @ts-expect-error - remove once upstream types ship (TICKET-123)`, line: tsIgnore[0], reference: "https://www.typescriptlang.org/tsconfig#allowJs" });

  const nonNull = lineMatches(content, /[\w$)\]]!\s*\./);
  if (nonNull.length) add({ ruleId: "TSF-TYP-003", category: "type_safety", severity: "info",
    title: "Non-null assertion operator", description: `A ! assertion overrides the null check on line ${nonNull[0]}.`, impact: "The compiler stops guarding the access, so a real null becomes a runtime TypeError.",
    fix: `// Before\nconst name = user!.name;\n// After\nif (!user) return null;\nconst name = user.name;`, line: nonNull[0], reference: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#non-null-assertion-operator-postfix-" });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { anyUsages: anyUse.length, imgsWithoutAlt: imgNoAlt.length, effectsNoDeps: effectNoDeps.length, xssRisks: dxss.length },
    summary: `Frontend scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
