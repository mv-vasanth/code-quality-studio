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

  // ── Selectors ──
  const queryAPI = lineMatches(content, /\.query_selector(?:_all)?\s*\(/);
  if (queryAPI.length) add({ ruleId: "PWPY-SEL-004", category: "selectors", severity: "warning",
    title: "Legacy query_selector API", description: `query_selector()/query_selector_all() returns an ElementHandle on line ${queryAPI[0]}.`, impact: "ElementHandles are resolved once and do not auto-wait or re-query, so they go stale after a re-render.",
    fix: `# Before\nel = page.query_selector(".row")\n# After\nrow = page.locator(".row")\nexpect(row).to_be_visible()`, line: queryAPI[0], reference: "https://playwright.dev/python/docs/locators" });

  // ── Reliability ──
  const networkIdle = lineMatches(content, /wait_until\s*=\s*["']networkidle["']|wait_for_load_state\s*\(\s*["']networkidle["']/);
  if (networkIdle.length) add({ ruleId: "PWPY-REL-005", category: "reliability", severity: "warning",
    title: "Waiting on networkidle", description: `A networkidle wait is used on line ${networkIdle[0]}.`, impact: "Discouraged by Playwright: polling, analytics beacons or websockets keep the network busy and the wait times out or resolves arbitrarily.",
    fix: `# Before\npage.goto("/dashboard", wait_until="networkidle")\n# After\npage.goto("/dashboard")\nexpect(page.get_by_role("heading", name="Dashboard")).to_be_visible()`, line: networkIdle[0], reference: "https://playwright.dev/python/docs/api/class-page#page-goto" });

  const defaultTimeout = lineMatches(content, /set_default_(?:navigation_)?timeout\s*\(/);
  if (defaultTimeout.length) add({ ruleId: "PWPY-REL-006", category: "reliability", severity: "warning",
    title: "Timeout tuned inside the test file", description: `set_default_timeout()/set_default_navigation_timeout() is called on line ${defaultTimeout[0]}.`, impact: "Per-file timeout inflation hides real slowness and drifts out of sync with the project's CI budget.",
    fix: `# pytest.ini / pyproject.toml\n# [tool.pytest.ini_options]\n# ... configure timeout centrally, then rely on auto-waiting assertions\nexpect(page.get_by_role("table")).to_be_visible()`, line: defaultTimeout[0], reference: "https://playwright.dev/python/docs/test-timeouts" });

  const mixedApi = (/from\s+playwright\.sync_api\s+import|playwright\.sync_api\./.test(content))
    && (/from\s+playwright\.async_api\s+import|playwright\.async_api\./.test(content));

  // Only meaningful for a purely-async module; a mixed module is reported by PWPY-REL-008 instead.
  const isAsyncApi = !mixedApi && /async\s+def\s+test_/.test(content);
  const missingAwait = isAsyncApi
    ? lines.map((l, i) => [l, i + 1])
        .filter(([l]) => /(?:\bexpect\s*\(|\bpage\.(?:goto|click|fill|press|check|uncheck|select_option|wait_for_url|set_input_files)\s*\()/.test(l))
        .filter(([l]) => !/\bawait\b/.test(l) && !/^\s*(?:#|from\b|import\b|def\s|async\s+def\s)/.test(l))
        .map(([, n]) => n)
    : [];
  if (missingAwait.length) add({ ruleId: "PWPY-REL-007", category: "reliability", severity: "critical",
    title: "Coroutine not awaited in async test", description: `Line ${missingAwait[0]} calls an async Playwright API without await.`, impact: "The coroutine is never scheduled, so the action or assertion silently does nothing and the test passes vacuously.",
    fix: `# Before\nexpect(page.get_by_role("alert")).to_be_visible()\n# After\nawait expect(page.get_by_role("alert")).to_be_visible()`, line: missingAwait[0], reference: "https://playwright.dev/python/docs/library#async-api" });

  if (mixedApi) add({ ruleId: "PWPY-REL-008", category: "reliability", severity: "critical",
    title: "sync_api and async_api mixed in one module", description: "The module imports from both playwright.sync_api and playwright.async_api.",
    impact: "Sync calls inside a running event loop raise 'Sync API inside asyncio loop'; the two object graphs are not interchangeable.",
    fix: `# Pick one API per module — for pytest-playwright, stay on the sync API\nfrom playwright.sync_api import Page, expect`, line: lineMatches(content, /playwright\.async_api/)[0] ?? null, reference: "https://playwright.dev/python/docs/library" });

  // ── Per-test block scans ──
  const testStarts = [];
  lines.forEach((l, i) => { if (/^\s*(?:async\s+)?def\s+test_/.test(l)) testStarts.push(i); });
  const blockOf = (k) => lines.slice(testStarts[k], k + 1 < testStarts.length ? testStarts[k + 1] : lines.length).join("\n");

  const noAssertTests = /\bexpect\s*\(/.test(content)
    ? testStarts.filter((_, k) => !/\bexpect\s*\(|(?:^|\n)\s*assert\b/.test(blockOf(k))).map((i) => i + 1)
    : [];
  if (noAssertTests.length) add({ ruleId: "PWPY-AST-003", category: "assertions", severity: "warning",
    title: "Test function with no assertion", description: `The test starting on line ${noAssertTests[0]} performs actions but never asserts.`, impact: "It only fails on an exception, so a silently broken page still reports green.",
    fix: `def test_checkout(page: Page) -> None:\n    page.get_by_role("button", name="Pay").click()\n    expect(page.get_by_role("heading", name="Order confirmed")).to_be_visible()`, line: noAssertTests[0], reference: "https://playwright.dev/python/docs/best-practices" });

  const perTestLaunch = testStarts.filter((_, k) => /sync_playwright\s*\(\s*\)|\.launch\s*\(/.test(blockOf(k))).map((i) => i + 1);
  if (perTestLaunch.length) add({ ruleId: "PWPY-PER-002", category: "performance", severity: "warning",
    title: "Browser launched inside a test", description: `The test starting on line ${perTestLaunch[0]} calls sync_playwright()/launch() itself instead of using the page fixture.`, impact: "Each test pays full browser startup cost and loses pytest-playwright's tracing, video and parallel-worker handling.",
    fix: `def test_login(page: Page) -> None:  # pytest-playwright injects a managed page\n    page.goto("/login")`, line: perTestLaunch[0], reference: "https://playwright.dev/python/docs/test-runners" });

  // ── Structure ──
  const skipped = lineMatches(content, /@pytest\.mark\.(?:skip|skipif|xfail)\b|(?:^|\s)pytest\.skip\s*\(/);
  if (skipped.length) add({ ruleId: "PWPY-STR-002", category: "structure", severity: "info",
    title: "Skipped or xfail test", description: `A test is skipped/xfailed at line ${skipped[0]}.`, impact: "Permanently disabled tests rot silently and give false coverage confidence.",
    fix: `@pytest.mark.skip(reason="blocked by BUG-1234, re-enable when fixed")  # always give a reason + ticket`, line: skipped[0], reference: "https://docs.pytest.org/en/stable/how-to/skipping.html" });

  const rawPageCalls = countMatches(content, /\bpage\.(?:goto|locator|get_by_\w+|click|fill|press|check|select_option)\s*\(/g);
  if (hasTests && rawPageCalls >= 15 && !/class\s+\w*Page\b|from\s+\S*pages?\b|import\s+\S*pages?\b/.test(content))
    add({ ruleId: "PWPY-STR-003", category: "structure", severity: "info",
      title: "No page-object abstraction", description: `${rawPageCalls} raw page.* interactions with no page-object class or pages module import.`, impact: "Selectors and flows are duplicated across tests, so one UI change means edits in many files.",
      fix: `class LoginPage:\n    def __init__(self, page: Page) -> None:\n        self.page = page\n        self.submit = page.get_by_role("button", name="Sign in")\n\n    def login(self, user: str, pwd: str) -> None: ...`, line: null, reference: "https://playwright.dev/python/docs/pom" });

  // ── Security ──
  const insecureTls = lineMatches(content, /ignore_https_errors\s*=\s*True/i);
  if (insecureTls.length) add({ ruleId: "PWPY-SEC-002", category: "security", severity: "warning",
    title: "TLS validation disabled", description: `ignore_https_errors=True on line ${insecureTls[0]} turns off certificate checking.`, impact: "The suite passes against a misconfigured or MITM'd endpoint, so certificate regressions reach production unnoticed.",
    fix: `context = browser.new_context()  # trust real certificates; install the CA in CI if needed`, line: insecureTls[0], reference: "https://playwright.dev/python/docs/api/class-browser#browser-new-context" });

  // Tight on purpose: the password field must be *located and filled on the same line*, so an
  // extracted page-object field such as `self.password_field.fill(secret)` is not flagged.
  const uiLogin = lineMatches(content, /(?:get_by_label|get_by_placeholder|get_by_test_id|locator)\s*\(\s*["'][^"']*(?:password|passwd)[^"']*["']\s*\)\s*\.fill\s*\(|\.fill\s*\(\s*os\.environ\[\s*["'][^"']*PASSWORD/i);
  if (uiLogin.length && !/storage_state/.test(content))
    add({ ruleId: "PWPY-SEC-003", category: "security", severity: "warning",
      title: "UI login repeated without storage_state reuse", description: `Credentials are typed into the UI on line ${uiLogin[0]} and no storage_state is saved or loaded.`, impact: "Every test replays the login form — slow, and it spreads real credentials across each worker's traces and videos.",
      fix: `# conftest.py: authenticate once, then reuse\ncontext = browser.new_context(storage_state="auth.json")`, line: uiLogin[0], reference: "https://playwright.dev/python/docs/auth" });

  // ── Coding standards ──
  const swallowed = [];
  lines.forEach((l, i) => {
    const bare = /^\s*except\s*:/.test(l);
    const inlinePass = /^\s*except\b.*:\s*pass\s*$/.test(l);
    const nextPass = /^\s*except\b.*:\s*$/.test(l) && /^\s*pass\s*$/.test(lines[i + 1] ?? "");
    if (bare || inlinePass || nextPass) swallowed.push(i + 1);
  });
  if (swallowed.length) add({ ruleId: "PWPY-STD-004", category: "coding_standards", severity: "warning",
    title: "Exception swallowed in test", description: `A bare or pass-only except block appears on line ${swallowed[0]}.`, impact: "Real failures are converted into passes, which is how a broken flow stays green for weeks.",
    fix: `# Assert the expected state instead of guarding with try/except\nexpect(page.get_by_role("alert")).to_have_text("Saved")`, line: swallowed[0], reference: "https://playwright.dev/python/docs/best-practices" });

  // ── CI / config ──
  const headed = lineMatches(content, /headless\s*=\s*False/);
  if (headed.length) add({ ruleId: "PWPY-CI-002", category: "ci_config", severity: "warning",
    title: "Headed mode hardcoded", description: `headless=False is committed on line ${headed[0]}.`, impact: "CI agents have no display, so the run hangs or crashes; locally it just makes the suite slower.",
    fix: `browser = playwright.chromium.launch()  # use --headed on the CLI when debugging`, line: headed[0], reference: "https://playwright.dev/python/docs/running-tests" });

  const newContext = lineMatches(content, /new_context\s*\(/);
  if (newContext.length && !/tracing\.start|record_video_dir|record_har_path/.test(content))
    add({ ruleId: "PWPY-CI-003", category: "ci_config", severity: "info",
      title: "Browser context without failure artefacts", description: `new_context() on line ${newContext[0]} configures no tracing, video or HAR capture.`, impact: "A CI-only failure leaves nothing to debug with, so the flake gets retried instead of fixed.",
      fix: `context = browser.new_context(record_video_dir="videos/")\ncontext.tracing.start(screenshots=True, snapshots=True)`, line: newContext[0], reference: "https://playwright.dev/python/docs/trace-viewer" });

  // ── Test tagging / markers ──
  {
    const hasMarker = /@pytest\.mark\.\w+/.test(content);
    if (/def\s+test_/.test(content) && !hasMarker) add({
      ruleId: "PWPY-STD-005", category: "coding_standards", severity: "info",
      title: "Tests carry no @pytest.mark marker",
      description: "No @pytest.mark.* marker appears in this file, so its tests cannot be selected with -m.",
      impact: "CI must run the whole suite every time — no smoke subset, and a flaky test can only be excluded by deleting or skipping it outright.",
      fix: `@pytest.mark.smoke\ndef test_dashboard_loads(page):\n    ...\n\n# then: pytest -m smoke\n# register it in pytest.ini to avoid PytestUnknownMarkWarning:\n# [pytest]\n# markers = smoke: fast critical-path checks`,
      line: lineMatches(content, /def\s+test_/)[0] ?? null,
      reference: "https://docs.pytest.org/en/stable/example/markers.html",
    });
  }

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { totalTests: countMatches(content, /def\s+test_/g), hardWaits: waitTimeout.length + sleep.length, xpathLocators: xpath.length, hardcodedSecrets: secrets.length },
    summary: `Playwright (Python) scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
