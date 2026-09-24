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
  // Rules whose prerequisite was not met — shown as "Skipped" in the UI
  // instead of silently counting as a passing score.
  const skippedRules = [];

  const xpathLines = [
    ...lineMatches(content, /xpath\s*=/i),
    ...lineMatches(content, /locator\s*\(\s*['"`]\s*\//),
    ...lineMatches(content, /page\.locator\s*\(\s*['"`]\s*\//),
  ];
  const xpathLocators = new Set(xpathLines).size;
  if (xpathLocators === 0) {
    skippedRules.push({ ruleId: "PW-SEL-006", reason: "No XPath locators found in this file" });
  }
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

  // PW-SEL-006: repeated identical XPath within the same file
  if (xpathLocators > 0) {
    const lines = linesOf(content);
    const xpathCounts = {};
    const xpathFirstLine = {};
    const xpathRe = /(?:locator|page\.locator)\s*\(\s*['"`](\/[^'"`]+|xpath=[^'"`]+)['"`]/g;
    lines.forEach((line, idx) => {
      let m;
      while ((m = xpathRe.exec(line)) !== null) {
        const xpath = m[1].trim();
        xpathCounts[xpath] = (xpathCounts[xpath] || 0) + 1;
        if (!xpathFirstLine[xpath]) xpathFirstLine[xpath] = idx + 1;
      }
    });
    const dupes = Object.entries(xpathCounts).filter(([, n]) => n >= 2);
    dupes.forEach(([xpath, count]) => {
      const short = xpath.length > 60 ? xpath.slice(0, 60) + "…" : xpath;
      addFindingLocal(findings, {
        ruleId: "PW-SEL-006",
        category: "selectors",
        severity: "warning",
        title: "Repeated XPath within file",
        description: `The XPath "${short}" is used ${count} times in this file.`,
        impact: "Repeated XPaths must be updated in multiple places when the DOM changes, increasing maintenance cost.",
        fix: `// Extract to a helper or page-object method:\nconst submitBtn = page.locator('${xpath}');\n// Then reuse submitBtn throughout the test`,
        line: xpathFirstLine[xpath],
        reference: "https://playwright.dev/docs/pom",
      }, disabled);
    });
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

  // ── Batch 3: Naming conventions & industry code practices (PW-NMC-*  PW-CPX-*) ──
  const fileLines = linesOf(content);

  // PW-NMC-001: Variable declared with PascalCase (should be camelCase)
  {
    const nmcVarMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /^\s*(?:const|let|var)\s+([A-Z][a-zA-Z0-9]+)\s*[=:]/.exec(line);
      if (!m) return;
      const name = m[1];
      if (/^[A-Z][A-Z0-9_]+$/.test(name)) return; // SCREAMING_SNAKE_CASE allowed for true constants
      if (/^\s*(?:const|let|var)\s*\{/.test(line)) return; // destructuring
      nmcVarMatches.push({ line: idx + 1, name });
    });
    if (nmcVarMatches.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-NMC-001", category: "coding_standards", severity: "warning",
        title: "Variable name should be camelCase",
        description: `${nmcVarMatches.length} variable(s) use PascalCase: ${nmcVarMatches.slice(0, 3).map((m) => `"${m.name}" (line ${m.line})`).join(", ")}${nmcVarMatches.length > 3 ? "…" : ""}. Variables should use camelCase.`,
        impact: "PascalCase is reserved for classes, types, and constructors — using it for variables causes confusion.",
        fix: `// Before\nconst MyVariable = 'value';\n\n// After\nconst myVariable = 'value';`,
        line: nmcVarMatches[0].line, reference: "https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html",
      }, disabled);
    }
  }

  // PW-NMC-002: Class declared with camelCase (should be PascalCase)
  {
    const nmcClassMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([a-z][a-zA-Z0-9]*)[\s{<(]/.exec(line);
      if (m) nmcClassMatches.push({ line: idx + 1, name: m[1] });
    });
    if (nmcClassMatches.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-NMC-002", category: "coding_standards", severity: "critical",
        title: "Class name should be PascalCase",
        description: `Class "${nmcClassMatches[0].name}" uses camelCase. Class names must start with an uppercase letter (PascalCase).`,
        impact: "Readers and tools cannot distinguish classes from regular functions without PascalCase naming.",
        fix: `// Before\nclass checkoutPage { }\n\n// After\nclass CheckoutPage { }`,
        line: nmcClassMatches[0].line, reference: "https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html",
      }, disabled);
    }
  }

  // PW-NMC-003: Standalone function named PascalCase in a spec file (should be camelCase)
  {
    const nmcFuncMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Z][a-zA-Z0-9]+)\s*\(/.exec(line);
      if (m) nmcFuncMatches.push({ line: idx + 1, name: m[1] });
    });
    if (nmcFuncMatches.length > 0 && /\.(spec|test)\./.test(filename)) {
      addFindingLocal(findings, {
        ruleId: "PW-NMC-003", category: "coding_standards", severity: "info",
        title: "Helper function should be camelCase in spec file",
        description: `Function "${nmcFuncMatches[0].name}" uses PascalCase. In test files, helper and setup functions should use camelCase; PascalCase is reserved for classes.`,
        impact: "PascalCase functions look like constructors — misleads reviewers when used as plain helpers.",
        fix: `// Before\nasync function LoginHelper(page) { }\n\n// After\nasync function loginHelper(page) { }`,
        line: nmcFuncMatches[0].line, reference: "https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Writing_style_guide/Code_style_guide/JavaScript",
      }, disabled);
    }
  }

  // PW-NMC-004: Non-descriptive test name (very short or generic keyword)
  {
    const nmcTestNameMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /\btest\s*\(\s*['"`]([^'"`]{1,9})['"`]/.exec(line);
      if (!m) return;
      const name = m[1].trim();
      if (/^(test\d*|ok|check|verify|should|spec\d*|case\d*|\.\.\.|step\d*|flow\d*|it)$/i.test(name) || name.length < 5) {
        nmcTestNameMatches.push({ line: idx + 1, name });
      }
    });
    if (nmcTestNameMatches.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-NMC-004", category: "coding_standards", severity: "info",
        title: "Non-descriptive test name",
        description: `${nmcTestNameMatches.length} test(s) have vague names: ${nmcTestNameMatches.slice(0, 3).map((m) => `"${m.name}" (line ${m.line})`).join(", ")}. Test names should describe the behaviour under test.`,
        impact: "Vague names make failure reports unreadable and hide intent.",
        fix: `// Before\ntest('ok', async ({ page }) => { });\n\n// After\ntest('shows success toast when checkout completes', async ({ page }) => { });`,
        line: nmcTestNameMatches[0].line, reference: "https://playwright.dev/docs/test-annotations",
      }, disabled);
    }
  }

  // PW-NMC-005: TypeScript interface name not PascalCase
  {
    const nmcInterfaceMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /^\s*(?:export\s+)?interface\s+([a-z][a-zA-Z0-9]*)[\s{<]/.exec(line);
      if (m) nmcInterfaceMatches.push({ line: idx + 1, name: m[1] });
    });
    if (nmcInterfaceMatches.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-NMC-005", category: "coding_standards", severity: "warning",
        title: "Interface name should be PascalCase",
        description: `Interface "${nmcInterfaceMatches[0].name}" does not use PascalCase. TypeScript interfaces must start with an uppercase letter.`,
        impact: "Non-PascalCase interfaces are indistinguishable from variables in code reviews.",
        fix: `// Before\ninterface userProfile { name: string }\n\n// After\ninterface UserProfile { name: string }`,
        line: nmcInterfaceMatches[0].line, reference: "https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html",
      }, disabled);
    }
  }

  // PW-NMC-006: TypeScript type alias not PascalCase
  {
    const nmcTypeMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /^\s*(?:export\s+)?type\s+([a-z][a-zA-Z0-9]*)\s*[=<]/.exec(line);
      if (m) nmcTypeMatches.push({ line: idx + 1, name: m[1] });
    });
    if (nmcTypeMatches.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-NMC-006", category: "coding_standards", severity: "warning",
        title: "Type alias should be PascalCase",
        description: `Type alias "${nmcTypeMatches[0].name}" does not use PascalCase. TypeScript type aliases should start with an uppercase letter.`,
        impact: "Inconsistent casing between types and interfaces causes confusion.",
        fix: `// Before\ntype userStatus = 'active' | 'inactive';\n\n// After\ntype UserStatus = 'active' | 'inactive';`,
        line: nmcTypeMatches[0].line, reference: "https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html",
      }, disabled);
    }
  }

  // PW-NMC-007: Enum name not PascalCase
  {
    const nmcEnumMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /^\s*(?:export\s+)?(?:const\s+)?enum\s+([a-z][a-zA-Z0-9]*)[\s{]/.exec(line);
      if (m) nmcEnumMatches.push({ line: idx + 1, name: m[1] });
    });
    if (nmcEnumMatches.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-NMC-007", category: "coding_standards", severity: "warning",
        title: "Enum name should be PascalCase",
        description: `Enum "${nmcEnumMatches[0].name}" does not use PascalCase. Enum names should start with an uppercase letter.`,
        impact: "Lowercase enum names break the visual contract between types and values.",
        fix: `// Before\nenum userRole { admin = 'admin' }\n\n// After\nenum UserRole { Admin = 'admin' }`,
        line: nmcEnumMatches[0].line, reference: "https://www.typescriptlang.org/docs/handbook/enums.html",
      }, disabled);
    }
  }

  // PW-NMC-008: Boolean variable missing is/has/can/should prefix
  {
    const BOOL_OK_WORDS = /^(enabled|disabled|visible|hidden|active|inactive|valid|invalid|ready|loaded|open|closed|checked|selected|focused|required|optional|editable|found|exists|success|failed|done|complete|empty|full|dirty|pending|busy|running|stopped|muted|expanded|collapsed|published|archived|verified|confirmed|approved|rejected)$/i;
    const nmcBoolMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /^\s*(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*boolean)?\s*=\s*(true|false)\b/.exec(line);
      if (!m) return;
      const varName = m[1];
      if (/^(is|has|can|should|was|will|did|are|were|would|could|shall)[A-Z_]/.test(varName)) return;
      if (BOOL_OK_WORDS.test(varName)) return;
      nmcBoolMatches.push({ line: idx + 1, name: varName });
    });
    if (nmcBoolMatches.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-NMC-008", category: "coding_standards", severity: "info",
        title: "Boolean variable missing is/has/can prefix",
        description: `"${nmcBoolMatches[0].name}" is assigned a boolean literal but does not use the is/has/can/should naming convention.`,
        impact: "Without the is/has prefix, readers cannot tell at a glance that a variable is boolean.",
        fix: `// Before\nconst loggedIn = true;\n\n// After\nconst isLoggedIn = true;`,
        line: nmcBoolMatches[0].line, reference: "https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html",
      }, disabled);
    }
  }

  // PW-NMC-009: Describe block name starts with lowercase
  {
    const nmcDescribeMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /(?:test\.describe|describe)\s*\(\s*['"`]([a-z][^'"`]*)['"`]/.exec(line);
      if (m) nmcDescribeMatches.push({ line: idx + 1, name: m[1] });
    });
    if (nmcDescribeMatches.length > 0) {
      const ex = nmcDescribeMatches[0];
      addFindingLocal(findings, {
        ruleId: "PW-NMC-009", category: "coding_standards", severity: "info",
        title: "Describe block name starts with lowercase",
        description: `describe("${ex.name.slice(0, 45)}${ex.name.length > 45 ? "…" : ""}") — block names conventionally start with an uppercase letter for readability in reports.`,
        impact: "Inconsistent capitalisation in test reports makes it harder to scan suites at a glance.",
        fix: `// Before\ndescribe('checkout flow', () => { });\n\n// After\ndescribe('Checkout flow', () => { });`,
        line: ex.line, reference: "Team standards",
      }, disabled);
    }
  }

  // PW-NMC-010: Underscore-prefixed variable (outdated private notation)
  {
    const nmcUnderscoreMatches = [];
    fileLines.forEach((line, idx) => {
      const m = /^\s*(?:const|let|var)\s+(_[a-zA-Z][a-zA-Z0-9_]*)/.exec(line);
      if (m) nmcUnderscoreMatches.push({ line: idx + 1, name: m[1] });
    });
    if (nmcUnderscoreMatches.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-NMC-010", category: "coding_standards", severity: "info",
        title: "Underscore-prefixed variable (outdated private notation)",
        description: `"${nmcUnderscoreMatches[0].name}" uses a leading underscore. This was a pre-ES6 convention; use \`private\` (TypeScript) or \`#privateField\` (JS) instead.`,
        impact: "Underscore-prefix is a naming workaround, not an enforcement mechanism — private/# provides real encapsulation.",
        fix: `// Before\nconst _helper = new CheckoutHelper();\n\n// After — TypeScript class field:\nprivate helper = new CheckoutHelper();\n// After — JS private field:\n#helper = new CheckoutHelper();`,
        line: nmcUnderscoreMatches[0].line, reference: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_class_fields",
      }, disabled);
    }
  }

  // ── Complexity & industry practice checks (PW-CPX-*) ──────────────────────

  // PW-CPX-001: High cyclomatic complexity
  {
    const ifCount     = (content.match(/\bif\s*\(/g)       || []).length;
    const elseIfCount = (content.match(/\belse\s+if\s*\(/g) || []).length;
    const caseCount   = (content.match(/\bcase\s+[^:]+:/g) || []).length;
    const logicCount  = (content.match(/(?:&&|\|\|)/g)      || []).length;
    const totalCC = ifCount + elseIfCount + caseCount + Math.floor(logicCount / 2);
    if (totalCC > 12) {
      addFindingLocal(findings, {
        ruleId: "PW-CPX-001", category: "coding_standards", severity: "warning",
        title: "High cyclomatic complexity",
        description: `${totalCC} branch points (${ifCount} if / ${elseIfCount} else-if / ${caseCount} case / ${logicCount} logical operators) — recommended maximum is 10. Complex code is harder to test and maintain.`,
        impact: "High complexity correlates with defect density and test fragility.",
        fix: `// Extract conditional blocks into named helper functions:\nasync function isUserAuthorised(page) {\n  return page.getByRole('button', { name: 'Admin' }).isVisible();\n}`,
        line: null, reference: "https://en.wikipedia.org/wiki/Cyclomatic_complexity",
      }, disabled);
    }
  }

  // PW-CPX-002: Deeply nested code (4+ indent levels)
  {
    const deepLines = [];
    fileLines.forEach((line, idx) => {
      if (/^\t{4,}/.test(line) || /^ {16,}\S/.test(line)) deepLines.push(idx + 1);
    });
    if (deepLines.length > 2) {
      addFindingLocal(findings, {
        ruleId: "PW-CPX-002", category: "coding_standards", severity: "info",
        title: "Deeply nested code (4+ levels)",
        description: `${deepLines.length} line(s) are indented 4+ levels deep. Industry standards recommend ≤ 3 levels of nesting.`,
        impact: "Deep nesting is a readability smell; it often hides unnecessary complexity.",
        fix: `// Use early-return / guard clauses to flatten nesting:\nif (!condition) return;\nif (!other) throw new Error('...');\ndoWork();`,
        line: deepLines[0], reference: "https://en.wikipedia.org/wiki/Code_smell",
      }, disabled);
    }
  }

  // PW-CPX-003: File too long relative to test count
  {
    const fileLineCount = fileLines.length;
    if (fileLineCount > 200 && totalTests > 0) {
      const avgLinesPerTest = Math.round(fileLineCount / totalTests);
      if (avgLinesPerTest > 80) {
        addFindingLocal(findings, {
          ruleId: "PW-CPX-003", category: "coding_standards", severity: "info",
          title: "Spec file too long — consider splitting",
          description: `${fileLineCount} lines, ${totalTests} test(s) — avg ${avgLinesPerTest} lines/test. Files over 200 lines should usually be split by feature or page object.`,
          impact: "Long spec files are harder to review, maintain, and run selectively.",
          fix: `// Split into focused spec files:\n// checkout-happy-path.spec.ts\n// checkout-validation.spec.ts\n// checkout-payment-errors.spec.ts`,
          line: null, reference: "https://playwright.dev/docs/best-practices",
        }, disabled);
      }
    }
  }

  // PW-CPX-004: Function declared with 5+ parameters
  {
    const manyParamLines = [];
    fileLines.forEach((line, idx) => {
      const m = /(?:(?:async\s+)?function\s+\w*|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?)\s*\(([^)]+)\)/.exec(line);
      if (!m) return;
      const commas = (m[1].match(/,/g) || []).length;
      if (commas >= 4) manyParamLines.push({ line: idx + 1, count: commas + 1 });
    });
    if (manyParamLines.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-CPX-004", category: "coding_standards", severity: "info",
        title: "Function has too many parameters (5+)",
        description: `A function at line ${manyParamLines[0].line} takes ${manyParamLines[0].count} parameters. Functions should take ≤ 4 arguments; use an options object or page-object pattern instead.`,
        impact: "Long parameter lists are hard to read and maintain; callers must remember argument order.",
        fix: `// Before\nasync function fillForm(page, name, email, phone, address) { }\n\n// After (options object)\nasync function fillForm(page, opts: { name; email; phone; address }) { }`,
        line: manyParamLines[0].line, reference: "https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html",
      }, disabled);
    }
  }

  // ── Modern Playwright API rules (v1.40+) ──────────────────────────────────

  // PW-REL-009: Missing await on an async Playwright call (floating promise)
  {
    const floating = [];
    // Calls passed to Promise.all/race/allSettled/any are awaited by the combinator,
    // so they legitimately carry no `await` of their own.
    let combinatorDepth = 0;
    fileLines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (/Promise\s*\.\s*(?:all|allSettled|race|any)\s*\(/.test(trimmed)) combinatorDepth++;
      if (combinatorDepth > 0) {
        const opens = (line.match(/[([]/g) || []).length;
        const closes = (line.match(/[)\]]/g) || []).length;
        // The combinator's own brackets close out on this line or a later one
        if (closes > opens) combinatorDepth = Math.max(0, combinatorDepth - 1);
        return;
      }
      if (/^\/\//.test(trimmed) || /^\*/.test(trimmed)) return;
      // Array elements / call arguments end with a comma — not standalone statements
      if (/,$/.test(trimmed)) return;
      // A statement that starts with page./locator-ish call but has no await/return/void
      if (!/^(?:page|frame|context|locator|element|\w*[Pp]age)\s*\.\s*\w+/.test(trimmed)) return;
      if (/\b(?:await|return|void|yield)\b/.test(trimmed)) return;
      // Only flag calls that are genuinely async in Playwright
      if (!/\.(?:click|fill|press|check|uncheck|selectOption|hover|type|tap|dblclick|goto|waitFor\w*|setInputFiles|dragTo|focus|blur|clear|screenshot|close|reload|goBack|goForward)\s*\(/.test(trimmed)) return;
      // Skip chained definitions and assignments (const x = page.locator(...))
      if (/^\s*(?:const|let|var)\s/.test(line) || /=\s*$/.test(trimmed)) return;
      floating.push(idx + 1);
    });
    if (floating.length > 0) {
      addFindingLocal(findings, {
        ruleId: "PW-REL-009", category: "reliability", severity: "critical",
        title: "Missing await on async Playwright call",
        description: `Line ${floating[0]} calls an async Playwright action without \`await\`${floating.length > 1 ? ` (${floating.length} occurrences)` : ""}. The promise floats and the test continues before the action completes.`,
        impact: "Race conditions and phantom flakiness — the test may pass or fail depending on timing, and unhandled rejections can crash the worker.",
        fix: `// Before\npage.getByRole('button', { name: 'Save' }).click();\n\n// After\nawait page.getByRole('button', { name: 'Save' }).click();`,
        line: floating[0], reference: "https://playwright.dev/docs/actionability",
      }, disabled);
    }
  }

  // PW-NET-001: External network calls never intercepted
  {
    const hasExternalCalls = /https?:\/\/(?!localhost|127\.0\.0\.1)/.test(content);
    const hasRouting = /page\.route\s*\(|context\.route\s*\(|\.routeFromHAR\s*\(|\.fulfill\s*\(/.test(content);
    if (totalTests > 0 && hasExternalCalls && !hasRouting) {
      addFindingLocal(findings, {
        ruleId: "PW-NET-001", category: "reliability", severity: "warning",
        title: "Third-party requests not intercepted",
        description: "The spec references external URLs but never calls page.route() to stub them. Tests depend on live third-party services.",
        impact: "Suite fails when an external service is slow, rate-limited, or down — failures unrelated to your application.",
        fix: `await page.route('**/api.thirdparty.com/**', route =>\n  route.fulfill({ json: { status: 'ok' } })\n);`,
        line: lineMatches(content, /https?:\/\/(?!localhost|127\.0\.0\.1)/)[0] ?? null,
        reference: "https://playwright.dev/docs/network",
      }, disabled);
    }
  }

  // PW-STR-004: Long test body without test.step() grouping
  {
    const testBlocks = [];
    let depth = 0, startLine = 0;
    fileLines.forEach((line, idx) => {
      if (/\btest\s*(?:\.\w+)?\s*\(\s*['"`]/.test(line) && depth === 0) { depth = 1; startLine = idx + 1; return; }
      if (depth > 0) {
        depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        if (depth <= 0) { if (idx + 1 - startLine > 30) testBlocks.push({ start: startLine, len: idx + 1 - startLine }); depth = 0; }
      }
    });
    if (testBlocks.length > 0 && !/test\.step\s*\(/.test(content)) {
      addFindingLocal(findings, {
        ruleId: "PW-STR-004", category: "structure", severity: "info",
        title: "Long test without test.step() grouping",
        description: `A test starting at line ${testBlocks[0].start} spans ${testBlocks[0].len} lines with no test.step() calls to structure it.`,
        impact: "Trace viewer and HTML reports show one flat action list, making failures hard to localise in long journeys.",
        fix: `await test.step('Log in', async () => {\n  await page.getByLabel('Email').fill(user.email);\n  await page.getByRole('button', { name: 'Sign in' }).click();\n});`,
        line: testBlocks[0].start, reference: "https://playwright.dev/docs/api/class-test#test-step",
      }, disabled);
    }
  }

  // PW-PER-004: UI login repeated instead of reusing storageState
  {
    const loginHits = lineMatches(content, /(?:getByLabel|getByPlaceholder|locator|fill)\s*\([^)]*(?:password|passwd|pwd)/i);
    if (loginHits.length >= 2 && !/storageState|globalSetup/.test(content)) {
      addFindingLocal(findings, {
        ruleId: "PW-PER-004", category: "performance", severity: "warning",
        title: "UI login repeated — no storageState reuse",
        description: `Password fields are filled ${loginHits.length} times and the spec never uses storageState. Each test logs in through the UI.`,
        impact: "Adds several seconds per test and makes every test depend on the login page staying stable.",
        fix: `// global.setup.ts — log in once, save cookies\nawait page.context().storageState({ path: 'auth.json' });\n\n// playwright.config.ts\nuse: { storageState: 'auth.json' }`,
        line: loginHits[0], reference: "https://playwright.dev/docs/auth",
      }, disabled);
    }
  }

  // PW-AST-006: Polling loop instead of expect.poll / toPass
  {
    // A genuine polling loop sleeps *inside its own body*. Loops that iterate a
    // collection are data-driven, not retries, so they are excluded.
    const pollLoops = [];
    fileLines.forEach((line, idx) => {
      if (!/\b(?:while|for)\s*\(/.test(line)) return;
      if (/\bof\b|\bin\b|\.length\b|\.forEach\b|\.entries\(|\.keys\(/.test(line)) return;
      let depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (depth <= 0) return;
      for (let j = idx + 1; j < fileLines.length && depth > 0; j++) {
        if (/waitForTimeout\s*\(|setTimeout\s*\(|time\.sleep\s*\(/.test(fileLines[j])) { pollLoops.push(idx + 1); break; }
        depth += (fileLines[j].match(/\{/g) || []).length - (fileLines[j].match(/\}/g) || []).length;
      }
    });
    if (pollLoops.length > 0 && !/expect\.poll|\.toPass\s*\(/.test(content)) {
      addFindingLocal(findings, {
        ruleId: "PW-AST-006", category: "assertions", severity: "warning",
        title: "Manual retry loop instead of expect.poll()",
        description: "A loop combined with a fixed delay implements hand-rolled polling. Playwright provides expect.poll() and expect(...).toPass() for this.",
        impact: "Hand-written retries lack timeout control and produce unhelpful failure messages with no trace attachment.",
        fix: `await expect.poll(async () => {\n  const res = await request.get('/api/job/1');\n  return (await res.json()).status;\n}, { timeout: 30_000 }).toBe('complete');`,
        line: pollLoops[0], reference: "https://playwright.dev/docs/test-assertions#expectpoll",
      }, disabled);
    }
  }

  // PW-AST-007: Sequential independent assertions could be soft
  {
    const expectCount = countMatches(content, /await\s+expect\s*\(/g);
    if (expectCount >= 8 && !/expect\.soft\s*\(/.test(content)) {
      addFindingLocal(findings, {
        ruleId: "PW-AST-007", category: "assertions", severity: "info",
        title: "No soft assertions in an assertion-heavy spec",
        description: `The file contains ${expectCount} hard assertions and no expect.soft(). The first failure aborts the test, hiding later problems.`,
        impact: "Verification-style tests report one issue per run, so fixing a page takes several cycles instead of one.",
        fix: `// Collect all mismatches in one run\nawait expect.soft(page.getByTestId('total')).toHaveText('$42.00');\nawait expect.soft(page.getByTestId('tax')).toHaveText('$3.50');`,
        line: lineMatches(content, /await\s+expect\s*\(/)[0] ?? null,
        reference: "https://playwright.dev/docs/test-assertions#soft-assertions",
      }, disabled);
    }
  }

  // PW-REL-010: Time-dependent test without page.clock
  {
    const timeHits = lineMatches(content, /new\s+Date\s*\(|Date\.now\s*\(|setTimeout\s*\(\s*[^,]+,\s*\d{4,}/);
    if (timeHits.length > 0 && !/page\.clock/.test(content)) {
      addFindingLocal(findings, {
        ruleId: "PW-REL-010", category: "reliability", severity: "info",
        title: "Time-dependent test without page.clock()",
        description: `Line ${timeHits[0]} depends on real wall-clock time. Playwright's Clock API can freeze or fast-forward time deterministically.`,
        impact: "Tests behave differently across timezones, at date boundaries, or when a timer is genuinely slow — a classic source of intermittent CI failures.",
        fix: `await page.clock.install({ time: new Date('2026-01-01T10:00:00Z') });\nawait page.clock.fastForward('02:00'); // jump 2 hours`,
        line: timeHits[0], reference: "https://playwright.dev/docs/clock",
      }, disabled);
    }
  }

  // PW-A11Y-003: ARIA snapshot testing not adopted
  {
    if (totalTests > 0 && /toMatchSnapshot|toHaveScreenshot/.test(content) && !/toMatchAriaSnapshot/.test(content)) {
      addFindingLocal(findings, {
        ruleId: "PW-A11Y-003", category: "accessibility", severity: "info",
        title: "Pixel snapshots without an ARIA snapshot",
        description: "The spec uses image or text snapshots but never toMatchAriaSnapshot(), which captures the accessibility tree instead of pixels.",
        impact: "Pixel snapshots break on cosmetic changes and pass even when the accessible structure regresses for screen-reader users.",
        fix: `await expect(page.getByRole('navigation')).toMatchAriaSnapshot(\`\n  - navigation:\n    - link "Home"\n    - link "Reports"\n\`);`,
        line: lineMatches(content, /toMatchSnapshot|toHaveScreenshot/)[0] ?? null,
        reference: "https://playwright.dev/docs/aria-snapshots",
      }, disabled);
    }
  }

  // PW-STD-007: tests carry no tag for selective runs
  {
    // Playwright supports both `test('name @smoke')` and `test('name', { tag: '@smoke' }, fn)`
    const hasTitleTag = /(?:test|describe)\s*(?:\.\w+)?\s*\(\s*['"`][^'"`]*@[\w-]+/.test(content);
    const hasTagOption = /\btag\s*:\s*(?:['"`]@|\[)/.test(content);
    const hasGrepAnnotation = /test\.info\s*\(\s*\)\s*\.annotations|annotation\s*:\s*\{/.test(content);
    if (totalTests > 0 && !hasTitleTag && !hasTagOption && !hasGrepAnnotation) {
      addFindingLocal(findings, {
        ruleId: "PW-STD-007", category: "coding_standards", severity: "info",
        title: "Tests carry no tag for selective runs",
        description: "No test or describe in this file carries a @tag in its title or a tag option, so these tests cannot be selected with --grep.",
        impact: "CI must run the whole suite on every commit — no smoke subset, and a flaky spec can only be excluded by skipping it outright.",
        fix: `// Either in the title\ntest('checkout completes @smoke', async ({ page }) => { /* ... */ });\n\n// Or as a tag option (Playwright 1.42+)\ntest('checkout completes', { tag: ['@smoke', '@billing'] }, async ({ page }) => { /* ... */ });\n\n// then: npx playwright test --grep @smoke`,
        line: lineMatches(content, /\btest\s*\(/)[0] ?? null,
        reference: "https://playwright.dev/docs/test-annotations#tag-tests",
      }, disabled);
    }
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
    skippedRules,
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
