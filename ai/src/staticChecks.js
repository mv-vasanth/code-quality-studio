/**
 * The fast gate.
 *
 * The model only runs on code the cheap checks could not already condemn.
 * Two reasons, and the second is the important one:
 *
 *  - Speed. A regex is microseconds; a forward pass is tens of milliseconds.
 *  - Trust. If a `waitForTimeout` is sitting there in plain sight, a
 *    deterministic rule should be what reports it. Asking a classifier to
 *    confirm what a regex already knows is how a tool starts producing
 *    findings nobody can reproduce.
 *
 * These are intentionally the few checks with an unambiguous textual
 * signature. The real engine (src/localAnalyzer.js and the per-stack
 * analyzers) carries the other five hundred; `auditTestCode` accepts it as an
 * injected checker so this file does not become a second, worse copy of it.
 */

const CHECKS = [
  {
    ruleId: "LOCAL-STATIC-001",
    severity: "critical",
    category: "reliability",
    title: "Hard wait",
    re: /\b(waitForTimeout|Thread\.sleep|time\.sleep)\s*\(/,
    message: "A fixed delay guesses at timing; it flakes under load and wastes time when it does not.",
  },
  {
    ruleId: "LOCAL-STATIC-002",
    severity: "critical",
    category: "assertions",
    title: "No assertion",
    // Absence, so it is phrased as a test over the whole file rather than a match.
    absent: /\b(expect|assert|should|verify)\s*[(.]/,
    requires: /\b(test|it|describe|def test_|@Test)\b/,
    message: "This looks like a test but never asserts anything, so it can only fail by throwing.",
  },
  {
    ruleId: "LOCAL-STATIC-003",
    severity: "warning",
    category: "selectors",
    title: "XPath locator",
    re: /['"`]\s*\/\/[a-zA-Z*[]/,
    message: "XPath couples the test to document structure; a markup change breaks it silently.",
  },
  {
    ruleId: "LOCAL-STATIC-004",
    severity: "warning",
    category: "ci_config",
    title: "Focused or skipped test left in",
    re: /\b(\.only|\.skip|fdescribe|fit|xit|@Ignore)\b/,
    message: "A focused test hides the rest of the suite; a skipped one hides itself.",
  },
];

/**
 * @param {string} code
 * @returns {{ findings: Array, passed: boolean }}
 */
export function runStaticChecks(code) {
  const text = String(code ?? "");
  const lines = text.split(/\r?\n/);
  const findings = [];

  for (const c of CHECKS) {
    if (c.re) {
      for (let i = 0; i < lines.length; i++) {
        if (c.re.test(lines[i])) {
          findings.push(finding(c, i + 1));
          break;      // one per rule; the real engine reports every occurrence
        }
      }
    } else if (c.absent) {
      if ((!c.requires || c.requires.test(text)) && !c.absent.test(text)) {
        findings.push(finding(c, null));
      }
    }
  }

  return { findings, passed: findings.length === 0 };
}

function finding(c, line) {
  return {
    ruleId: c.ruleId,
    severity: c.severity,
    category: c.category,
    title: c.title,
    description: c.message,
    line,
    source: "static",
  };
}
