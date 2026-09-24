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
  // Closing in a JUnit/TestNG teardown hook is as valid as try-with-resources.
  const closedInTeardown = /@(?:AfterAll|AfterClass|AfterEach|After)\b[\s\S]{0,400}?\b(?:playwright|browser)\s*\.\s*close\s*\(/i.test(content);
  if (/Playwright\.create\s*\(/.test(content) && !/try\s*\(/.test(content) && !closedInTeardown) pushFinding(findings, {
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

  // ── Per-method blocks (used by several rules below) ──
  const testStarts = [];
  lines.forEach((l, i) => { if (/^\s*@Test\b/.test(l)) testStarts.push(i); });
  const blockOf = (k) => {
    const start = testStarts[k];
    const rest = lines.slice(start + 1);
    const nextAnn = rest.findIndex((l) => /^\s*@(?:Test|BeforeEach|BeforeAll|AfterEach|AfterAll|ParameterizedTest)\b/.test(l));
    return rest.slice(0, nextAnn === -1 ? rest.length : nextAnn).join("\n");
  };

  // ── Locators ──
  const querySelector = lineMatches(content, /\.querySelector(?:All)?\s*\(/);
  if (querySelector.length) pushFinding(findings, {
    ruleId: "PWJ-SEL-004", category: "selectors", severity: "warning",
    title: "Legacy querySelector API",
    description: `querySelector()/querySelectorAll() returns an ElementHandle on line ${querySelector[0]}.`,
    impact: "ElementHandles resolve once and never re-query, so they go stale after a re-render and skip Playwright's auto-waiting.",
    fix: `// Before\nElementHandle el = page.querySelector(".row");\n// After\nLocator row = page.locator(".row");\nassertThat(row).isVisible();`,
    line: querySelector[0], reference: "https://playwright.dev/java/docs/locators",
  }, disabledRuleIds);

  // ── Reliability ──
  const waitForNav = lineMatches(content, /waitForNavigation\s*\(/);
  if (waitForNav.length) pushFinding(findings, {
    ruleId: "PWJ-REL-005", category: "reliability", severity: "warning",
    title: "Deprecated waitForNavigation()",
    description: `waitForNavigation() is used on line ${waitForNav[0]}.`,
    impact: "Deprecated and inherently racy — the navigation can complete before the waiter is attached, which hangs the test until timeout.",
    fix: `// Before\npage.waitForNavigation(() -> page.getByRole(AriaRole.LINK).click());\n// After\npage.getByRole(AriaRole.LINK).click();\nassertThat(page).hasURL(Pattern.compile("/orders"));`,
    line: waitForNav[0], reference: "https://playwright.dev/java/docs/navigations",
  }, disabledRuleIds);

  const networkIdle = lineMatches(content, /WaitUntilState\.NETWORKIDLE|setWaitUntil\s*\([^)]*NETWORKIDLE/i);
  if (networkIdle.length) pushFinding(findings, {
    ruleId: "PWJ-REL-006", category: "reliability", severity: "warning",
    title: "Waiting on NETWORKIDLE",
    description: `A NETWORKIDLE wait state is requested on line ${networkIdle[0]}.`,
    impact: "Discouraged by Playwright: polling, analytics beacons or websockets keep the network busy, so the wait times out or resolves at an arbitrary moment.",
    fix: `// Before\npage.navigate("/dashboard", new Page.NavigateOptions().setWaitUntil(WaitUntilState.NETWORKIDLE));\n// After\npage.navigate("/dashboard");\nassertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Dashboard"))).isVisible();`,
    line: networkIdle[0], reference: "https://playwright.dev/java/docs/api/class-page#page-navigate",
  }, disabledRuleIds);

  const defaultTimeout = lineMatches(content, /setDefault(?:Navigation)?Timeout\s*\(/);
  if (defaultTimeout.length) pushFinding(findings, {
    ruleId: "PWJ-REL-007", category: "reliability", severity: "warning",
    title: "Timeout tuned inside the test",
    description: `setDefaultTimeout()/setDefaultNavigationTimeout() is called on line ${defaultTimeout[0]}.`,
    impact: "Inflating the timeout locally hides genuine slowness and drifts out of sync with the project's CI budget.",
    fix: `// Configure timeouts once in the shared fixture/options class, then rely on auto-waiting assertions\nassertThat(page.getByRole(AriaRole.TABLE)).isVisible();`,
    line: defaultTimeout[0], reference: "https://playwright.dev/java/docs/test-runners",
  }, disabledRuleIds);

  // ── Assertions ──
  const noAssertTests = /assertThat\s*\(/.test(content)
    ? testStarts.filter((_, k) => !/assertThat\s*\(|\bassert[A-Z]\w*\s*\(|\bAssertions\s*\.|\bassert\s+\w/.test(blockOf(k))).map((i) => i + 1)
    : [];
  if (noAssertTests.length) pushFinding(findings, {
    ruleId: "PWJ-AST-003", category: "assertions", severity: "warning",
    title: "Test method with no assertion",
    description: `The @Test at line ${noAssertTests[0]} drives the UI but never asserts anything.`,
    impact: "It only fails when an action throws, so a silently broken page still reports green.",
    fix: `@Test\nvoid checkout() {\n  page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Pay")).click();\n  assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Order confirmed"))).isVisible();\n}`,
    line: noAssertTests[0], reference: "https://playwright.dev/java/docs/best-practices",
  }, disabledRuleIds);

  // ── Structure ──
  const rawPageCalls = countMatches(content, /\bpage\.(?:navigate|locator|getBy\w+|click|fill|press|check|selectOption)\s*\(/g);
  if (hasTests && rawPageCalls >= 15 && !/class\s+\w*Page\b|import\s+[\w.]*\.pages?\./.test(content)) pushFinding(findings, {
    ruleId: "PWJ-STR-002", category: "structure", severity: "info",
    title: "No page-object abstraction",
    description: `${rawPageCalls} raw page.* interactions with no page-object class or pages package import.`,
    impact: "Selectors and flows are duplicated across test classes, so one UI change forces edits in many files.",
    fix: `public class LoginPage {\n  private final Locator submit;\n  public LoginPage(Page page) { this.submit = page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Sign in")); }\n  public void signIn(String user, String secret) { /* ... */ }\n}`,
    line: null, reference: "https://playwright.dev/java/docs/pom",
  }, disabledRuleIds);

  // ── Resource management ──
  const launches = lineMatches(content, /\.launch\s*\(|newContext\s*\(/);
  if (launches.length && !/\.close\s*\(/.test(content) && !/try\s*\(/.test(content)) pushFinding(findings, {
    ruleId: "PWJ-RES-002", category: "resource_mgmt", severity: "warning",
    title: "Browser/context opened but never closed",
    description: `launch()/newContext() on line ${launches[0]} with no matching close() and no try-with-resources.`,
    impact: "Every run leaks a browser process and its profile directory, so long CI jobs exhaust memory and file handles.",
    fix: `@AfterAll\nstatic void tearDown() {\n  context.close();\n  browser.close();\n}`,
    line: launches[0], reference: "https://playwright.dev/java/docs/browsers",
  }, disabledRuleIds);

  const createInTest = testStarts.filter((_, k) => /Playwright\.create\s*\(/.test(blockOf(k))).map((i) => i + 1);
  if (createInTest.length) pushFinding(findings, {
    ruleId: "PWJ-RES-003", category: "resource_mgmt", severity: "warning",
    title: "Playwright.create() inside a test method",
    description: `The @Test at line ${createInTest[0]} creates its own Playwright instance instead of taking one from a fixture.`,
    impact: "Each test pays full driver + browser startup and manages its own teardown, which is where leaked processes come from.",
    fix: `@BeforeAll\nstatic void launchBrowser() {\n  playwright = Playwright.create();\n  browser = playwright.chromium().launch();\n}\n// …or use @UsePlaywright to let the JUnit extension own the lifecycle.`,
    line: createInTest[0], reference: "https://playwright.dev/java/docs/junit",
  }, disabledRuleIds);

  // ── Standards ──
  const emptyCatch = [];
  lines.forEach((l, i) => {
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(l)) emptyCatch.push(i + 1);
    else if (/catch\s*\([^)]*\)\s*\{\s*$/.test(l) && /^\s*\}\s*$/.test(lines[i + 1] ?? "")) emptyCatch.push(i + 1);
  });
  if (emptyCatch.length) pushFinding(findings, {
    ruleId: "PWJ-STD-004", category: "coding_standards", severity: "warning",
    title: "Exception swallowed by an empty catch",
    description: `An empty catch block appears on line ${emptyCatch[0]}.`,
    impact: "Real failures are converted into passes — this is how a broken flow stays green for weeks.",
    fix: `// Assert the expected end state instead of guarding with try/catch\nassertThat(page.getByRole(AriaRole.ALERT)).hasText("Saved");`,
    line: emptyCatch[0], reference: "https://playwright.dev/java/docs/best-practices",
  }, disabledRuleIds);

  const disabledTests = lineMatches(content, /^\s*@(?:Disabled|Ignore)\b/);
  if (disabledTests.length) pushFinding(findings, {
    ruleId: "PWJ-STD-005", category: "coding_standards", severity: "info",
    title: "Disabled test",
    description: `A test is switched off with @Disabled/@Ignore on line ${disabledTests[0]}.`,
    impact: "Permanently disabled tests rot silently while the dashboard still counts them as coverage.",
    fix: `@Disabled("blocked by BUG-1234 — re-enable once the fix ships") // always give a reason + ticket`,
    line: disabledTests[0], reference: "https://junit.org/junit5/docs/current/user-guide/#writing-tests-disabling",
  }, disabledRuleIds);

  // ── CI / config ──
  const headed = lineMatches(content, /setHeadless\s*\(\s*false\s*\)/i);
  if (headed.length) pushFinding(findings, {
    ruleId: "PWJ-CI-002", category: "ci_config", severity: "warning",
    title: "Headed mode hardcoded",
    description: `setHeadless(false) is committed on line ${headed[0]}.`,
    impact: "CI agents have no display, so the job hangs or crashes; locally it just makes the suite slower.",
    fix: `// Let the environment decide\nnew BrowserType.LaunchOptions().setHeadless(!Boolean.getBoolean("headed"));`,
    line: headed[0], reference: "https://playwright.dev/java/docs/debug",
  }, disabledRuleIds);

  if (launches.length && !/tracing\s*\(\s*\)\s*\.\s*start|setRecordVideoDir|setRecordHarPath/.test(content)) pushFinding(findings, {
    ruleId: "PWJ-CI-003", category: "ci_config", severity: "info",
    title: "No trace, video or HAR capture configured",
    description: `A browser/context is created on line ${launches[0]} with no tracing, video or HAR recording.`,
    impact: "A CI-only failure leaves nothing to debug with, so the flake gets retried instead of fixed.",
    fix: `context = browser.newContext(new Browser.NewContextOptions().setRecordVideoDir(Paths.get("target/videos")));\ncontext.tracing().start(new Tracing.StartOptions().setScreenshots(true).setSnapshots(true));`,
    line: launches[0], reference: "https://playwright.dev/java/docs/trace-viewer",
  }, disabledRuleIds);

  // ── Test tagging / grouping ──
  {
    const hasTag = /@Tag\s*\(|@Category\s*\(|groups\s*=\s*[{"']/.test(content);
    if (/@Test\b/.test(content) && !hasTag) pushFinding(findings, {
      ruleId: "PWJ-STD-006", category: "coding_standards", severity: "info",
      title: "Tests carry no @Tag or TestNG group",
      description: "No @Tag, @Category or groups= appears in this file, so its tests cannot be selected by the runner.",
      impact: "CI must run everything on every commit — no smoke subset, and a flaky test can only be excluded by deleting it.",
      fix: `@Test\n@Tag("smoke")\nvoid loadsDashboard() { }`,
      line: lineMatches(content, /@Test\b/)[0] ?? null,
      reference: "https://junit.org/junit5/docs/current/user-guide/#writing-tests-tagging-and-filtering",
    }, disabledRuleIds);
  }

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
