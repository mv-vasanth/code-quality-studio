import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.cypress.categories.map((c) => c.id);

/**
 * Local rules for Cypress (TS / JS) — heuristic, regex-based; not a substitute
 * for full review.
 */
export function analyseCypressLocally(filename, content, options = {}) {
  const disabledRuleIds = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
  const hasTests = /\bit\s*\(/.test(content) || /describe\s*\(/.test(content);

  // ── Selectors ──
  const idSelector = lineMatches(content, /cy\.get\s*\(\s*['"][#\[]id=/);
  if (idSelector.length) pushFinding(findings, {
    ruleId: "CY-SEL-001", category: "selectors", severity: "warning",
    title: "ID-based selector",
    description: "Prefer cy.get('[data-testid=') or cy.contains() over ID or #id selectors",
    impact: "Auto-generated IDs make selectors brittle across builds.",
    fix: `// Before\ncy.get('#submit');\n// After\ncy.get('[data-testid="submit"]');`,
    line: idSelector[0], reference: "https://docs.cypress.io/guides/references/best-practices#Selecting-Elements",
  }, disabledRuleIds);

  const xpathSelector = lineMatches(content, /cy\.xpath\s*\(/);
  if (xpathSelector.length) pushFinding(findings, {
    ruleId: "CY-SEL-002", category: "selectors", severity: "warning",
    title: "XPath selector via cy.xpath()",
    description: "XPath is brittle; use Cypress built-in selectors instead",
    impact: "DOM structure changes break XPath selectors.",
    fix: `// Before\ncy.xpath('//button[@id="submit"]');\n// After\ncy.get('[data-testid="submit"]');`,
    line: xpathSelector[0], reference: "https://docs.cypress.io/guides/references/best-practices#Selecting-Elements",
  }, disabledRuleIds);

  const genericTag = lineMatches(content, /cy\.get\s*\(\s*['"](div|span)\s/);
  if (genericTag.length) pushFinding(findings, {
    ruleId: "CY-SEL-003", category: "selectors", severity: "warning",
    title: "Generic tag selector",
    description: "Overly generic tag selectors (div, span) match too many elements",
    impact: "Tests break when layout changes add or remove wrapper elements.",
    fix: `// Before\ncy.get('div .submit');\n// After\ncy.get('[data-testid="submit"]');`,
    line: genericTag[0], reference: "https://docs.cypress.io/guides/references/best-practices#Selecting-Elements",
  }, disabledRuleIds);

  const eqSelector = lineMatches(content, /\.eq\s*\(/);
  if (eqSelector.length) pushFinding(findings, {
    ruleId: "CY-SEL-004", category: "selectors", severity: "info",
    title: "Magic index selector (.eq())",
    description: ".eq() without a comment is a fragile positional selector",
    impact: "Reordering DOM elements silently breaks the test.",
    fix: `// Add a comment explaining the expected index:\n// First submit button in the form\ncy.get('[data-testid="form"]').find('button').eq(0);`,
    line: eqSelector[0], reference: "https://docs.cypress.io/api/commands/eq",
  }, disabledRuleIds);

  if (/cy\.get\s*\(/.test(content) && !/data-testid|data-cy|data-test/.test(content)) {
    pushFinding(findings, {
      ruleId: "CY-SEL-005", category: "selectors", severity: "info",
      title: "No data-testid selectors",
      description: "Add data-testid attributes for stable, purpose-built selectors",
      impact: "Tests are coupled to CSS class names or IDs that change with refactoring.",
      fix: `// In component HTML:\n// <button data-testid="submit-btn">Submit</button>\n// In test:\ncy.get('[data-testid="submit-btn"]').click();`,
      line: null, reference: "https://docs.cypress.io/guides/references/best-practices#Selecting-Elements",
    }, disabledRuleIds);
  }

  // ── Commands ──
  const hardWait = lineMatches(content, /cy\.wait\s*\(\s*\d+\s*\)/);
  if (hardWait.length) pushFinding(findings, {
    ruleId: "CY-CMD-001", category: "commands", severity: "critical",
    title: "Hard wait with number literal",
    description: "cy.wait(number) is a hard wait that causes flakiness; use cy.intercept + cy.wait('@alias')",
    impact: "Tests are slow and unreliable; waits too short or too long depending on environment.",
    fix: `// Before\ncy.wait(3000);\n// After\ncy.intercept('GET', '/api/data').as('getData');\ncy.wait('@getData');`,
    line: hardWait[0], reference: "https://docs.cypress.io/guides/references/best-practices#Unnecessary-Waiting",
  }, disabledRuleIds);

  // CY-CMD-003: 'it(' with regular function and 'this.' usage
  let thisInItLine = null;
  for (let i = 0; i < lines.length; i++) {
    if (/it\s*\(.*function\s*\(/.test(lines[i])) {
      const windowEnd = Math.min(i + 30, lines.length - 1);
      const segment = lines.slice(i, windowEnd + 1).join("\n");
      if (/this\./.test(segment)) {
        thisInItLine = i + 1;
        break;
      }
    }
  }
  if (thisInItLine !== null) pushFinding(findings, {
    ruleId: "CY-CMD-003", category: "commands", severity: "warning",
    title: "Arrow function with this. in it() block",
    description: "Using this. inside regular function callbacks conflicts with arrow function conventions; use aliases or closure variables instead",
    impact: "Context binding issues can cause unexpected undefined values.",
    fix: `// Before\nit('test', function() { this.user = ... });\n// After\nit('test', () => { const user = ... });`,
    line: thisInItLine, reference: "https://docs.cypress.io/guides/core-concepts/variables-and-aliases",
  }, disabledRuleIds);

  if (hasTests && /\bit\s*\(/.test(content) && !/beforeEach\s*\(/.test(content)) {
    pushFinding(findings, {
      ruleId: "CY-CMD-004", category: "commands", severity: "info",
      title: "No beforeEach() setup block",
      description: "File has it() tests but no beforeEach(); consider extracting shared setup",
      impact: "Duplicated setup code increases maintenance cost.",
      fix: `beforeEach(() => {\n  cy.visit('/login');\n  cy.login(); // custom command\n});`,
      line: null, reference: "https://docs.cypress.io/guides/core-concepts/writing-and-organizing-tests#Hooks",
    }, disabledRuleIds);
  }

  // CY-CMD-005: nested .then() callback hell
  const nestedThen = lineMatches(content, /\.then\s*\([\s\S]*?\.then\s*\(/);
  if (nestedThen.length) pushFinding(findings, {
    ruleId: "CY-CMD-005", category: "commands", severity: "warning",
    title: "Nested .then() callback hell",
    description: "Deeply nested .then() chains reduce readability; use cy.wrap() or separate commands",
    impact: "Hard-to-read and maintain test code.",
    fix: `// Before\ncy.get('#el').then(el => { cy.wrap(el).then(e => { ... }); });\n// After\ncy.get('#el').as('el');\ncy.get('@el').should('be.visible');`,
    line: nestedThen[0], reference: "https://docs.cypress.io/guides/core-concepts/variables-and-aliases",
  }, disabledRuleIds);

  const hardcodedVisitUrl = lineMatches(content, /cy\.visit\s*\(\s*['"]https?:\/\//);
  if (hardcodedVisitUrl.length) pushFinding(findings, {
    ruleId: "CY-CMD-006", category: "commands", severity: "info",
    title: "Hardcoded URL in cy.visit()",
    description: "Hardcoded URLs prevent running tests against different environments",
    impact: "Tests cannot be run against staging or production without code changes.",
    fix: `// Before\ncy.visit('http://localhost:3000/login');\n// After\ncy.visit('/login'); // use baseUrl in cypress.config.ts\n// Or: cy.visit(Cypress.env('BASE_URL') + '/login');`,
    line: hardcodedVisitUrl[0], reference: "https://docs.cypress.io/guides/references/configuration#baseUrl",
  }, disabledRuleIds);

  // ── Assertions ──
  const rawExpect = lineMatches(content, /(?<!\.then\s*\([^)]*)\bexpect\s*\(/);
  if (rawExpect.length) pushFinding(findings, {
    ruleId: "CY-ASS-001", category: "assertions", severity: "warning",
    title: "Raw expect() outside .then() callback",
    description: "expect() outside a .then() may not retry; use .should() for auto-retrying assertions",
    impact: "Assertions may fail on timing-sensitive checks.",
    fix: `// Before\nexpect(someValue).to.equal('hello');\n// After\ncy.wrap(someValue).should('equal', 'hello');`,
    line: rawExpect[0], reference: "https://docs.cypress.io/guides/core-concepts/introduction-to-cypress#Assertions",
  }, disabledRuleIds);

  if (hasTests && /\bit\s*\(/.test(content) && !/should\s*\(|expect\s*\(|assert\./.test(content)) {
    pushFinding(findings, {
      ruleId: "CY-ASS-002", category: "assertions", severity: "warning",
      title: "Test without assertion",
      description: "it() block found but no should(), expect(), or assert. — test never fails",
      impact: "False confidence; broken features go undetected.",
      fix: `cy.get('[data-testid="message"]').should('contain.text', 'Success');`,
      line: null, reference: "https://docs.cypress.io/guides/core-concepts/introduction-to-cypress#Assertions",
    }, disabledRuleIds);
  }

  const existOnly = lineMatches(content, /\.should\s*\(\s*['"]exist['"]\s*\)/);
  if (existOnly.length) pushFinding(findings, {
    ruleId: "CY-ASS-003", category: "assertions", severity: "info",
    title: "Existence-only assertion",
    description: "should('exist') only checks presence; add value or content assertions",
    impact: "Element may exist but show wrong content or state.",
    fix: `// Before\ncy.get('[data-testid="msg"]').should('exist');\n// After\ncy.get('[data-testid="msg"]').should('contain.text', 'Welcome');`,
    line: existOnly[0], reference: "https://docs.cypress.io/guides/references/assertions",
  }, disabledRuleIds);

  const exactTextMatch = lineMatches(content, /\.should\s*\(\s*['"]have\.text['"]/);
  if (exactTextMatch.length) pushFinding(findings, {
    ruleId: "CY-ASS-004", category: "assertions", severity: "warning",
    title: "Exact text match on potentially dynamic text",
    description: "have.text requires exact match; fragile for dynamic content — prefer contain.text",
    impact: "Whitespace or minor text changes break the test.",
    fix: `// Before\n.should('have.text', 'Welcome John');\n// After\n.should('contain.text', 'Welcome');`,
    line: exactTextMatch[0], reference: "https://docs.cypress.io/guides/references/assertions",
  }, disabledRuleIds);

  // ── Network ──
  if (/cy\.request\s*\(/.test(content) && !/cy\.intercept\s*\(/.test(content)) {
    const reqLine = lineMatches(content, /cy\.request\s*\(/);
    pushFinding(findings, {
      ruleId: "CY-NET-001", category: "network", severity: "warning",
      title: "Real network calls without stubs",
      description: "cy.request() without cy.intercept() hits real APIs; stub external dependencies",
      impact: "Tests depend on external services, causing flakiness and slow runs.",
      fix: `cy.intercept('POST', '/api/login', { fixture: 'login-success.json' }).as('login');\ncy.wait('@login');`,
      line: reqLine[0] ?? null, reference: "https://docs.cypress.io/api/commands/intercept",
    }, disabledRuleIds);
  }

  // CY-NET-002: cy.intercept without .as()
  let interceptWithoutAlias = null;
  for (let i = 0; i < lines.length; i++) {
    if (/cy\.intercept\s*\(/.test(lines[i])) {
      // Check if .as( appears within the next 2 lines
      const end = Math.min(i + 2, lines.length - 1);
      const segment = lines.slice(i, end + 1).join("\n");
      if (!/.as\s*\(/.test(segment)) {
        interceptWithoutAlias = i + 1;
        break;
      }
    }
  }
  if (interceptWithoutAlias !== null) pushFinding(findings, {
    ruleId: "CY-NET-002", category: "network", severity: "warning",
    title: "cy.intercept() not aliased with .as()",
    description: "Intercept without .as() cannot be awaited with cy.wait('@alias')",
    impact: "Cannot deterministically wait for the intercepted request to complete.",
    fix: `cy.intercept('GET', '/api/users').as('getUsers');\ncy.wait('@getUsers');`,
    line: interceptWithoutAlias, reference: "https://docs.cypress.io/api/commands/intercept#Aliasing-an-intercept",
  }, disabledRuleIds);

  if (/cy\.visit\s*\(/.test(content) && !/cy\.intercept\s*\(/.test(content)) {
    pushFinding(findings, {
      ruleId: "CY-NET-003", category: "network", severity: "info",
      title: "No cy.intercept() — tests may hit real network",
      description: "cy.visit() present but no cy.intercept(); network requests are not stubbed",
      impact: "Slow tests and dependency on real backend availability.",
      fix: `cy.intercept('GET', '/api/**', { fixture: 'api-response.json' });`,
      line: null, reference: "https://docs.cypress.io/api/commands/intercept",
    }, disabledRuleIds);
  }

  const hardcodedToken = lineMatches(content, /cy\.request\s*\([\s\S]*?['"]Authorization['"][\s\S]*?['"][A-Za-z0-9+/]{20,}/);
  if (hardcodedToken.length) pushFinding(findings, {
    ruleId: "CY-NET-004", category: "network", severity: "critical",
    title: "Hardcoded API token in cy.request()",
    description: "Authorization token is hardcoded; use Cypress.env() to load from environment",
    impact: "Token leaks in git history and CI logs.",
    fix: `cy.request({\n  headers: { Authorization: \`Bearer \${Cypress.env('API_TOKEN')}\` }\n});`,
    line: hardcodedToken[0], reference: "https://docs.cypress.io/guides/references/best-practices#Storing-Tokens",
  }, disabledRuleIds);

  // ── Reliability ──
  const longHardWait = lineMatches(content, /cy\.wait\s*\(\s*\d{4,}\s*\)/);
  if (longHardWait.length) pushFinding(findings, {
    ruleId: "CY-REL-001", category: "reliability", severity: "critical",
    title: "Hard wait >= 1000ms",
    description: "cy.wait(≥1000) is a significant hard wait; use intercept aliases instead",
    impact: "Suite is artificially slow; tests still flake on fast or slow machines.",
    fix: `cy.intercept('GET', '/api/data').as('data');\ncy.wait('@data');`,
    line: longHardWait[0], reference: "https://docs.cypress.io/guides/references/best-practices#Unnecessary-Waiting",
  }, disabledRuleIds);

  const forceClick = lineMatches(content, /\.click\s*\(\s*\{\s*force\s*:\s*true/);
  if (forceClick.length) pushFinding(findings, {
    ruleId: "CY-REL-002", category: "reliability", severity: "warning",
    title: "force: true on .click()",
    description: "force: true bypasses actionability checks; may hide real visibility issues",
    impact: "Tests pass even when the element is not actually interactable.",
    fix: `// Investigate why the element is not visible or covered.\n// Fix the application or wait for the element to be interactable:\ncy.get('[data-testid="btn"]').should('be.visible').click();`,
    line: forceClick[0], reference: "https://docs.cypress.io/guides/core-concepts/interacting-with-elements#Actionability",
  }, disabledRuleIds);

  const firstLastSelector = lineMatches(content, /\.(first|last)\s*\(\s*\)/);
  if (firstLastSelector.length) pushFinding(findings, {
    ruleId: "CY-REL-003", category: "reliability", severity: "warning",
    title: "Position-based .first() / .last() selector",
    description: ".first() or .last() without a comment is a fragile positional selection",
    impact: "List reordering silently breaks the test.",
    fix: `// Add a comment or use a data-testid:\ncy.get('[data-testid="user-list"] [data-testid="user-item"]').first(); // first user in sorted list`,
    line: firstLastSelector[0], reference: "https://docs.cypress.io/api/commands/first",
  }, disabledRuleIds);

  if (!/cy\.screenshot\s*\(|Cypress\.on\s*\(\s*['"]uncaught:exception/.test(content)) {
    pushFinding(findings, {
      ruleId: "CY-REL-004", category: "reliability", severity: "info",
      title: "No error handling or screenshot setup",
      description: "No cy.screenshot() or Cypress.on('uncaught:exception') found",
      impact: "Uncaught exceptions may silently fail tests without actionable evidence.",
      fix: `// In cypress/support/e2e.ts:\nCypress.on('uncaught:exception', (err) => {\n  console.error(err);\n  return false; // prevent test failure from app errors\n});`,
      line: null, reference: "https://docs.cypress.io/api/events/catalog-of-events#uncaught-exception",
    }, disabledRuleIds);
  }

  const invokeTextAssert = lineMatches(content, /invoke\s*\(\s*['"]text['"]\s*\)/);
  if (invokeTextAssert.length) pushFinding(findings, {
    ruleId: "CY-REL-005", category: "reliability", severity: "warning",
    title: "invoke('text') used instead of should('have.text')",
    description: "invoke('text') resolves immediately and won't retry; use should('have.text') for retrying assertions",
    impact: "Assertion can fail on asynchronous text updates.",
    fix: `// Before\ncy.get('#msg').invoke('text').should('eq', 'Done');\n// After\ncy.get('#msg').should('have.text', 'Done');`,
    line: invokeTextAssert[0], reference: "https://docs.cypress.io/guides/core-concepts/introduction-to-cypress#Assertions",
  }, disabledRuleIds);

  // ── Security ──
  const hardcodedSecret = lineMatches(content, /(password|secret|token|apiKey)\s*[=:]\s*['"][^'"]{4,}['"]/i);
  if (hardcodedSecret.length) pushFinding(findings, {
    ruleId: "CY-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded credential or secret",
    description: "Password, secret, or token is hardcoded in test code",
    impact: "Credentials leak in git history and CI logs.",
    fix: `// Use Cypress environment variables:\nconst password = Cypress.env('TEST_PASSWORD');\n// Set in cypress.env.json (gitignored) or CI environment`,
    line: hardcodedSecret[0], reference: "https://docs.cypress.io/guides/references/best-practices#Storing-Tokens",
  }, disabledRuleIds);

  const setCookieNoClean = lineMatches(content, /cy\.setCookie\s*\(/);
  if (setCookieNoClean.length) pushFinding(findings, {
    ruleId: "CY-SEC-002", category: "security", severity: "warning",
    title: "cy.setCookie() without clearCookies",
    description: "Setting cookies without clearing may cause pollution between tests",
    impact: "Cookie state leaks between tests causing unpredictable failures.",
    fix: `beforeEach(() => {\n  cy.clearCookies();\n});\n// Then set cookies as needed in each test`,
    line: setCookieNoClean[0], reference: "https://docs.cypress.io/api/commands/clearcookies",
  }, disabledRuleIds);

  const webSecurityDisabled = lineMatches(content, /chromeWebSecurity\s*[:=]\s*false/i);
  if (webSecurityDisabled.length) pushFinding(findings, {
    ruleId: "CY-SEC-003", category: "security", severity: "info",
    title: "chromeWebSecurity: false reference",
    description: "Disabling Chrome web security is noted in the test file; verify this is intentional",
    impact: "Cross-origin security restrictions are bypassed, masking real security issues.",
    fix: `// Only disable for tests that genuinely need cross-origin access.\n// Re-enable once cross-origin test setup is complete.`,
    line: webSecurityDisabled[0], reference: "https://docs.cypress.io/guides/guides/web-security",
  }, disabledRuleIds);

  const failOnStatusFalse = lineMatches(content, /failOnStatusCode\s*:\s*false/);
  if (failOnStatusFalse.length) pushFinding(findings, {
    ruleId: "CY-SEC-004", category: "security", severity: "warning",
    title: "failOnStatusCode: false in cy.request()",
    description: "Silently swallowing non-2xx HTTP responses hides API errors",
    impact: "API failures go undetected; tests pass despite server errors.",
    fix: `// Remove failOnStatusCode: false unless you're explicitly testing error responses.\n// If testing errors, assert on the status:\ncy.request({ url: '/api/fail', failOnStatusCode: false }).its('status').should('eq', 400);`,
    line: failOnStatusFalse[0], reference: "https://docs.cypress.io/api/commands/request#failOnStatusCode",
  }, disabledRuleIds);

  // ── Performance ──
  const visitCount = countMatches(content, /cy\.visit\s*\(/g);
  const itCount = countMatches(content, /\bit\s*\(/g);
  if (visitCount > 1 && itCount > 1 && visitCount >= itCount) {
    const visitLine = lineMatches(content, /cy\.visit\s*\(/);
    pushFinding(findings, {
      ruleId: "CY-PERF-001", category: "performance", severity: "warning",
      title: "cy.visit() in every it() block",
      description: "Multiple cy.visit() calls — one per test — use beforeEach() to avoid repeated navigation",
      impact: "Unnecessary page loads slow the test suite.",
      fix: `beforeEach(() => {\n  cy.visit('/dashboard');\n});\n\nit('shows the title', () => { ... });`,
      line: visitLine[0] ?? null, reference: "https://docs.cypress.io/guides/core-concepts/writing-and-organizing-tests#Hooks",
    }, disabledRuleIds);
  }

  const jsonParseInline = lineMatches(content, /JSON\.parse\s*\(/);
  if (jsonParseInline.length) pushFinding(findings, {
    ruleId: "CY-PERF-002", category: "performance", severity: "info",
    title: "Inline JSON.parse() — use cy.fixture() instead",
    description: "Large inline JSON strings bloat test files; use cy.fixture() for test data",
    impact: "Larger test files; data not reusable across tests.",
    fix: `// Before\nconst data = JSON.parse('{"user": "alice", ...}');\n// After\ncy.fixture('user.json').then((data) => { ... });`,
    line: jsonParseInline[0], reference: "https://docs.cypress.io/api/commands/fixture",
  }, disabledRuleIds);

  const reloadInTest = lineMatches(content, /cy\.reload\s*\(/);
  if (reloadInTest.length) pushFinding(findings, {
    ruleId: "CY-PERF-003", category: "performance", severity: "warning",
    title: "cy.reload() in test body",
    description: "Reloading the page in a test is slow and often indicates a missing intercept or state setup",
    impact: "Unnecessarily slow tests; may mask flaky state issues.",
    fix: `// Restructure the test to set up state before visiting:\nbeforeEach(() => { cy.login(); cy.visit('/dashboard'); });`,
    line: reloadInTest[0], reference: "https://docs.cypress.io/api/commands/reload",
  }, disabledRuleIds);

  // ── Coding Standards ──
  const exclusiveTest = lineMatches(content, /\bit\.only\s*\(|describe\.only\s*\(/);
  if (exclusiveTest.length) pushFinding(findings, {
    ruleId: "CY-STD-001", category: "coding_standards", severity: "info",
    title: "Exclusive test (.only) left in codebase",
    description: "it.only() or describe.only() was left in; other tests will be skipped in CI",
    impact: "Only a subset of tests runs; failures in other tests are hidden.",
    fix: `// Remove .only before committing:\nit('my test', () => { ... });`,
    line: exclusiveTest[0], reference: "https://docs.cypress.io/guides/core-concepts/writing-and-organizing-tests#Excluding-and-Including-Tests",
  }, disabledRuleIds);

  const skippedTest = lineMatches(content, /\bit\.skip\s*\(|\bxit\s*\(/);
  if (skippedTest.length) pushFinding(findings, {
    ruleId: "CY-STD-002", category: "coding_standards", severity: "info",
    title: "Skipped test (it.skip / xit)",
    description: "Skipped tests accumulate technical debt; fix or remove them",
    impact: "Skipped tests provide no confidence; underlying issues go undetected.",
    fix: `// Fix the underlying issue and re-enable, or remove the test.`,
    line: skippedTest[0], reference: "https://docs.cypress.io/guides/core-concepts/writing-and-organizing-tests#Excluding-and-Including-Tests",
  }, disabledRuleIds);

  const consoleLog = lineMatches(content, /console\.log\s*\(/);
  if (consoleLog.length) pushFinding(findings, {
    ruleId: "CY-STD-003", category: "coding_standards", severity: "warning",
    title: "console.log() in test code",
    description: "Remove debugging console.log statements before committing",
    impact: "Noise in CI output; may leak sensitive data.",
    fix: `// Use cy.log() for test-integrated logging:\ncy.log('Submitting form with user:', username);`,
    line: consoleLog[0], reference: "https://docs.cypress.io/api/commands/log",
  }, disabledRuleIds);

  if (/\bit\s*\(/.test(content) && !/describe\s*\(/.test(content)) {
    pushFinding(findings, {
      ruleId: "CY-STD-004", category: "coding_standards", severity: "info",
      title: "Tests not grouped in describe()",
      description: "Wrap related tests in a describe() block for better organisation",
      impact: "Harder to filter and run subsets of tests in CI.",
      fix: `describe('Login page', () => {\n  it('shows error on invalid credentials', () => { ... });\n  it('redirects to dashboard on success', () => { ... });\n});`,
      line: null, reference: "https://docs.cypress.io/guides/core-concepts/writing-and-organizing-tests#Test-Structure",
    }, disabledRuleIds);
  }

  // CY-STD-005: same cy.get() selector repeated >2 times
  const selectorMatches = content.match(/cy\.get\s*\('([^']+)'\)/g) || [];
  const selectorCounts = {};
  for (const m of selectorMatches) {
    selectorCounts[m] = (selectorCounts[m] || 0) + 1;
  }
  const repeatedSelector = Object.entries(selectorCounts).find(([, count]) => count > 2);
  if (repeatedSelector) {
    const firstOccurrence = lineMatches(content, new RegExp(repeatedSelector[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))[0] ?? null;
    pushFinding(findings, {
      ruleId: "CY-STD-005", category: "coding_standards", severity: "info",
      title: "Magic string selector repeated 3+ times",
      description: `The selector "${repeatedSelector[0]}" appears ${repeatedSelector[1]} times — extract to a constant or Page Object`,
      impact: "Selector changes require updating multiple test locations.",
      fix: `// Extract to a const or page object:\nconst SUBMIT_BTN = '[data-testid="submit"]';\ncy.get(SUBMIT_BTN).click();`,
      line: firstOccurrence, reference: "https://docs.cypress.io/guides/references/best-practices#Page-Objects",
    }, disabledRuleIds);
  }

  const crit = findings.filter((f) => f.severity === "critical").length;
  const summary =
    crit > 0
      ? `Cypress scan of ${filename}: ${findings.length} finding(s), ${crit} critical.`
      : `Cypress scan of ${filename}: ${findings.length} finding(s) from standard rules.`;

  return buildAuditResult({
    filename,
    categoryIds: CATEGORY_IDS,
    findings,
    metrics: {
      totalTests: countMatches(content, /\bit\s*\(/g),
      hardWaits: hardWait.length,
      xpathSelectors: xpathSelector.length,
      interceptCalls: countMatches(content, /cy\.intercept\s*\(/g),
      hardcodedSecrets: hardcodedSecret.length,
    },
    summary,
    positives:
      hardWait.length === 0 && forceClick.length === 0
        ? [{ title: "No hard waits or forced clicks", description: "No cy.wait(number) or click({force:true}) detected." }]
        : undefined,
  });
}
