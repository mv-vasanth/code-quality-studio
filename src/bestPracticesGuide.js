/**
 * Canonical Playwright best practices for Quality Studio (Guide tab + docs).
 * Category ids match audit dimensions in App.jsx.
 */

export const BEST_PRACTICES_INTRO =
  "A practical, example-first guide to Playwright E2E testing. Each item pairs a common mistake with the recommended fix and a link to the official docs — read it top to bottom to learn the patterns, or filter by category to resolve a specific finding. The local rules and AI review are aligned to these practices.";

export const BEST_PRACTICES = [
  {
    id: "bp-selectors-role",
    category: "selectors",
    ruleIds: ["PW-SEL-001", "PW-SEL-002", "PW-SEL-003"],
    title: "Use role-based and aria locators — not XPath or CSS selectors",
    summary:
      "Playwright's locator API with getByRole, getByLabel, and getByText is resilient to DOM changes and mirrors how users interact with the page.",
    avoid: `page.locator('#btn-submit-03')
page.locator('div > span.submit')`,
    prefer: `page.getByRole('button', { name: 'Submit' })
page.getByLabel('Email address')`,
    reference: "https://playwright.dev/docs/locators",
  },
  {
    id: "bp-selectors-testid",
    category: "selectors",
    ruleIds: ["PW-SEL-002"],
    title: "Use data-testid for elements with no stable role selectors",
    summary:
      "When no aria role or label exists, add data-testid attributes in the app. They survive refactors and are explicit about their purpose.",
    prefer: `page.getByTestId('checkout-total')`,
    reference: "https://playwright.dev/docs/locators#locate-by-test-id",
  },
  {
    id: "bp-structure-pom",
    category: "structure",
    ruleIds: ["PW-STR-001"],
    title: "Use Page Object Model (POM) structure",
    summary:
      "Encapsulate page interactions in classes. Tests stay readable; selectors are maintained in one place. Each page = one class.",
    prefer: `class LoginPage {
  constructor(page) { this.page = page }
  async login(email, pass) {
    await this.page.getByLabel('Email').fill(email)
    await this.page.getByLabel('Password').fill(pass)
    await this.page.getByRole('button', { name: 'Sign in' }).click()
  }
}`,
  },
  {
    id: "bp-structure-fixtures",
    category: "structure",
    title: "Use fixtures for shared setup and teardown structure",
    summary:
      "Playwright fixtures inject reusable context (logged-in page, seeded DB, mock API) into any test without repeating beforeEach blocks.",
    prefer: `const test = base.extend({
  loggedInPage: async ({ page }, use) => {
    await page.goto('/login')
    await loginAs(page, 'admin')
    await use(page)
  }
})`,
    reference: "https://playwright.dev/docs/test-fixtures",
  },
  {
    id: "bp-structure-tags",
    category: "structure",
    title: "Tag and group tests for selective runs",
    summary:
      "Use @smoke, @regression, @critical tags. Run only what CI needs at each stage — speeds up pipelines significantly.",
    prefer: `test('login flow @smoke', async ({ page }) => { ... })
// run: npx playwright test --grep @smoke`,
    reference: "https://playwright.dev/docs/test-annotations",
  },
  {
    id: "bp-structure-folders",
    category: "coding_standards",
    title: "Follow a consistent folder structure",
    summary: "Organise by feature, not by type. Keeps related tests, pages, and fixtures together.",
    prefer: `tests/
  auth/
    login.spec.ts
    pages/LoginPage.ts
  checkout/
    checkout.spec.ts
    pages/CheckoutPage.ts
  fixtures/
    auth.fixture.ts`,
  },
  {
    id: "bp-reliability-waits",
    category: "reliability",
    ruleIds: ["PW-REL-001"],
    title: "Never use hard waits — rely on auto-waiting",
    summary:
      "Playwright auto-waits for elements to be visible, enabled, and stable before acting. Hard waits make tests slow and brittle.",
    avoid: `await page.waitForTimeout(3000)`,
    prefer: `await page.getByRole('button', { name: 'Save' }).click()
await expect(page.getByText('Saved')).toBeVisible()`,
    reference: "https://playwright.dev/docs/actionability",
  },
  {
    id: "bp-reliability-assertions",
    category: "assertions",
    ruleIds: ["PW-AST-001", "PW-AST-002"],
    title: "Use web-first assertions",
    summary:
      "expect(locator).toBeVisible() retries until true or timeout. Regular expect() on immediate values does not retry.",
    avoid: `expect(await page.isVisible('#result')).toBe(true)`,
    prefer: `await expect(page.getByTestId('result')).toBeVisible()`,
    reference: "https://playwright.dev/docs/test-assertions",
  },
  {
    id: "bp-reliability-isolation",
    category: "reliability",
    title: "Isolate test data — never share state between tests",
    summary:
      "Each test should create and clean up its own data. Shared state causes flaky, order-dependent failures. Use the request fixture to seed data faster than UI.",
    prefer: `test.beforeEach(async ({ request }) => {
  await request.post('/api/seed', { data: testUser })
})
test.afterEach(async ({ request }) => {
  await request.delete('/api/cleanup')
})`,
    reference: "https://playwright.dev/docs/api/class-apirequestcontext",
  },
  {
    id: "bp-reliability-mock",
    category: "reliability",
    title: "Mock external APIs and third-party services",
    summary:
      "Use page.route() to intercept and mock API calls. Avoids flakiness from external dependencies and speeds up tests.",
    prefer: `await page.route('**/api/payments', route =>
  route.fulfill({ json: { status: 'success' } })
)`,
    reference: "https://playwright.dev/docs/mock",
  },
  {
    id: "bp-ci-sharding",
    category: "ci_config",
    title: "Run tests in parallel with sharding",
    summary:
      "Playwright supports parallel workers out of the box and CI sharding across machines.",
    prefer: `# split across 4 CI agents
npx playwright test --shard=1/4
npx playwright test --shard=2/4`,
    reference: "https://playwright.dev/docs/test-sharding",
  },
  {
    id: "bp-ci-artifacts",
    category: "ci_config",
    title: "Enable trace, video, and screenshot on failure",
    summary:
      "Configure playwright.config.ts to capture traces and screenshots only on failure — keeps storage low, gives full debugging context when needed.",
    prefer: `use: {
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure'
}`,
    reference: "https://playwright.dev/docs/trace-viewer",
  },
  {
    id: "bp-ci-reporters",
    category: "ci_config",
    title: "Use HTML reporter + Allure for stakeholder reporting",
    summary:
      "Playwright's built-in HTML reporter is excellent for devs. For business stakeholders, add Allure reporter for dashboards and trends.",
    prefer: `reporter: [['html'], ['allure-playwright']]`,
    reference: "https://playwright.dev/docs/test-reporters",
  },
  {
    id: "bp-perf-storage",
    category: "performance",
    title: "Use storageState to reuse authentication",
    summary:
      "Log in once, save the session to a file, reuse it across tests. Avoids repeating login flows and speeds up the suite.",
    prefer: `// global-setup.ts
await page.context().storageState({ path: 'auth.json' })

// playwright.config.ts
use: { storageState: 'auth.json' }`,
    reference: "https://playwright.dev/docs/auth",
  },
  {
    id: "bp-ci-browsers",
    category: "ci_config",
    title: "Pin browser versions in CI",
    summary:
      "Always run npx playwright install in CI so browser versions match your package version.",
    prefer: `# in CI pipeline
- run: npx playwright install --with-deps chromium`,
    reference: "https://playwright.dev/docs/ci",
  },
  {
    id: "bp-ci-baseurl",
    category: "ci_config",
    ruleIds: ["PW-CI-001"],
    title: "Set baseURL and use relative paths",
    summary:
      "Configure baseURL in playwright.config and navigate with relative paths so the same suite runs against local, staging, and CI without edits.",
    avoid: `await page.goto('https://staging.example.com/login')`,
    prefer: `// playwright.config.ts
use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' }

// in tests
await page.goto('/login')`,
    reference: "https://playwright.dev/docs/test-webserver#configuring-baseurl",
  },
  {
    id: "bp-reliability-locators-over-query",
    category: "reliability",
    ruleIds: ["PW-REL-002"],
    title: "Prefer locators over page.$$ / element handles",
    summary:
      "page.$$() and element handles snapshot the DOM and race the UI. Locators re-query and auto-wait, so assertions stay stable as the page updates.",
    avoid: `const rows = await page.$$('.order-row')
expect(rows.length).toBe(3)`,
    prefer: `await expect(page.getByRole('row')).toHaveCount(3)`,
    reference: "https://playwright.dev/docs/locators",
  },
  {
    id: "bp-mobile-projects",
    category: "mobile",
    ruleIds: ["PW-MOB-001"],
    title: "Test mobile viewports with device projects",
    summary:
      "Add mobile projects in playwright.config using the built-in device descriptors so responsive regressions are caught alongside desktop.",
    prefer: `// playwright.config.ts
import { devices } from '@playwright/test'

projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
]`,
    reference: "https://playwright.dev/docs/emulation#devices",
  },
  {
    id: "bp-security-secrets",
    category: "security",
    ruleIds: ["PW-SEC-001"],
    title: "Never hardcode secrets in tests",
    summary:
      "Passwords, API keys, and tokens must come from environment variables or a stored auth state — never literals that leak through git history and CI logs.",
    avoid: `const password = 'hunter2-prod-secret'`,
    prefer: `const password = process.env.E2E_PASSWORD
if (!password) throw new Error('E2E_PASSWORD is required')

// or reuse a pre-authenticated session
test.use({ storageState: 'auth.json' })`,
    reference: "https://playwright.dev/docs/auth",
  },
  {
    id: "bp-accessibility-checks",
    category: "accessibility",
    ruleIds: ["PW-A11Y-001"],
    title: "Exercise keyboard paths and audit accessibility",
    summary:
      "Drive flows by role and keyboard the way assistive tech does, and add automated a11y scans with @axe-core/playwright on key screens.",
    prefer: `await page.getByRole('button', { name: 'Next' }).focus()
await page.keyboard.press('Enter')

// automated audit
import AxeBuilder from '@axe-core/playwright'
const results = await new AxeBuilder({ page }).analyze()
expect(results.violations).toEqual([])`,
    reference: "https://playwright.dev/docs/accessibility-testing",
  },
  {
    id: "bp-standards-no-only",
    category: "coding_standards",
    ruleIds: ["PW-STD-001"],
    title: "Never commit focused tests (.only)",
    summary:
      "test.only / describe.only silently skip the rest of the suite in CI. Forbid them with the no-focused-test lint rule so a green build really means everything ran.",
    avoid: `test.only('debugging this one', async ({ page }) => { ... })`,
    prefer: `test('debugging this one', async ({ page }) => { ... })
// .eslintrc: 'playwright/no-focused-test': 'error'`,
    reference: "https://playwright.dev/docs/test-annotations",
  },
];

export function categoryLabel(categoryId, categories) {
  return categories.find((c) => c.id === categoryId)?.label ?? categoryId;
}
