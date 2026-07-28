# Playwright best practices

Reference for **Playwright Quality Studio** audits (local rules and AI). Keep tests aligned with these standards.

| Dimension | Topics in this guide |
|-----------|----------------------|
| Selectors | Role/aria locators, `data-testid` |
| Structure | POM, fixtures, tags, folder layout |
| Reliability | Auto-wait, isolation, API mocking |
| Assertions | Web-first `expect(locator)` |
| Performance | `storageState` |
| CI / config | Sharding, traces, reporters, browser install |

---

## Selectors

### Use role-based and aria locators — not XPath or CSS selectors

Playwright's locator API with `getByRole`, `getByLabel`, and `getByText` is resilient to DOM changes and mirrors how users interact with the page.

```ts
// avoid
page.locator('#btn-submit-03')
page.locator('div > span.submit')

// prefer
page.getByRole('button', { name: 'Submit' })
page.getByLabel('Email address')
```

### Use data-testid for elements with no stable role selectors

When no aria role or label exists, add `data-testid` attributes in the app. They survive refactors and are explicit about their purpose.

```ts
page.getByTestId('checkout-total')
```

---

## Structure

### Use Page Object Model (POM)

Encapsulate page interactions in classes. Tests stay readable; selectors are maintained in one place. Each page = one class.

```ts
class LoginPage {
  constructor(page) { this.page = page }
  async login(email, pass) {
    await this.page.getByLabel('Email').fill(email)
    await this.page.getByLabel('Password').fill(pass)
    await this.page.getByRole('button', { name: 'Sign in' }).click()
  }
}
```

### Use fixtures for shared setup and teardown

Playwright fixtures let you inject reusable context (logged-in page, seeded DB, mock API) into any test without repeating `beforeEach` blocks.

```ts
const test = base.extend({
  loggedInPage: async ({ page }, use) => {
    await page.goto('/login')
    await loginAs(page, 'admin')
    await use(page)
  }
})
```

### Tag and group tests for selective runs

Use `@smoke`, `@regression`, `@critical` tags. Run only what CI needs at each stage.

```ts
test('login flow @smoke', async ({ page }) => { ... })
// run: npx playwright test --grep @smoke
```

### Follow a consistent folder structure

Organise by feature, not by type.

```
tests/
  auth/
    login.spec.ts
    pages/LoginPage.ts
  checkout/
    checkout.spec.ts
    pages/CheckoutPage.ts
  fixtures/
    auth.fixture.ts
```

---

## Reliability

### Never use hard waits — rely on auto-waiting

Playwright auto-waits for elements to be visible, enabled, and stable before acting.

```ts
// never do this
await page.waitForTimeout(3000)

// let Playwright handle it
await page.getByRole('button', { name: 'Save' }).click()
await expect(page.getByText('Saved')).toBeVisible()
```

### Use web-first assertions

`expect(locator).toBeVisible()` retries until true or timeout.

```ts
// fragile — no retry
expect(await page.isVisible('#result')).toBe(true)

// resilient — retries automatically
await expect(page.getByTestId('result')).toBeVisible()
```

### Isolate test data — never share state between tests

Each test should create and clean up its own data. Use API calls (`request` fixture) to seed data faster than UI.

```ts
test.beforeEach(async ({ request }) => {
  await request.post('/api/seed', { data: testUser })
})
test.afterEach(async ({ request }) => {
  await request.delete('/api/cleanup')
})
```

### Mock external APIs and third-party services

Use `page.route()` to intercept and mock API calls.

```ts
await page.route('**/api/payments', route =>
  route.fulfill({ json: { status: 'success' } })
)
```

---

## Performance & maintenance

### Use storageState to reuse authentication

Log in once, save the session, reuse across tests.

```ts
// global-setup.ts
await page.context().storageState({ path: 'auth.json' })

// playwright.config.ts
use: { storageState: 'auth.json' }
```

---

## CI / reporting

### Run tests in parallel with sharding

```bash
npx playwright test --shard=1/4
npx playwright test --shard=2/4
```

### Enable trace, video, and screenshot on failure

```ts
use: {
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure'
}
```

### Use HTML reporter + Allure for stakeholder reporting

```ts
reporter: [['html'], ['allure-playwright']]
```

### Pin browser versions in CI

```yaml
# in CI pipeline
- run: npx playwright install --with-deps chromium
```

---

## Rule ID cross-reference (local scanner)

| Rule ID | Practice |
|---------|----------|
| PW-SEL-001 | Avoid XPath locators |
| PW-SEL-002 | Avoid brittle CSS `#id` locators; prefer test ids |
| PW-SEL-003 | Prefer user-facing locators |
| PW-REL-001 | No `waitForTimeout` |
| PW-AST-001 | Web-first assertions |
| PW-STR-001 | Group tests with `test.describe` / POM |
| PW-CI-001 | Use `baseURL`, not hardcoded absolute URLs |

Full rule logic: `src/localAnalyzer.js`. UI copy: **Guide** tab in the app.
