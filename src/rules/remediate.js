/**
 * Remediation agent core — the parts that do not touch the network, the disk or git,
 * so they can be tested directly.
 *
 * The CLI supplies the AI call and the file/git IO; everything about *deciding
 * whether a fix is acceptable* lives here.
 */
import { diffFindings } from "./verifyFix.js";

/** Ask for a whole corrected file, not prose — the output is applied verbatim. */
export function buildFixPrompt(filename, content, findings) {
  const targeted = findings.map(
    (f) => `- [${f.severity.toUpperCase()}] ${f.ruleId} ${f.title}${f.line ? ` (line ${f.line})` : ""}\n    ${f.description}${f.fix ? `\n    Suggested: ${f.fix.split("\n")[0]}` : ""}`,
  ).join("\n");

  return `You are fixing quality findings in a test file. Return the COMPLETE corrected file.

File: ${filename}

FINDINGS TO FIX:
${targeted}

CURRENT FILE:
\`\`\`
${content}
\`\`\`

Rules for your response:
1. Output the ENTIRE corrected file inside one fenced code block.
2. Fix ONLY the findings listed above. Do not refactor anything else.
3. Preserve all existing imports, formatting style and test names.
4. Never delete a test or an assertion to make a finding disappear.
5. If a finding cannot be fixed safely without more context, leave that code unchanged.

Output nothing except the fenced code block.`;
}

/**
 * Pull the corrected file out of a model response.
 * Returns null when the response has no usable code block — callers must treat
 * that as a failed fix rather than writing the prose to disk.
 */
export function extractCode(responseText) {
  if (!responseText) return null;
  const fences = [...responseText.matchAll(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g)];
  if (fences.length === 0) return null;
  // Longest block — models sometimes emit a short illustrative snippet first.
  const best = fences.map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
  const code = best.replace(/\s+$/, "");
  return code.length > 0 ? code : null;
}

/** Guard against a "fix" that just deletes the file's content. */
export function isSuspiciousShrink(original, proposed, threshold = 0.5) {
  const a = original.split(/\r?\n/).filter((l) => l.trim()).length;
  const b = proposed.split(/\r?\n/).filter((l) => l.trim()).length;
  if (a === 0) return false;
  return b < a * threshold;
}

/**
 * Decide whether a proposed fix should be written.
 * @returns {{accept:boolean, reason:string, diff:object|null}}
 */
export function evaluateFix({ auditFn, filename, original, proposed }) {
  if (!proposed) {
    return { accept: false, reason: "model returned no code block", diff: null };
  }
  if (proposed.trim() === original.trim()) {
    return { accept: false, reason: "model returned the file unchanged", diff: null };
  }
  if (isSuspiciousShrink(original, proposed)) {
    return { accept: false, reason: "proposed file lost more than half its lines — refusing to apply", diff: null };
  }

  const before = auditFn(filename, original);
  const after = auditFn(filename, proposed);
  const diff = diffFindings(before.findings, after.findings);

  if (!diff.improved) {
    return { accept: false, reason: diff.verdict, diff };
  }
  return { accept: true, reason: diff.verdict, diff };
}

/** Minimal unified-style diff for --dry-run output. */
export function lineDiff(original, proposed, context = 2) {
  const a = original.split(/\r?\n/);
  const b = proposed.split(/\r?\n/);
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    // find the next line that resynchronises the two sides
    let resync = -1;
    for (let k = 1; k < 40 && resync === -1; k++) {
      if (a[i + k] !== undefined && a[i + k] === b[j]) resync = k;
    }
    const removed = resync === -1 ? 1 : resync;
    let added = 0;
    if (resync === -1) {
      for (let k = 0; k < 40; k++) { if (b[j + k] !== undefined && b[j + k] === a[i + 1]) { added = k; break; } }
      if (added === 0) added = 1;
    }
    for (let k = 0; k < removed && i < a.length; k++, i++) out.push({ type: "-", line: i + 1, text: a[i] });
    for (let k = 0; k < added && j < b.length; k++, j++) out.push({ type: "+", line: j + 1, text: b[j] });
    if (out.length > 400) { out.push({ type: "…", line: 0, text: "(diff truncated)" }); break; }
  }
  return out.filter((d) => d.text !== undefined && (d.text.trim() !== "" || d.type === "…")).slice(0, context > 0 ? 400 : 400);
}
