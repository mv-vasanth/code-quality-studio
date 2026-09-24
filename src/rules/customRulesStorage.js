/**
 * User-defined ("custom") rules, stored per stack in localStorage.
 * A custom rule runs during local (Rules) analysis: its pattern is tested against
 * each line of a loaded file, and every match becomes a finding.
 *
 * Rule shape:
 *   {
 *     id:        string,   // stable internal id
 *     ruleId:    string,   // display id, e.g. "CUSTOM-ab12" (shown on findings)
 *     title:     string,
 *     category:  string,   // must be a category id of the stack
 *     severity:  "critical" | "warning" | "info",
 *     matchType: "text" | "regex",
 *     pattern:   string,   // substring (text) or RegExp source (regex)
 *     message:   string,   // optional advice / fix shown on the finding
 *     enabled:   boolean,
 *   }
 */

const KEY = (stackId) => `cqs-custom-rules-${stackId}`;

export function loadCustomRules(stackId) {
  try {
    const raw = localStorage.getItem(KEY(stackId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomRules(stackId, rules) {
  try {
    localStorage.setItem(KEY(stackId), JSON.stringify(rules));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function makeCustomRuleId() {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `CUSTOM-${suffix}`;
}

export function addCustomRule(stackId, rule) {
  const rules = loadCustomRules(stackId);
  const next = [...rules, rule];
  saveCustomRules(stackId, next);
  return next;
}

export function updateCustomRule(stackId, id, patch) {
  const next = loadCustomRules(stackId).map((r) => (r.id === id ? { ...r, ...patch } : r));
  saveCustomRules(stackId, next);
  return next;
}

export function deleteCustomRule(stackId, id) {
  const next = loadCustomRules(stackId).filter((r) => r.id !== id);
  saveCustomRules(stackId, next);
  return next;
}

/** Validate a draft rule before saving. Returns an error string, or null if valid. */
export function validateCustomRule(draft) {
  if (!draft.title?.trim()) return "Give the rule a title.";
  if (!draft.category) return "Pick a category.";
  if (!draft.pattern?.trim()) return "Enter a pattern to match.";
  if (draft.matchType === "regex") {
    try {
      RegExp(draft.pattern);
    } catch (e) {
      return `Invalid regular expression: ${e.message}`;
    }
  }
  return null;
}

/**
 * Apply enabled custom rules to file content, returning findings.
 * @param disabledRuleIds Set of ruleIds turned off in the Rules tab (also skipped here).
 */
export function runCustomRules(stackId, content, { disabledRuleIds } = {}) {
  const rules = loadCustomRules(stackId).filter(
    (r) => r.enabled !== false && !(disabledRuleIds && disabledRuleIds.has(r.ruleId)),
  );
  if (!rules.length) return [];

  const lines = String(content ?? "").split(/\r?\n/);
  const findings = [];

  for (const rule of rules) {
    let test;
    if (rule.matchType === "regex") {
      try {
        const re = new RegExp(rule.pattern, "i");
        test = (line) => re.test(line);
      } catch {
        continue; // invalid regex — skip rather than crash analysis
      }
    } else {
      const needle = String(rule.pattern).toLowerCase();
      test = (line) => line.toLowerCase().includes(needle);
    }

    for (let i = 0; i < lines.length; i++) {
      if (!test(lines[i])) continue;
      findings.push({
        ruleId: rule.ruleId,
        category: rule.category,
        severity: rule.severity || "warning",
        title: rule.title,
        description: rule.message?.trim()
          ? rule.message.trim()
          : `Custom rule matched: ${rule.matchType === "regex" ? "/" + rule.pattern + "/" : `"${rule.pattern}"`}`,
        impact: "",
        fix: rule.message?.trim() || "",
        line: i + 1,
        reference: "Custom rule",
        isCustom: true,
      });
      break; // one finding per rule per file keeps results readable
    }
  }

  return findings;
}
