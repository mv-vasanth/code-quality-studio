/**
 * File-based custom rules (`cqs-rules.json`).
 *
 * Unlike the localStorage rules in customRulesStorage.js, these live in the repo,
 * so the CLI, the MCP server and CI all see the same set.
 *
 * See docs/CUSTOM_RULES_PROPOSAL.md for the format.
 */
import { readFileSync, existsSync, statSync } from "fs";
import { dirname, join, resolve, parse as parsePath } from "path";
import { AUDIT_STACKS } from "../stacks/definitions.js";

export const RULES_FILENAME = "cqs-rules.json";

const SEVERITIES = new Set(["critical", "warning", "info"]);

/** Walk up from `startPath` looking for cqs-rules.json. Stops at a .git boundary. */
export function discoverRulesFile(startPath) {
  let dir = resolve(startPath);
  if (existsSync(dir) && statSync(dir).isFile()) dir = dirname(dir);
  const root = parsePath(dir).root;

  while (true) {
    const candidate = join(dir, RULES_FILENAME);
    if (existsSync(candidate)) return candidate;
    if (existsSync(join(dir, ".git"))) return null; // repo root reached, no file
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

/**
 * Validate one rule against a stack. Returns an array of human-readable errors
 * (empty when the rule is usable).
 */
export function validateRule(rule, stackId) {
  const errors = [];
  const where = rule?.id ? `rule ${rule.id}` : "a rule with no id";

  if (!rule?.id) errors.push("rule is missing an \"id\"");
  if (!rule?.title?.trim()) errors.push(`${where}: missing "title"`);

  if (!rule?.severity) errors.push(`${where}: missing "severity"`);
  else if (!SEVERITIES.has(rule.severity)) {
    errors.push(`${where}: severity "${rule.severity}" is not one of critical|warning|info`);
  }

  const stacks = !rule?.stacks || rule.stacks === "*" ? ["*"] : rule.stacks;
  const appliesHere = stacks.includes("*") || stacks.includes(stackId);
  if (appliesHere && rule?.category) {
    const valid = (AUDIT_STACKS[stackId]?.categories ?? []).map((c) => c.id);
    if (!valid.includes(rule.category)) {
      errors.push(`${where}: category "${rule.category}" is not valid for stack ${stackId} (valid: ${valid.join(", ")})`);
    }
  } else if (appliesHere && !rule?.category) {
    errors.push(`${where}: missing "category"`);
  }

  const m = rule?.match;
  if (!m?.pattern) errors.push(`${where}: missing "match.pattern"`);
  else if ((m.type ?? "regex") === "regex") {
    try {
      new RegExp(m.pattern, m.flags ?? "");
    } catch (e) {
      errors.push(`${where}: invalid regex — ${e.message}`);
    }
  }

  return errors;
}

/**
 * Load and validate a rules file.
 * Never throws for bad rule content — invalid rules are reported and skipped,
 * so one typo cannot take down an audit.
 */
export function loadRulesFile(filePath, stackId) {
  const result = { path: filePath, rules: [], disabled: [], severityOverrides: {}, errors: [] };
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (e) {
    result.errors.push(`cannot read ${filePath}: ${e.message}`);
    return result;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    result.errors.push(`${RULES_FILENAME} is not valid JSON — ${e.message}`);
    return result;
  }

  result.disabled = Array.isArray(parsed.disabled) ? parsed.disabled : [];
  result.severityOverrides = parsed.severityOverrides ?? {};

  const seen = new Set();
  for (const rule of Array.isArray(parsed.rules) ? parsed.rules : []) {
    const errs = validateRule(rule, stackId);
    if (rule?.id && seen.has(rule.id)) errs.push(`duplicate rule id "${rule.id}"`);
    if (errs.length) { result.errors.push(...errs); continue; }
    if (rule.id) seen.add(rule.id);

    const stacks = !rule.stacks || rule.stacks === "*" ? ["*"] : rule.stacks;
    if (stacks.includes("*") || stacks.includes(stackId)) result.rules.push(rule);
  }

  return result;
}

function matcherFor(rule) {
  const { type = "regex", pattern, flags } = rule.match;
  if (type === "text") {
    const needle = String(pattern).toLowerCase();
    return (line) => line.toLowerCase().includes(needle);
  }
  const re = new RegExp(pattern, flags ?? "");
  return (line) => { re.lastIndex = 0; return re.test(line); };
}

/**
 * Run file-based rules over one file's content.
 * `reportAll` on a rule emits every match; the default is one finding per rule.
 */
export function runFileRules(rules, filename, content, { disabledRuleIds } = {}) {
  const lines = String(content ?? "").split(/\r?\n/);
  const findings = [];

  for (const rule of rules) {
    if (disabledRuleIds?.has(rule.id)) continue;
    let test;
    try { test = matcherFor(rule); } catch { continue; }

    for (let i = 0; i < lines.length; i++) {
      if (!test(lines[i])) continue;
      findings.push({
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        description: rule.message?.trim() || `Custom rule ${rule.id} matched.`,
        impact: rule.impact ?? "",
        fix: rule.fix ?? rule.message ?? "",
        line: i + 1,
        reference: rule.reference ?? "Project custom rule",
        isCustom: true,
      });
      if (!rule.reportAll) break;
    }
  }
  return findings;
}

/**
 * Dry-run a candidate rule without saving it — the core of `cqs_test_rule`.
 * Returns every match with its file, line number and the matching source line,
 * so a proposed rule can be shown to have real evidence behind it.
 */
export function testRuleAgainstFiles(rule, files, { readFile = (f) => readFileSync(f, "utf8"), maxMatches = 50 } = {}) {
  const out = { matches: [], filesMatched: 0, totalMatches: 0, errors: [] };
  let test;
  try {
    test = matcherFor(rule);
  } catch (e) {
    out.errors.push(`invalid pattern — ${e.message}`);
    return out;
  }

  for (const file of files) {
    let content;
    try { content = readFile(file); } catch { continue; }
    const lines = content.split(/\r?\n/);
    let hitThisFile = false;
    for (let i = 0; i < lines.length; i++) {
      if (!test(lines[i])) continue;
      hitThisFile = true;
      out.totalMatches++;
      if (out.matches.length < maxMatches) {
        out.matches.push({ file, line: i + 1, text: lines[i].trim().slice(0, 160) });
      }
    }
    if (hitThisFile) out.filesMatched++;
  }
  return out;
}
