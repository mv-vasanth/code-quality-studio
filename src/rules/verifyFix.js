/**
 * Fix verification — the ground truth an LLM cannot supply about its own output.
 *
 * Re-audits proposed content against the same rules and reports what actually
 * changed: which findings went away, which remain, and — the important one —
 * which NEW findings the edit introduced.
 *
 * Shared by the MCP tool (cqs_verify_fix) and the CLI loop (--ai-fix) so both
 * judge a fix by identical criteria.
 */

const SEVERITY_WEIGHT = { critical: 3, warning: 2, info: 1 };

/** Count findings per ruleId — findings have no stable identity across an edit,
 *  and line numbers shift, so compare by rule and multiplicity instead. */
function tally(findings) {
  const map = new Map();
  for (const f of findings ?? []) {
    const cur = map.get(f.ruleId) ?? { count: 0, severity: f.severity, title: f.title };
    cur.count++;
    map.set(f.ruleId, cur);
  }
  return map;
}

function countBySeverity(findings) {
  const out = { critical: 0, warning: 0, info: 0 };
  for (const f of findings ?? []) if (out[f.severity] !== undefined) out[f.severity]++;
  return out;
}

/**
 * Compare two finding sets.
 * @returns {{fixed, introduced, remaining, before, after, improved, verdict}}
 */
export function diffFindings(beforeFindings, afterFindings) {
  const before = tally(beforeFindings);
  const after = tally(afterFindings);

  const fixed = [];
  const introduced = [];
  const remaining = [];

  for (const [ruleId, b] of before) {
    const a = after.get(ruleId);
    const afterCount = a?.count ?? 0;
    if (afterCount < b.count) {
      fixed.push({ ruleId, severity: b.severity, title: b.title, resolved: b.count - afterCount, left: afterCount });
    }
    if (afterCount > 0) {
      remaining.push({ ruleId, severity: b.severity, title: b.title, count: afterCount });
    }
  }

  for (const [ruleId, a] of after) {
    const b = before.get(ruleId);
    if (!b) {
      introduced.push({ ruleId, severity: a.severity, title: a.title, count: a.count });
    } else if (a.count > b.count) {
      introduced.push({ ruleId, severity: a.severity, title: a.title, count: a.count - b.count, regression: true });
    }
  }

  const sevBefore = countBySeverity(beforeFindings);
  const sevAfter = countBySeverity(afterFindings);

  // Weighted so trading one critical for one info still counts as progress,
  // but introducing a critical never does.
  const weight = (s) => s.critical * SEVERITY_WEIGHT.critical + s.warning * SEVERITY_WEIGHT.warning + s.info * SEVERITY_WEIGHT.info;
  const scoreBefore = weight(sevBefore);
  const scoreAfter = weight(sevAfter);

  const introducedCritical = introduced.some((i) => i.severity === "critical");
  const improved = scoreAfter < scoreBefore && !introducedCritical;

  let verdict;
  if (introducedCritical) verdict = "rejected: introduced a new critical finding";
  else if (introduced.length > 0 && scoreAfter >= scoreBefore) verdict = "rejected: made things worse";
  else if (scoreAfter === scoreBefore) verdict = "no change: nothing was resolved";
  else if (improved && introduced.length > 0) verdict = "improved, but introduced lower-severity findings — review before keeping";
  else verdict = "improved";

  return {
    fixed, introduced, remaining,
    before: sevBefore, after: sevAfter,
    improved, verdict,
  };
}

/**
 * Audit a single file's content with a given runner, including project rules.
 * Kept separate from diffFindings so callers can supply their own runner map.
 */
export function auditContent(runner, filename, content, { disabledRuleIds = new Set(), customRules = [], runFileRules } = {}) {
  const result = runner(filename, content, { disabledRuleIds });
  const findings = [...(result.findings ?? [])];
  if (customRules.length && runFileRules) {
    findings.push(...runFileRules(customRules, filename, content, { disabledRuleIds }));
  }
  return { findings, overallScore: result.overallScore ?? 0 };
}

/** Human-readable report for a verification result. */
export function formatVerification(diff, { filename, scoreBefore, scoreAfter } = {}) {
  const lines = [];
  const icon = diff.improved ? "✅" : diff.introduced.some((i) => i.severity === "critical") ? "❌" : "⚠️";
  lines.push(`${icon} ${diff.verdict}${filename ? ` — ${filename}` : ""}`);
  if (scoreBefore !== undefined && scoreAfter !== undefined) {
    lines.push(`Score: ${scoreBefore} → ${scoreAfter}`);
  }
  lines.push(
    `Findings: ${diff.before.critical}C/${diff.before.warning}W/${diff.before.info}I` +
    ` → ${diff.after.critical}C/${diff.after.warning}W/${diff.after.info}I`,
  );

  if (diff.fixed.length) {
    lines.push("", "Resolved:");
    for (const f of diff.fixed) lines.push(`  - ${f.ruleId} [${f.severity}] ${f.title}${f.left ? ` (${f.left} still left)` : ""}`);
  }
  if (diff.introduced.length) {
    lines.push("", "⚠ Introduced by this edit:");
    for (const i of diff.introduced) lines.push(`  - ${i.ruleId} [${i.severity}] ${i.title}${i.regression ? " (count increased)" : ""}`);
  }
  if (diff.remaining.length && !diff.fixed.length && !diff.introduced.length) {
    lines.push("", `Still present: ${diff.remaining.length} rule(s) unchanged`);
  }
  return lines.join("\n");
}
