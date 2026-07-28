import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.playwright_python.categories.map((c) => c.id);

/** Local rules for the Playwright Python binding (snake_case API). Heuristic, regex-based. */
export function analysePlaywrightPythonLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
  const hasTests = /def\s+test_|@pytest|playwright/i.test(content);
  const add = (r) => pushFinding(findings, r, disabled);

  const xpath = lineMatches(content, /locator\s*\(\s*["'](\/\/|xpath=)|["']xpath=/i);
  if (xpath.length) add({ ruleId: "PWPY-SEL-001", category: "selectors", severity: "warning",
    title: "XPath locator", description: "XPath couples the test to DOM structure.", impact: "Brittle on markup changes.",
    fix: `page.get_by_role("button", name="Submit").click()`, line: xpath[0], reference: "https://playwright.dev/python/docs/locators" });

  const cssId = lineMatches(content, /locator\s*\(\s*["']#/);
  if (cssId.length) add({ ruleId: "PWPY-SEL-002", category: "selectors", severity: "info",
    title: "CSS id locator", description: "ID selectors couple tests to implementation ids.", impact: "Renames break tests.",
    fix: `page.get_by_test_id("checkout-submit")`, line: cssId[0] });

  if (hasTests && !/get_by_role|get_by_text|get_by_label|get_by_test_id|get_by_placeholder/.test(content))
    add({ ruleId: "PWPY-SEL-003", category: "selectors", severity: "info",
      title: "No user-facing locators", description: "No get_by_role/get_by_text/get_by_label found.", impact: "Likely brittle selectors.",
      fix: `page.get_by_role("button", name="Save")`, line: null });

  const waitTimeout = lineMatches(content, /wait_for_timeout\s*\(/);
  if (waitTimeout.length) add({ ruleId: "PWPY-REL-001", category: "reliability", severity: "critical",
    title: "Hard wait (wait_for_timeout)", description: "Fixed delays cause flakiness or slow runs.", impact: "Flaky/slow CI.",
    fix: `expect(page.get_by_text("Loaded")).to_be_visible()`, line: waitTimeout[0], reference: "https://playwright.dev/python/docs/actionability" });

  const sleep = lineMatches(content, /time\.sleep\s*\(/);
  if (sleep.length) add({ ruleId: "PWPY-REL-002", category: "reliability", severity: "critical",
    title: "time.sleep() in test", description: "Blocking sleep is a hard wait.", impact: "Flaky and slow.",
    fix: `expect(page.get_by_role("status")).to_be_visible()`, line: sleep[0] });

  const waitSel = lineMatches(content, /wait_for_selector\s*\(/);
  if (waitSel.length) add({ ruleId: "PWPY-REL-003", category: "reliability", severity: "warning",
    title: "wait_for_selector used", description: "Locators auto-wait; explicit waits are usually redundant.", impact: "Hides timing assumptions.",
    fix: `expect(page.get_by_role("row")).to_be_visible()`, line: waitSel[0] });

  const cond = lineMatches(content, /if\s+.*\.(is_visible|is_enabled|is_checked)\s*\(\s*\)\s*:/);
  if (cond.length) add({ ruleId: "PWPY-REL-004", category: "reliability", severity: "warning",
    title: "Conditional on element state", description: "Branching on is_visible()/is_enabled() is racy.", impact: "Intermittent behaviour.",
    fix: `expect(page.get_by_role("button", name="Next")).to_be_enabled()`, line: cond[0] });

  if (hasTests && !/\bexpect\s*\(/.test(content))
    add({ ruleId: "PWPY-AST-001", category: "assertions", severity: "warning",
      title: "No web-first assertions", description: "Tests present but no expect(...) calls found.", impact: "Tests may not verify UI.",
      fix: `from playwright.sync_api import expect\nexpect(page).to_have_url(re.compile("dashboard"))`, line: null });

  const bareAssert = lineMatches(content, /assert\s+.*\.(is_visible|is_enabled|inner_text|text_content)\s*\(/);
  if (bareAssert.length) add({ ruleId: "PWPY-AST-002", category: "assertions", severity: "warning",
    title: "Bare assert on locator state", description: "assert locator.is_visible() reads once and does not retry.", impact: "Flaky on async UI.",
    fix: `expect(page.locator(".ok")).to_be_visible()`, line: bareAssert[0] });

  if (hasTests && !/@pytest\.fixture|conftest/.test(content))
    add({ ruleId: "PWPY-STR-001", category: "structure", severity: "info",
      title: "No pytest fixtures", description: "Tests present without fixtures for shared setup.", impact: "Duplicated setup.",
      fix: `@pytest.fixture\ndef logged_in(page): ...`, line: null });

  const secrets = lineMatches(content, /(?:password|api_key|secret|token)\s*=\s*["'][^"']{4,}["']/i)
    .filter((ln) => !/os\.environ|getenv/.test(lines[ln - 1] || ""));
  if (secrets.length) add({ ruleId: "PWPY-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded secret", description: "Literal password/token/api_key in source.", impact: "Secrets leak via git and CI logs.",
    fix: `password = os.environ["E2E_PASSWORD"]`, line: secrets[0] });

  const pause = lineMatches(content, /\.pause\s*\(\s*\)/);
  if (pause.length) add({ ruleId: "PWPY-STD-001", category: "coding_standards", severity: "warning",
    title: "page.pause() left in code", description: "pause() opens the inspector and blocks execution.", impact: "Hangs CI.",
    fix: "Remove page.pause() before committing.", line: pause[0] });

  const prints = lineMatches(content, /(^|\s)print\s*\(/);
  if (prints.length) add({ ruleId: "PWPY-STD-002", category: "coding_standards", severity: "info",
    title: "print() in tests", description: "Console prints add noise; use logging or the reporter.", impact: "Noisy output.",
    fix: "Remove debug prints.", line: prints[0] });

  const todo = lineMatches(content, /#\s*(TODO|FIXME)/i);
  if (todo.length) add({ ruleId: "PWPY-STD-003", category: "coding_standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.", impact: "Unfinished logic ships.",
    fix: "Resolve or link to an issue.", line: todo[0] });

  const absUrl = lineMatches(content, /goto\s*\(\s*["']https?:\/\//);
  if (absUrl.length) add({ ruleId: "PWPY-CI-001", category: "ci_config", severity: "warning",
    title: "Hardcoded absolute URL", description: "goto(\"https://…\") ties the test to one environment.", impact: "Breaks across environments.",
    fix: `# set base_url in config, then\npage.goto("/login")`, line: absUrl[0] });

  const screenshot = lineMatches(content, /\.screenshot\s*\(/);
  if (screenshot.length) add({ ruleId: "PWPY-PER-001", category: "performance", severity: "info",
    title: "Inline screenshot", description: "Manual screenshots slow tests; prefer trace/on-failure capture.", impact: "Slower runs.",
    fix: "Configure screenshot on failure instead.", line: screenshot[0] });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { totalTests: countMatches(content, /def\s+test_/g), hardWaits: waitTimeout.length + sleep.length, xpathLocators: xpath.length, hardcodedSecrets: secrets.length },
    summary: `Playwright (Python) scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
