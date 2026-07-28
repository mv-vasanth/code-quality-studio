/**
 * Offline Playwright quality audit (no API). Heuristic rules only — not a substitute for full AI review.
 * Canonical practices: docs/PLAYWRIGHT_BEST_PRACTICES.md and src/bestPracticesGuide.js
 */

const CATEGORY_IDS = [
  "selectors",
  "reliability",
  "structure",
  "assertions",
  "mobile",
  "security",
  "performance",
  "accessibility",
  "coding_standards",
  "ci_config",
];

function linesOf(content) {
  return content.split(/\r?\n/);
}

function lineMatches(content, re) {
  const lines = linesOf(content);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) hits.push(i + 1);
    re.lastIndex = 0;
  }
  return hits;
}

function countMatches(content, re) {
  const m = content.match(re);
  return m ? m.length : 0;
}

function addFindingLocal(findings, partial, disabledRuleIds) {
  if (disabledRuleIds?.has(partial.ruleId)) return;
  findings.push({
    ruleId: partial.ruleId,
    category: partial.category,
    severity: partial.severity,
    title: partial.title,
    description: partial.description,
    impact: partial.impact,
    fix: partial.fix,
    line: partial.line ?? null,
    reference: partial.reference ?? "Playwright best practices",
  });
}

function scoreFromFindings(findings, category) {
  const cat = findings.filter((f) => f.category === category);
  let s = 100;
  for (const f of cat) {
    if (f.severity === "critical") s -= 18;
    else if (f.severity === "warning") s -= 10;
    else s -= 4;
  }
  return Math.max(0, Math.min(100, s));
}

export function analysePlaywrightLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];

  const xpathLines = [
    ...lineMatches(content, /xpath\s*=/i),
    ...lineMatches(content, /locator\s*\(\s*['"`]\s*\//),
    ...lineMatches(content, /page\.locator\s*\(\s*['"`]\s*\//),
  ];
  const xpathLocators = new Set(xpathLines).size;
  if (xpathLocators > 0) {
    addFindingLocal(findings, {
      ruleId: "PW-SEL-001",
      category: "selectors",
      severity: "warning",
      title: "XPath locators detected",
      description: `${xpathLocators} line(s) use XPath-style locators. Playwright recommends role, label, text, or test id locators for stability.`,
      impact: "XPath breaks easily with DOM changes and is slower to maintain.",
      fix: `// Before\npage.locator('//button[@id="submit"]')\n\n// After\npage.getByRole('button', { name: 'Submit' })`,
      line: xpathLines[0],
      reference: "https://playwright.dev/docs/locators",
    }, disabled);
  }

  const idLines = lineMatches(content, /locator\s*\(\s*['"`]#/);
  const cssIdLocators = idLines.length;
  if (cssIdLocators > 0) {
    addFindingLocal(findings, {
      ruleId: "PW-SEL-002",
      category: "selectors",
      severity: "info",
      title: "CSS ID locators",
      description: "ID-based CSS selectors couple tests to implementation details.",
      impact: "Refactors that rename IDs cause false failures.",
      fix: `page.getByTestId('checkout-submit') // prefer data-testid + getByTestId`,
      line: idLines[0],
    }, disabled);
  }

  const hasUserFacingLocators =
    /getByRole|getByLabel|getByText|getByTestId|getByPlaceholder/.test(content);
  if (!hasUserFacingLocators && /\.(spec|test)\./.test(filename)) {
    addFindingLocal(findings, {
      ruleId: "PW-SEL-003",
      category: "selectors",
      severity: "info",
      title: "No user-facing locators found",
      description: "This file does not use getByRole, getByLabel, getByText, or getByTestId.",
      impact: "Tests may rely on brittle selectors elsewhere in the suite.",
      fix: `// Before
const close = page.locator('ngb-modal-window').locator('button.close').first();

// After
const close = page.getByRole('dialog').getByRole('button', { name: /close/i });`,
      line: null,
    }, disabled);
  }

  const hardWaitLines = lineMatches(content, /waitForTimeout\s*\(/);
  const hardWaits = hardWaitLines.length;
  if (hardWaits > 0) {
    const uniqueWaits = [...new Set(hardWaitLines)];
    uniqueWaits.forEach((ln, idx) => {
      const linesArr = linesOf(content);
      const snippet = linesArr[ln - 1]?.trimEnd() || "await page.waitForTimeout(...);";
      addFindingLocal(findings, {
        ruleId: "PW-REL-001",
        category: "reliability",
        severity: "critical",
        title: uniqueWaits.length > 1 ? `Hard wait (waitForTimeout) — occurrence ${idx + 1}/${uniqueWaits.length}` : "Hard waits (waitForTimeout)",
        description:
          uniqueWaits.length > 1
            ? `Fixed delay at line ${ln} (${hardWaits} total in file). Replace with a web-first assertion.`
            : `${hardWaits} use(s) of waitForTimeout — fixed delays cause flakiness or slow runs.`,
        impact: "CI becomes flaky under load; tests take longer than necessary.",
        fix: `// Before\n${snippet}\n\n// After\nawait expect(page.getByText('Loaded')).toBeVisible();`,
        line: ln,
        reference: "https://playwright.dev/docs/test-assertions",
      }, disabled);
    });
  }

  const dollarLines = lineMatches(content, /page\.\$\$\s*\(/);
  if (dollarLines.length > 0) {
    addFindingLocal(findings, {
      ruleId: "PW-REL-002",
      category: "reliability",
      severity: "warning",
      title: "page.$$() without web-first assertion",
      description: "Bulk element queries often race the UI; prefer locators with auto-waiting.",
      impact: "Intermittent failures when the DOM is still updating.",
      fix: `const row = page.getByRole('row', { name: 'Order 123' });\nawait expect(row).toBeVisible();`,
      line: dollarLines[0],
    }, disabled);
  }

  const totalTests = countMatches(content, /\btest\s*\(/g);
  const hasDescribe = /\btest\.describe\s*\(|\bdescribe\s*\(/.test(content);
  if (totalTests > 0 && !hasDescribe) {
    addFindingLocal(findings, {
      ruleId: "PW-STR-001",
      category: "structure",
      severity: "info",
      title: "No describe grouping",
      description: "Tests are not grouped with test.describe blocks.",
      impact: "Harder to navigate large suites and share setup.",
      fix: `test.describe('Feature name', () => {\n  test.beforeEach(async ({ page }) => { /* shared setup */ });\n  test('your existing test', async ({ page }) => { /* ... */ });\n});`,
      line: null,
    }, disabled);
  }

  const expectAwaitLines = lineMatches(content, /expect\s*\(\s*await\b/);
  if (expectAwaitLines.length > 0) {
    addFindingLocal(findings, {
      ruleId: "PW-AST-001",
      category: "assertions",
      severity: "warning",
      title: "expect(await ...) anti-pattern",
      description: "Awaiting inside expect() bypasses Playwright's web-first assertion retries.",
      impact: "Assertions fail without retrying, increasing flake.",
      fix: `// Before\nexpect(await page.getByText('Hi').isVisible()).toBe(true);\n\n// After\nawait expect(page.getByText('Hi')).toBeVisible();`,
      line: expectAwaitLines[0],
    }, disabled);
  }

  const expectCount = countMatches(content, /\bexpect\s*\(/g);
  const missingAssertions = Math.max(0, totalTests - expectCount);
  if (totalTests > 0 && expectCount === 0) {
    addFindingLocal(findings, {
      ruleId: "PW-AST-002",
      category: "assertions",
      severity: "critical",
      title: "No expect() assertions",
      description: "Test blocks exist but no expect() calls were found.",
      impact: "Tests may pass without verifying behavior.",
      fix: `await expect(page).toHaveURL(/dashboard/);\nawait expect(page.getByRole('heading')).toHaveText('Welcome');`,
      line: null,
    }, disabled);
  }

  const hasMobile =
    /viewport|devices\[|isMobile|touchscreen|project.*mobile/i.test(content) ||
    /projects\s*:/.test(content);
  const noMobileConfig = !hasMobile;
  if (noMobileConfig && /\.(spec|test)\./.test(filename)) {
    addFindingLocal(findings, {
      ruleId: "PW-MOB-001",
      category: "mobile",
      severity: "info",
      title: "No mobile / viewport signals",
      description: "No viewport, device, or mobile project configuration referenced in this file.",
      impact: "Responsive regressions may go unnoticed.",
      fix: `// playwright.config.ts — add a mobile project\n{ name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }`,
      line: null,
    }, disabled);
  }

  const credLines = lineMatches(
    content,
    /(?:password|api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]{4,}['"]/i,
  ).filter((ln) => {
    const line = linesOf(content)[ln - 1];
    return !/process\.env|import\.meta\.env|example\.com|your_/i.test(line);
  });
  const hardcodedCredentials = credLines.length;
  if (hardcodedCredentials > 0) {
    addFindingLocal(findings, {
      ruleId: "PW-SEC-001",
      category: "security",
      severity: "critical",
      title: "Possible hardcoded secret",
      description: "Literal password, token, or API key pattern in source.",
      impact: "Secrets in repos leak via git history and CI logs.",
      fix: `const password = process.env.E2E_PASSWORD;\ntest.use({ storageState: 'auth.json' });`,
      line: credLines[0],
    }, disabled);
  }

  const gotoCount = countMatches(content, /page\.goto\s*\(/g);
  if (gotoCount > 3) {
    addFindingLocal(findings, {
      ruleId: "PW-PER-001",
      category: "performance",
      severity: "info",
      title: "Many page.goto calls",
      description: `${gotoCount} navigations in one file — consider storageState or shared setup.`,
      impact: "Slower suites and more network noise.",
      fix: `test.beforeEach(async ({ page }) => {\n  await page.goto('/app');\n});`,
      line: lineMatches(content, /page\.goto\s*\(/)[0],
    }, disabled);
  }

  if (!/getByRole|keyboard|press\s*\(|tab\s*\)/i.test(content) && totalTests > 0) {
    addFindingLocal(findings, {
      ruleId: "PW-A11Y-001",
      category: "accessibility",
      severity: "info",
      title: "Limited accessibility-oriented interactions",
      description: "No keyboard navigation or role-based interaction patterns detected.",
      impact: "A11y regressions may not be caught by UI tests.",
      fix: `await page.getByRole('button', { name: 'Next' }).focus();\nawait page.keyboard.press('Enter');`,
      line: null,
    }, disabled);
  }

  if (/\.only\s*\(|test\.only|describe\.only/.test(content)) {
    addFindingLocal(findings, {
      ruleId: "PW-STD-001",
      category: "coding_standards",
      severity: "critical",
      title: "Focused test (.only)",
      description: "test.only or describe.only prevents other tests from running in CI.",
      impact: "Most of the suite may be skipped accidentally.",
      fix: "Remove .only before merging.",
      line: lineMatches(content, /\.only\s*\(/)[0],
    }, disabled);
  }

  const hardcodedUrlLines = lineMatches(content, /goto\s*\(\s*['"]https?:\/\//);
  if (hardcodedUrlLines.length > 0) {
    addFindingLocal(findings, {
      ruleId: "PW-CI-001",
      category: "ci_config",
      severity: "warning",
      title: "Hardcoded absolute URLs",
      description: "Use baseURL in playwright.config and relative paths in tests.",
      impact: "Tests break across environments (local, staging, CI).",
      fix: `// playwright.config.ts: use: { baseURL: process.env.BASE_URL }\nawait page.goto('/login');`,
      line: hardcodedUrlLines[0],
    }, disabled);
  }

  // ── Advanced / SME-level checks ─────────────────────────────
  const first = (re) => lineMatches(content, re)[0] ?? null;

  // Selectors
  const nthLines = lineMatches(content, /\.nth\s*\(/);
  if (nthLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-SEL-004", category: "selectors", severity: "info",
      title: "Index-based locator (.nth)",
      description: "Selecting elements by position couples the test to DOM order.",
      impact: "Adding or reordering elements silently breaks the test.",
      fix: `// Prefer a unique, meaningful locator\nawait page.getByRole('row', { name: 'Order 123' }).click();`,
      line: nthLines[0], reference: "https://playwright.dev/docs/locators",
    }, disabled);
  }

  const legacyEngineLines = lineMatches(content, /locator\s*\(\s*['"`](text|css)\s*=/i);
  if (legacyEngineLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-SEL-005", category: "selectors", severity: "info",
      title: "Legacy string selector engine",
      description: "Uses locator('text=' / 'css=') string engines instead of the getBy* API.",
      impact: "Less readable and misses accessibility-aligned matching.",
      fix: `// Before\npage.locator('text=Submit')\n// After\npage.getByText('Submit')`,
      line: legacyEngineLines[0], reference: "https://playwright.dev/docs/locators",
    }, disabled);
  }

  // Reliability
  const waitForSelLines = lineMatches(content, /waitForSelector\s*\(/);
  if (waitForSelLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-REL-003", category: "reliability", severity: "warning",
      title: "waitForSelector used",
      description: "Explicit waitForSelector is rarely needed — locators auto-wait.",
      impact: "Adds redundant waits and hides real timing assumptions.",
      fix: `// Before\nawait page.waitForSelector('.row');\n// After\nawait expect(page.getByRole('row')).toBeVisible();`,
      line: waitForSelLines[0], reference: "https://playwright.dev/docs/actionability",
    }, disabled);
  }

  const networkidleLines = lineMatches(content, /networkidle/);
  if (networkidleLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-REL-004", category: "reliability", severity: "warning",
      title: "waitForLoadState('networkidle')",
      description: "networkidle is discouraged — it's flaky on apps with polling or long-lived connections.",
      impact: "Tests hang or flake depending on background requests.",
      fix: `// Wait for a concrete UI signal instead\nawait expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();`,
      line: networkidleLines[0], reference: "https://playwright.dev/docs/navigations",
    }, disabled);
  }

  const waitForNavLines = lineMatches(content, /waitForNavigation\s*\(/);
  if (waitForNavLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-REL-005", category: "reliability", severity: "warning",
      title: "Deprecated waitForNavigation",
      description: "waitForNavigation is deprecated in favour of waitForURL or auto-waiting actions.",
      impact: "Race conditions and deprecation warnings.",
      fix: `// Before\nawait page.waitForNavigation();\n// After\nawait page.waitForURL('**/dashboard');`,
      line: waitForNavLines[0], reference: "https://playwright.dev/docs/api/class-page#page-wait-for-url",
    }, disabled);
  }

  const condLines = lineMatches(content, /if\s*\(\s*await[^)]*\.(isVisible|isHidden|isEnabled|isChecked|isEditable)\s*\(/);
  if (condLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-REL-006", category: "reliability", severity: "warning",
      title: "Conditional on element state",
      description: "Branching on await isVisible()/isEnabled() snapshots a moment in time and is inherently racy.",
      impact: "Intermittent behaviour depending on timing.",
      fix: `// Assert the expected state deterministically\nawait expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();`,
      line: condLines[0], reference: "https://playwright.dev/docs/best-practices",
    }, disabled);
  }

  // Structure / hooks
  if (/describe\.serial\s*\(|mode\s*:\s*['"]serial['"]/.test(content)) {
    addFindingLocal(findings, {
      ruleId: "PW-STR-002", category: "structure", severity: "warning",
      title: "Serial mode couples tests",
      description: "describe.serial / mode:'serial' makes tests depend on each other and disables parallelism.",
      impact: "One failure cascades; suite runs slower.",
      fix: "Make each test independent (own setup + data) and remove serial mode.",
      line: first(/describe\.serial\s*\(|mode\s*:\s*['"]serial['"]/),
      reference: "https://playwright.dev/docs/test-parallel",
    }, disabled);
  }

  const beforeAllLines = lineMatches(content, /\b(beforeAll|afterAll)\s*\(/);
  if (beforeAllLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-STR-003", category: "structure", severity: "info",
      title: "beforeAll/afterAll shared state",
      description: "State created once in beforeAll is shared across tests and can leak between them.",
      impact: "Order-dependent, hard-to-debug flakiness.",
      fix: `// Prefer per-test isolation\ntest.beforeEach(async ({ page }) => { /* fresh setup */ });`,
      line: beforeAllLines[0], reference: "https://playwright.dev/docs/test-fixtures",
    }, disabled);
  }

  // Assertions
  const weakAssertLines = lineMatches(content, /\.toBe(Truthy|Falsy)\s*\(/);
  if (weakAssertLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-AST-003", category: "assertions", severity: "info",
      title: "Weak assertion (toBeTruthy/toBeFalsy)",
      description: "Asserting truthiness hides what is actually expected.",
      impact: "Passes for the wrong reasons; poor failure messages.",
      fix: `// Assert the concrete state\nawait expect(page.getByRole('alert')).toHaveText('Saved');`,
      line: weakAssertLines[0], reference: "https://playwright.dev/docs/test-assertions",
    }, disabled);
  }

  const nonPwAssertLines = lineMatches(content, /(^|[^.\w])assert\s*\(|from\s+['"]chai['"]/);
  if (nonPwAssertLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-AST-004", category: "assertions", severity: "warning",
      title: "Non-Playwright assertion library",
      description: "Node assert / chai run once and don't retry like Playwright's web-first expect.",
      impact: "Flaky assertions on async UI.",
      fix: `// Use Playwright's expect\nawait expect(locator).toBeVisible();`,
      line: nonPwAssertLines[0], reference: "https://playwright.dev/docs/test-assertions",
    }, disabled);
  }

  // Coding standards
  const pauseLines = lineMatches(content, /page\.pause\s*\(/);
  if (pauseLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-STD-002", category: "coding_standards", severity: "warning",
      title: "page.pause() left in code",
      description: "page.pause() opens the inspector and blocks execution.",
      impact: "Hangs the run in CI.",
      fix: "Remove page.pause() before committing.",
      line: pauseLines[0], reference: "https://playwright.dev/docs/debug",
    }, disabled);
  }

  const consoleLines = lineMatches(content, /console\.(log|debug|info)\s*\(/);
  if (consoleLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-STD-003", category: "coding_standards", severity: "info",
      title: "console logging in tests",
      description: "Leftover console.* calls add noise to test output.",
      impact: "Harder to read reports; can leak data.",
      fix: "Remove debug logs or rely on the reporter / trace.",
      line: consoleLines[0],
    }, disabled);
  }

  const skipLines = lineMatches(content, /(test|describe)\.(skip|fixme)\s*\(/);
  if (skipLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-STD-004", category: "coding_standards", severity: "info",
      title: "Skipped / fixme test committed",
      description: "test.skip / test.fixme silently removes coverage.",
      impact: "A skipped test looks green but verifies nothing.",
      fix: "Fix and re-enable, or track the skip with a linked issue.",
      line: skipLines[0], reference: "https://playwright.dev/docs/test-annotations",
    }, disabled);
  }

  // Security
  const insecureTlsLines = lineMatches(content, /ignoreHTTPSErrors\s*:\s*true/);
  if (insecureTlsLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-SEC-002", category: "security", severity: "warning",
      title: "ignoreHTTPSErrors enabled",
      description: "Disabling TLS validation can mask real certificate problems.",
      impact: "Tests pass against misconfigured/insecure endpoints.",
      fix: "Remove ignoreHTTPSErrors; trust the environment's real certificates.",
      line: insecureTlsLines[0], reference: "https://playwright.dev/docs/api/class-testoptions",
    }, disabled);
  }

  const urlCredLines = lineMatches(content, /https?:\/\/[^\s'"/@]+:[^\s'"/@]+@/);
  if (urlCredLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-SEC-003", category: "security", severity: "critical",
      title: "Credentials embedded in URL",
      description: "A user:password@host URL hard-codes credentials in source.",
      impact: "Secrets leak through git history and CI logs.",
      fix: `// Use httpCredentials from env instead\nuse: { httpCredentials: { username: process.env.USER, password: process.env.PASS } }`,
      line: urlCredLines[0], reference: "https://playwright.dev/docs/api/class-browser#browser-new-context",
    }, disabled);
  }

  // CI / config
  const headfulLines = lineMatches(content, /headless\s*:\s*false/);
  if (headfulLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-CI-002", category: "ci_config", severity: "warning",
      title: "headless: false committed",
      description: "Forcing headed mode slows CI and can fail on headless agents.",
      impact: "Slower, less portable runs.",
      fix: "Let headless default to true; override locally with --headed when debugging.",
      line: headfulLines[0], reference: "https://playwright.dev/docs/ci",
    }, disabled);
  }

  const perTestTimeoutLines = lineMatches(content, /test\.setTimeout\s*\(/);
  if (perTestTimeoutLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-CI-003", category: "ci_config", severity: "info",
      title: "Hardcoded per-test timeout",
      description: "test.setTimeout() often masks a slow or flaky flow rather than fixing it.",
      impact: "Hides real performance problems.",
      fix: "Investigate the slowness; set global timeout in config if genuinely needed.",
      line: perTestTimeoutLines[0], reference: "https://playwright.dev/docs/test-timeouts",
    }, disabled);
  }

  // Mobile
  const viewportLines = lineMatches(content, /setViewportSize\s*\(/);
  if (viewportLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-MOB-002", category: "mobile", severity: "info",
      title: "Hardcoded viewport size",
      description: "setViewportSize hardcodes dimensions instead of using device descriptors.",
      impact: "Misses real device user-agent and touch behaviour.",
      fix: `// playwright.config: { name: 'mobile', use: { ...devices['Pixel 5'] } }`,
      line: viewportLines[0], reference: "https://playwright.dev/docs/emulation#devices",
    }, disabled);
  }

  // Performance
  const screenshotLines = lineMatches(content, /page\.screenshot\s*\(/);
  if (screenshotLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-PER-002", category: "performance", severity: "info",
      title: "Manual page.screenshot in test",
      description: "Taking screenshots inline slows tests; capture-on-failure is usually better.",
      impact: "Slower runs and unnecessary artifacts.",
      fix: `// playwright.config: use: { screenshot: 'only-on-failure' }`,
      line: screenshotLines[0], reference: "https://playwright.dev/docs/screenshots",
    }, disabled);
  }

  // ── Batch 2: deeper SME checks ──────────────────────────────
  const forceLines = lineMatches(content, /\bforce\s*:\s*true/);
  if (forceLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-REL-007", category: "reliability", severity: "warning",
      title: "force: true bypasses actionability",
      description: "Passing { force: true } skips Playwright's visibility/enabled/stable checks.",
      impact: "Hides real UI problems and produces false passes.",
      fix: `// Remove force and let auto-waiting verify the element is actionable\nawait page.getByRole('button', { name: 'Save' }).click();`,
      line: forceLines[0], reference: "https://playwright.dev/docs/actionability",
    }, disabled);
  }

  const lowLevelDomLines = lineMatches(content, /\.\$\$?eval\s*\(|elementHandle/);
  if (lowLevelDomLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-REL-008", category: "reliability", severity: "warning",
      title: "Low-level DOM access ($eval / elementHandle)",
      description: "$eval, $$eval, and elementHandle bypass locators and auto-waiting.",
      impact: "Stale references and race conditions.",
      fix: `// Prefer a locator + web-first assertion\nawait expect(page.getByRole('listitem')).toHaveCount(3);`,
      line: lowLevelDomLines[0], reference: "https://playwright.dev/docs/locators",
    }, disabled);
  }

  const sleepLines = lineMatches(content, /setTimeout\s*\(|\bsleep\s*\(/);
  if (sleepLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-STD-005", category: "coding_standards", severity: "info",
      title: "Arbitrary sleep in test",
      description: "setTimeout / custom sleep() introduces a fixed delay like waitForTimeout.",
      impact: "Flaky and slow; masks missing assertions.",
      fix: `// Wait on a real condition instead\nawait expect(page.getByText('Ready')).toBeVisible();`,
      line: sleepLines[0], reference: "https://playwright.dev/docs/test-assertions",
    }, disabled);
  }

  const disableSecLines = lineMatches(content, /disable-web-security/i);
  if (disableSecLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-SEC-004", category: "security", severity: "warning",
      title: "Browser security disabled",
      description: "Launching with --disable-web-security turns off same-origin protections.",
      impact: "Tests pass in a configuration real users never run.",
      fix: "Remove the flag; mock cross-origin calls with page.route instead.",
      line: disableSecLines[0], reference: "https://playwright.dev/docs/api/class-browsertype",
    }, disabled);
  }

  if (totalTests > 0 && !/axe|AxeBuilder/i.test(content)) {
    addFindingLocal(findings, {
      ruleId: "PW-A11Y-002", category: "accessibility", severity: "info",
      title: "No automated accessibility scan",
      description: "This spec has tests but no @axe-core/playwright audit.",
      impact: "WCAG regressions ship unnoticed.",
      fix: `import AxeBuilder from '@axe-core/playwright';\nconst results = await new AxeBuilder({ page }).analyze();\nexpect(results.violations).toEqual([]);`,
      line: null, reference: "https://playwright.dev/docs/accessibility-testing",
    }, disabled);
  }

  const slowLines = lineMatches(content, /test\.slow\s*\(/);
  if (slowLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-PER-003", category: "performance", severity: "info",
      title: "test.slow() used",
      description: "test.slow() triples the timeout instead of addressing why the test is slow.",
      impact: "Masks a genuinely slow flow.",
      fix: "Investigate the slow step (network, waits) rather than extending the budget.",
      line: slowLines[0], reference: "https://playwright.dev/docs/test-timeouts",
    }, disabled);
  }

  const snapshotLines = lineMatches(content, /toMatchSnapshot\s*\(/);
  if (snapshotLines.length) {
    addFindingLocal(findings, {
      ruleId: "PW-AST-005", category: "assertions", severity: "info",
      title: "Brittle snapshot assertion",
      description: "toMatchSnapshot on text/DOM breaks on trivial, intentional changes.",
      impact: "Noisy failures and rubber-stamped updates.",
      fix: `// Assert the specific thing that matters\nawait expect(page.getByRole('heading')).toHaveText('Welcome');`,
      line: snapshotLines[0], reference: "https://playwright.dev/docs/test-snapshots",
    }, disabled);
  }

  // Heuristic: leftover unfinished / AI-generated boilerplate artifacts.
  // NOT a claim that the file was "written by AI" — it flags stubs, placeholders,
  // and stray assistant chatter that indicate the code isn't finished.
  const artifactLines = lineMatches(
    content,
    /\/\/\s*(todo|fixme|\.\.\.|your (existing|code|logic)|add your|rest of (the )?code|implement (this|here)|replace (this )?with|paste (your )?|insert (your )?)|as an ai\b|language model|here'?s (the|your) (code|updated|full|complete)|\bcertainly[!,]|your[_-]?value[_-]?here|YOUR_[A-Z0-9_]+_HERE/i,
  );
  if (artifactLines.length) {
    const snippet = linesOf(content)[artifactLines[0] - 1]?.trim()?.slice(0, 80) || "";
    addFindingLocal(findings, {
      ruleId: "PW-STD-006", category: "coding_standards", severity: "warning",
      title: "Possible unfinished / AI-boilerplate code",
      description: `Placeholder or generated-boilerplate marker detected${snippet ? `: "${snippet}"` : ""}. This flags stubs and leftover assistant text, not proof of AI authorship.`,
      impact: "Half-finished code can ship with stubs, fake values, or no real assertions.",
      fix: "Replace placeholders/TODOs with real logic and values, and remove any assistant chatter before merging.",
      line: artifactLines[0], reference: "Team standards",
    }, disabled);
  }

  const categoryScores = Object.fromEntries(
    CATEGORY_IDS.map((id) => [id, scoreFromFindings(findings, id)]),
  );
  const overallScore = Math.round(
    CATEGORY_IDS.reduce((sum, id) => sum + categoryScores[id], 0) / CATEGORY_IDS.length,
  );

  const crit = findings.filter((f) => f.severity === "critical").length;
  const summary =
    crit > 0
      ? `Local rules scan of ${filename}: ${findings.length} finding(s), including ${crit} critical. Scores are heuristic — add an API key for deeper AI review.`
      : `Local rules scan of ${filename}: ${findings.length} finding(s). No critical issues from built-in rules. Add VITE_ANTHROPIC_API_KEY for full AI analysis.`;

  const positives = [];
  if (hasUserFacingLocators) {
    positives.push({
      title: "User-facing locators",
      description: "Uses getByRole, getByLabel, getByText, or getByTestId.",
    });
  }
  if (hardWaits === 0) {
    positives.push({
      title: "No hard waits",
      description: "No waitForTimeout detected in this file.",
    });
  }
  if (expectCount > 0 && missingAssertions === 0) {
    positives.push({
      title: "Assertions present",
      description: "expect() usage aligns with test blocks.",
    });
  }
  if (positives.length === 0) {
    positives.push({
      title: "File loaded successfully",
      description: "Run with an API key later for narrative recommendations.",
    });
  }

  const immediate = findings
    .filter((f) => f.severity === "critical")
    .map((f) => f.title);
  if (!immediate.length) {
    immediate.push("Review warning-level selector and reliability findings.");
  }

  return {
    overallScore,
    categoryScores,
    summary,
    topPriority: findings.find((f) => f.severity === "critical")?.title ?? findings[0]?.title ?? "Keep improving locator strategy and assertions.",
    findings,
    positives,
    metrics: {
      totalTests,
      hardWaits,
      xpathLocators,
      cssIdLocators,
      hardcodedCredentials,
      missingAssertions,
      noMobileConfig,
    },
    roadmap: [
      {
        phase: "Immediate (Day 1)",
        color: "#dc2626",
        actions: immediate.slice(0, 3),
      },
      {
        phase: "Short-term (Week 1)",
        color: "#d97706",
        actions: [
          "Replace brittle locators with getByRole / getByTestId",
          "Remove waitForTimeout in favor of web-first assertions",
        ],
      },
      {
        phase: "Long-term (Month 1)",
        color: "#16a34a",
        actions: [
          "Introduce Page Object Model or fixtures for shared flows",
          "Add mobile project in playwright.config.ts",
        ],
      },
    ],
    _analysisMode: "local",
  };
}

export function shouldUseLocalAnalysis() {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY?.trim();
  if (import.meta.env.VITE_ANALYSIS_MODE === "ai") return false;
  if (import.meta.env.VITE_ANALYSIS_MODE === "local") return true;
  if (!key) return true;
  if (key === "sk-ant-YOUR_KEY_HERE" || key.includes("YOUR_KEY")) return true;
  return false;
}
