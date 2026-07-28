import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.playwright_java.categories.map((c) => c.id);

/**
 * Local rules for the Playwright *Java* binding (com.microsoft.playwright) — a different
 * API surface from the JS/TS Playwright stack. Heuristic, regex-based; not a substitute
 * for full review.
 */
export function analysePlaywrightJavaLocally(filename, content, options = {}) {
  const disabledRuleIds = options.disabledRuleIds ?? new Set();
  const findings = [];
  const first = (re) => lineMatches(content, re)[0] ?? null;
  const hasTests = /@Test\b/.test(content);
  const lines = content.split(/\r?\n/);

  // ── Locators ──
  const xpath = lineMatches(content, /locator\s*\(\s*"(\/\/|xpath=)|"xpath=/i);
  if (xpath.length) pushFinding(findings, {
    ruleId: "PWJ-SEL-001", category: "selectors", severity: "warning",
    title: "XPath locator", description: "XPath couples the test to DOM structure.",
    impact: "Brittle when the markup changes.",
    fix: `// Before\npage.locator("//button[@id='submit']").click();\n// After\npage.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Submit")).click();`,
    line: xpath[0], reference: "https://playwright.dev/java/docs/locators",
  }, disabledRuleIds);

  const cssId = lineMatches(content, /locator\s*\(\s*"#/);
  if (cssId.length) pushFinding(findings, {
    ruleId: "PWJ-SEL-002", category: "selectors", severity: "info",
    title: "CSS id locator", description: "ID selectors couple tests to implementation ids.",
    impact: "Renames break the test.",
    fix: `page.getByTestId("checkout-submit");`,
    line: cssId[0], reference: "https://playwright.dev/java/docs/locators",
  }, disabledRuleIds);

  if (hasTests && !/getByRole|getByText|getByLabel|getByTestId|getByPlaceholder/.test(content)) {
    pushFinding(findings, {
      ruleId: "PWJ-SEL-003", category: "selectors", severity: "info",
      title: "No user-facing locators", description: "No getByRole/getByText/getByLabel/getByTestId found.",
      impact: "Likely relying on brittle CSS/XPath.",
      fix: `page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Save"));`,
      line: null, reference: "https://playwright.dev/java/docs/locators",
    }, disabledRuleIds);
  }

  // ── Reliability ──
  const waitTimeout = lineMatches(content, /waitForTimeout\s*\(/);
  if (waitTimeout.length) pushFinding(findings, {
    ruleId: "PWJ-REL-001", category: "reliability", severity: "critical",
    title: "Hard wait (waitForTimeout)", description: "Fixed delays cause flakiness or slow runs.",
    impact: "Flaky CI under load; wasted time.",
    fix: `// Before\npage.waitForTimeout(3000);\n// After\nassertThat(page.getByText("Loaded")).isVisible();`,
    line: waitTimeout[0], reference: "https://playwright.dev/java/docs/actionability",
  }, disabledRuleIds);

  const threadSleep = lineMatches(content, /Thread\.sleep\s*\(/);
  if (threadSleep.length) pushFinding(findings, {
    ruleId: "PWJ-REL-002", category: "reliability", severity: "critical",
    title: "Thread.sleep() in test", description: "Blocking sleep is a hard wait that ties up the thread.",
    impact: "Flaky and slow; masks missing assertions.",
    fix: `assertThat(page.getByRole(AriaRole.STATUS)).isVisible(); // wait on a real condition`,
    line: threadSleep[0], reference: "https://playwright.dev/java/docs/actionability",
  }, disabledRuleIds);

  const waitForSelector = lineMatches(content, /waitForSelector\s*\(/);
  if (waitForSelector.length) pushFinding(findings, {
    ruleId: "PWJ-REL-003", category: "reliability", severity: "warning",
    title: "waitForSelector used", description: "Locators auto-wait; explicit waits are usually redundant.",
    impact: "Hides timing assumptions.",
    fix: `assertThat(page.getByRole(AriaRole.ROW)).isVisible();`,
    line: waitForSelector[0], reference: "https://playwright.dev/java/docs/actionability",
  }, disabledRuleIds);

  const cond = lineMatches(content, /if\s*\([^)]*\.(isVisible|isEnabled|isChecked|isEditable)\s*\(\s*\)\s*\)/);
  if (cond.length) pushFinding(findings, {
    ruleId: "PWJ-REL-004", category: "reliability", severity: "warning",
    title: "Conditional on element state", description: "Branching on isVisible()/isEnabled() snapshots a moment and is racy.",
    impact: "Intermittent behaviour.",
    fix: `assertThat(page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Next"))).isEnabled();`,
    line: cond[0], reference: "https://playwright.dev/java/docs/best-practices",
  }, disabledRuleIds);

  // ── Assertions ──
  if (hasTests && !/assertThat\s*\(/.test(content)) pushFinding(findings, {
    ruleId: "PWJ-AST-001", category: "assertions", severity: "warning",
    title: "No web-first assertions", description: "Tests present but no PlaywrightAssertions.assertThat(...) calls found.",
    impact: "Tests may pass without verifying UI state.",
    fix: `import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;\nassertThat(page).hasURL(Pattern.compile("dashboard"));`,
    line: null, reference: "https://playwright.dev/java/docs/test-assertions",
  }, disabledRuleIds);

  const junitOnState = lineMatches(content, /assert(True|False|Equals)\s*\([^;]*\.(isVisible|isEnabled|isChecked|textContent|innerText)\s*\(/);
  if (junitOnState.length) pushFinding(findings, {
    ruleId: "PWJ-AST-002", category: "assertions", severity: "warning",
    title: "JUnit assertion on locator state", description: "assertTrue(locator.isVisible()) reads once and does not retry.",
    impact: "Flaky assertions on async UI.",
    fix: `// Before\nassertTrue(page.locator(".ok").isVisible());\n// After\nassertThat(page.locator(".ok")).isVisible();`,
    line: junitOnState[0], reference: "https://playwright.dev/java/docs/test-assertions",
  }, disabledRuleIds);

  // ── Structure & hooks ──
  if (hasTests && !/@BeforeEach|@BeforeAll/.test(content)) pushFinding(findings, {
    ruleId: "PWJ-STR-001", category: "structure", severity: "info",
    title: "No setup hooks", description: "Tests present without @BeforeEach/@BeforeAll for shared setup.",
    impact: "Duplicated setup; harder maintenance.",
    fix: `@BeforeEach\nvoid setUp() { page = context.newPage(); page.navigate("/app"); }`,
    line: null, reference: "https://playwright.dev/java/docs/writing-tests",
  }, disabledRuleIds);

  // ── Security ──
  const secrets = lineMatches(content, /(?:password|apiKey|secret|token)\s*=\s*"[^"]{4,}"/i)
    .filter((ln) => !/System\.getenv|@Value|process\.env/.test(lines[ln - 1] || ""));
  if (secrets.length) pushFinding(findings, {
    ruleId: "PWJ-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded secret", description: "Literal password/token/API key in test source.",
    impact: "Secrets leak through git history and CI logs.",
    fix: `String password = System.getenv("E2E_PASSWORD");`,
    line: secrets[0],
  }, disabledRuleIds);

  const insecureTls = lineMatches(content, /setIgnoreHTTPSErrors\s*\(\s*true|ignoreHTTPSErrors\s*\(\s*true/);
  if (insecureTls.length) pushFinding(findings, {
    ruleId: "PWJ-SEC-002", category: "security", severity: "warning",
    title: "TLS validation disabled", description: "setIgnoreHTTPSErrors(true) turns off certificate checks.",
    impact: "Tests pass against misconfigured/insecure endpoints.",
    fix: "Remove setIgnoreHTTPSErrors(true); trust real certificates.",
    line: insecureTls[0], reference: "https://playwright.dev/java/docs/api/class-browser",
  }, disabledRuleIds);

  // ── Performance ──
  const screenshot = lineMatches(content, /\.screenshot\s*\(/);
  if (screenshot.length) pushFinding(findings, {
    ruleId: "PWJ-PER-001", category: "performance", severity: "info",
    title: "Inline screenshot", description: "Manual screenshots slow tests; prefer trace/screenshot on failure.",
    impact: "Slower runs and extra artifacts.",
    fix: `// Configure trace/screenshot on failure instead of capturing inline`,
    line: screenshot[0], reference: "https://playwright.dev/java/docs/trace-viewer",
  }, disabledRuleIds);

  // ── Resource management (Java-specific) ──
  if (/Playwright\.create\s*\(/.test(content) && !/try\s*\(/.test(content)) pushFinding(findings, {
    ruleId: "PWJ-RES-001", category: "resource_mgmt", severity: "warning",
    title: "Playwright not closed (no try-with-resources)", description: "Playwright.create() without try-with-resources risks leaking browser processes.",
    impact: "Leaked processes/memory across runs.",
    fix: `try (Playwright playwright = Playwright.create()) {\n  Browser browser = playwright.chromium().launch();\n  // ...\n}`,
    line: first(/Playwright\.create\s*\(/), reference: "https://playwright.dev/java/docs/intro",
  }, disabledRuleIds);

  // ── Standards ──
  const pause = lineMatches(content, /\.pause\s*\(\s*\)/);
  if (pause.length) pushFinding(findings, {
    ruleId: "PWJ-STD-001", category: "coding_standards", severity: "warning",
    title: "page.pause() left in code", description: "pause() opens the inspector and blocks execution.",
    impact: "Hangs the run in CI.",
    fix: "Remove page.pause() before committing.",
    line: pause[0], reference: "https://playwright.dev/java/docs/debug",
  }, disabledRuleIds);

  const sysout = lineMatches(content, /System\.(out|err)\.print/);
  if (sysout.length) pushFinding(findings, {
    ruleId: "PWJ-STD-002", category: "coding_standards", severity: "info",
    title: "System.out in tests", description: "Console prints add noise and bypass structured logging.",
    impact: "Harder-to-read output.",
    fix: "Remove debug prints or use a logger.",
    line: sysout[0],
  }, disabledRuleIds);

  const todo = lineMatches(content, /\/\/\s*(TODO|FIXME)|\/\*\s*(TODO|FIXME)/i);
  if (todo.length) pushFinding(findings, {
    ruleId: "PWJ-STD-003", category: "coding_standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.",
    impact: "Incomplete logic can ship unnoticed.",
    fix: "Resolve or link to a tracked issue.",
    line: todo[0],
  }, disabledRuleIds);

  // ── CI / config ──
  const absUrl = lineMatches(content, /navigate\s*\(\s*"https?:\/\//);
  if (absUrl.length) pushFinding(findings, {
    ruleId: "PWJ-CI-001", category: "ci_config", severity: "warning",
    title: "Hardcoded absolute URL", description: "navigate(\"https://…\") ties the test to one environment.",
    impact: "Breaks across local/staging/CI.",
    fix: `// Use a baseUrl option + relative path\npage.navigate("/login");`,
    line: absUrl[0], reference: "https://playwright.dev/java/docs/test-runners",
  }, disabledRuleIds);

  const crit = findings.filter((f) => f.severity === "critical").length;
  const summary =
    crit > 0
      ? `Playwright (Java) scan of ${filename}: ${findings.length} finding(s), ${crit} critical.`
      : `Playwright (Java) scan of ${filename}: ${findings.length} finding(s) from standard rules.`;

  return buildAuditResult({
    filename,
    categoryIds: CATEGORY_IDS,
    findings,
    metrics: {
      totalTests: countMatches(content, /@Test\b/g),
      hardWaits: waitTimeout.length + threadSleep.length,
      xpathLocators: xpath.length,
      hardcodedSecrets: secrets.length,
    },
    summary,
    positives:
      waitTimeout.length + threadSleep.length === 0
        ? [{ title: "No hard waits", description: "No waitForTimeout/Thread.sleep detected." }]
        : undefined,
  });
}
