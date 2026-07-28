/**
 * In-depth, beginner-friendly explanations for each practice, keyed by practice id.
 * Shared source of truth: rendered both in the Practices tab (expandable) and inside
 * finding cards (matched via the finding's ruleId → practice → id).
 *
 * Shape per entry:
 *   how:     string  — plain-language explanation of what/why (2-4 sentences).
 *   gotchas: string[] (optional) — common mistakes / clarifications.
 *   steps:   string[] (optional) — ordered "how to apply".
 */
export const PRACTICE_DETAILS = {
  // ── Playwright ──────────────────────────────────────────────
  "bp-selectors-role": {
    how: "getByRole / getByLabel / getByText find elements the way a user or screen reader does — by accessible role and visible text — instead of by internal DOM structure. Because roles and labels rarely change when developers refactor markup or CSS, these locators survive UI changes that would break a CSS or XPath selector.",
    gotchas: [
      "If getByRole can't find an element, check its accessible name in the browser's accessibility inspector.",
      "Reach for getByTestId only when no role/label/text option exists.",
    ],
  },
  "bp-selectors-testid": {
    how: "When an element has no meaningful role or label (a plain div, an icon button), add a data-testid attribute in the app code and target it with getByTestId. It's an explicit contract between the app and the test that survives refactors.",
    gotchas: [
      "Keep test ids stable and semantic (checkout-total, not div-3).",
      "Add them in the app source, not by editing the DOM from a test.",
    ],
  },
  "bp-structure-pom": {
    how: "A Page Object wraps the selectors and actions for one screen in a class, so tests read like user intent (loginPage.login(...)) and every selector lives in one place. When the UI changes you fix one file instead of many tests.",
    gotchas: ["Keep assertions in the test, not the page object — the object performs actions, the test verifies outcomes."],
  },
  "bp-structure-fixtures": {
    how: "Fixtures build and tear down reusable context (a logged-in page, seeded data, a mocked API) and inject it into any test that asks for it by name. They replace copy-pasted beforeEach blocks and run only for tests that actually use them.",
    gotchas: [
      "Call `await use(value)` exactly once; code after it is the teardown.",
      "Fixtures are lazy — nothing runs unless a test requests it.",
    ],
  },
  "bp-structure-tags": {
    how: "Tagging tests (@smoke, @regression) lets CI run a fast subset on every push and the full suite nightly, selected with --grep. It keeps pipelines fast without deleting coverage.",
    gotchas: ["Tags are just text in the title — keep them consistent so --grep patterns match."],
  },
  "bp-structure-folders": {
    how: "Grouping by feature (auth/, checkout/) keeps a feature's spec, page objects, and fixtures together, so changes stay local and new engineers find things quickly.",
  },
  "bp-reliability-waits": {
    how: "Playwright auto-waits for an element to be attached, visible, stable, and enabled before acting, and web-first assertions retry until they pass or time out. A fixed waitForTimeout just guesses a duration — too short and it flakes, too long and every run wastes that time.",
    gotchas: ["If you think you need a wait, assert the thing you're waiting for instead (toBeVisible, toHaveURL)."],
  },
  "bp-reliability-assertions": {
    how: "expect(locator).toBeVisible() re-checks the live page until it's true or the timeout hits, absorbing normal async timing. expect(await something).toBe(true) captures a value once, so it can't retry and flakes under load.",
    gotchas: ["Pass the locator to expect(), don't await a boolean inside it — that's what enables the retry."],
  },
  "bp-reliability-isolation": {
    how: "Each test should create its own data and clean up after itself, so tests can run in any order or in parallel without interfering. Seeding through the API request fixture is faster and less flaky than doing setup through the UI.",
    gotchas: ["Shared state is the #1 cause of order-dependent flakiness — never rely on a previous test's leftovers."],
  },
  "bp-reliability-mock": {
    how: "page.route() intercepts network calls so you can return a fixed response, removing flakiness from slow or unreliable third parties and letting you exercise error paths on demand.",
    gotchas: ["Register the route before the navigation or action that triggers the request."],
  },
  "bp-ci-sharding": {
    how: "Playwright runs tests in parallel workers on one machine and can split (shard) the suite across several CI machines, cutting wall-clock time roughly linearly with the number of shards.",
    steps: [
      "Confirm tests are isolated (own data, no shared state) so any subset can run alone.",
      "Run npx playwright test --shard=<index>/<total> on each of <total> parallel CI jobs.",
      "Have each job produce a blob report, then combine them with npx playwright merge-reports for one HTML report.",
    ],
    gotchas: ["Sharding is only safe when tests are isolated — see the test-data isolation practice."],
  },
  "bp-ci-artifacts": {
    how: "Capturing trace, screenshot, and video only on failure (or first retry) gives you a full replay of what went wrong without bloating storage on green runs. The trace viewer shows DOM, network, and console at each step.",
    steps: [
      "In playwright.config.ts set use: { trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'retain-on-failure' }.",
      "Upload the playwright-report/ and test-results/ folders as CI artifacts after the run.",
      "Debug a failure locally with npx playwright show-trace <path-to-trace.zip>.",
    ],
    gotchas: ["'on-first-retry' keeps artifacts small while still capturing the failure."],
  },
  "bp-ci-reporters": {
    how: "The built-in HTML reporter is great for engineers; adding a reporter like Allure produces dashboards and trends that non-technical stakeholders can read.",
    steps: [
      "Set reporter: [['html'], ['allure-playwright']] in playwright.config.ts.",
      "Run the suite, then generate the report with allure generate (or allure open to view locally).",
      "Publish the HTML/Allure output from CI so stakeholders can see results and trends.",
    ],
  },
  "bp-perf-storage": {
    how: "Log in once in global setup, save the browser session to a file with storageState, then reuse it across tests so no test repeats the login flow — usually a big speedup.",
    steps: [
      "Write a global-setup file that logs in once and calls await page.context().storageState({ path: 'auth.json' }).",
      "Point globalSetup at that file in playwright.config.ts.",
      "Set use: { storageState: 'auth.json' } so every test starts already authenticated.",
      "Regenerate auth.json when the session expires or the login flow changes.",
    ],
    gotchas: ["Refresh the stored state when auth expires or the login flow changes."],
  },
  "bp-ci-browsers": {
    how: "Running `npx playwright install` in CI downloads the exact browser build your Playwright version expects, so results match between local and CI.",
    steps: [
      "Add npx playwright install --with-deps chromium as a CI step before running tests.",
      "Pin the Playwright version in package.json so the browser build is deterministic.",
      "Optionally cache the browser download between CI runs to save time.",
    ],
    gotchas: ["Pin the browser via the Playwright version in package.json; use --with-deps on Linux CI."],
  },
  "bp-ci-baseurl": {
    how: "Setting baseURL in the config and using relative paths (page.goto('/login')) means the same suite runs against localhost, staging, or CI by changing one env var — no code edits.",
    steps: [
      "In playwright.config.ts set use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' }.",
      "Replace absolute URLs in tests with relative paths, e.g. page.goto('/login').",
      "Provide BASE_URL per environment — a local shell variable, and a CI variable/secret for staging.",
    ],
    gotchas: ["Absolute URLs in tests hard-code one environment and break everywhere else."],
  },
  "bp-reliability-locators-over-query": {
    how: "page.$$ and element handles grab a snapshot of the DOM at one instant, so counts and text can be stale if the UI is still updating. Locators re-query each time and pair with auto-waiting assertions like toHaveCount.",
    gotchas: ["Prefer expect(locator).toHaveCount(n) over reading .length off a handle array."],
  },
  "bp-mobile-projects": {
    how: "Projects that spread a device descriptor (devices['Pixel 5']) run the same specs at mobile viewport, user agent, and touch settings, catching responsive regressions alongside desktop.",
    steps: [
      "Import { devices } from '@playwright/test' in playwright.config.ts.",
      "Add one project per device, spreading the descriptor: { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }.",
      "Run everything with npx playwright test, or just one with --project=mobile-chrome.",
    ],
    gotchas: ["Run a single project locally with --project=mobile-chrome for speed."],
  },
  "bp-security-secrets": {
    how: "A literal password or token in a spec gets committed to git history and printed in CI logs forever. Read them from process.env, or better, reuse a pre-authenticated storageState so the secret never appears in test code.",
    gotchas: ["Rotate any secret that ever landed in a commit — deleting the line doesn't scrub history."],
  },
  "bp-accessibility-checks": {
    how: "Driving flows by role and keyboard (Tab/Enter) tests the same paths assistive tech uses, and @axe-core/playwright runs an automated audit that fails the test on WCAG violations.",
    gotchas: ["Automated scans catch roughly a third of issues — keep some manual keyboard/screen-reader checks too."],
  },
  "bp-standards-no-only": {
    how: "test.only / describe.only tells Playwright to run only that test and skip everything else — useful while debugging, disastrous if committed, because CI then silently runs one test and still reports green.",
    gotchas: ["Add the playwright/no-focused-test ESLint rule so a stray .only fails the build, not production."],
  },

  // ── Java API ────────────────────────────────────────────────
  "jv-api-rest": {
    how: "ResponseEntity lets you set the exact status and body, and returning a DTO (not the JPA entity) keeps your API contract separate from your database schema — so you can change the DB without breaking clients or leaking columns.",
    gotchas: [
      "Returning the entity can expose lazy relations and internal fields; map to a DTO at the boundary.",
      "orElse(null) becomes a 200 with an empty body — return 404 instead.",
    ],
  },
  "jv-sec-prepared": {
    how: "A parameterized query sends the SQL and the values separately, so the database always treats user input as data, never as executable SQL. String concatenation lets input like ' OR '1'='1 change the query's meaning.",
    gotchas: [
      "Table/column names and ORDER BY can't be parameterized — whitelist those against a known set.",
      "In JPA use :named parameters, never string-built JPQL.",
    ],
  },
  "jv-sec-secrets": {
    how: "Externalized config injects secrets at runtime from environment variables or a config server/vault, so each environment supplies its own and the repository stays clean.",
    gotchas: [
      "@Value reads a property — supply it via env/config, not a hardcoded default.",
      "Never log the resolved secret value.",
    ],
  },
  "jv-err-global": {
    how: "An empty catch makes a failure vanish — no log, no error response, just wrong behavior later. A central @RestControllerAdvice maps each exception type to a consistent status and error body, so clients always get clear, uniform errors.",
    gotchas: [
      "If you must catch locally, at least log the cause; never catch and ignore.",
      "Map domain exceptions to codes; don't leak stack traces to clients.",
    ],
  },
  "jv-data-tx": {
    how: "@Transactional on a service method makes all its writes commit together or roll back together, so a mid-way failure can't leave half-written data. Keep the method short and don't touch lazy-loaded relations after it returns.",
    gotchas: [
      "Calling a @Transactional method from the same class bypasses the proxy — the transaction won't start.",
      "Long transactions hold database locks; keep them tight.",
    ],
  },
  "jv-obs-log": {
    how: "A logger (SLF4J) supports levels, formatting, and routing to files or aggregators, and parameterized messages (log.info(\"id={}\", id)) avoid building strings unless that level is enabled. System.out can't be filtered and is invisible in most log pipelines.",
    gotchas: [
      "Use {} placeholders, not string concatenation.",
      "Include correlation/user ids so logs are traceable.",
    ],
  },
  "jv-con-pool": {
    how: "new Thread() has no limit, no queue, and no shutdown, so under load it can spawn thousands and exhaust memory. An ExecutorService or @Async uses a bounded, managed pool with back-pressure and clean shutdown.",
    gotchas: [
      "Always define the pool size and a shutdown hook.",
      "Don't have pool threads block on each other — that can deadlock.",
    ],
  },
  "jv-per-n1": {
    how: "The N+1 problem is one query to load a list plus one more per row to load each row's relation — 101 queries for 100 orders. A JOIN FETCH or @EntityGraph loads everything needed in a single query.",
    gotchas: [
      "Watch your SQL logs in tests to catch N+1 early.",
      "JOIN FETCH combined with pagination needs care — it can paginate in memory.",
    ],
  },
  "jv-tst-junit": {
    how: "Mockito replaces a service's real dependencies with stand-ins you control, so you can test business logic in milliseconds without a database or web server, and assert both success and failure branches.",
    gotchas: [
      "Test edge cases and error paths, not only the happy path.",
      "Use slice tests (@WebMvcTest, @DataJpaTest) for the web and data layers.",
    ],
  },
  "jv-mnt-layer": {
    how: "Keeping controller (HTTP), service (business logic), and repository (persistence) separate means each layer has one job and can be tested and changed independently. HTTP types leaking into persistence couples them and makes both harder to change.",
    gotchas: [
      "A class that keeps growing usually has more than one responsibility — split it.",
      "Don't pass HttpServletRequest into services.",
    ],
  },
  "jv-std-records": {
    how: "A record is an immutable data carrier — declare the components once and Java generates the constructor, accessors, equals, hashCode, and toString. Ideal for request/response DTOs where you want no mutability and no boilerplate.",
    gotchas: [
      "Records are final and immutable — not suitable for a JPA @Entity, which needs a no-arg constructor and mutability.",
      "Add a compact constructor for validation.",
    ],
  },

  // ── TypeScript ──────────────────────────────────────────────
  "ts-types-strict": {
    how: "strict mode turns on the checks that catch real bugs (null checks, implicit any, and more). any opts a value out of all checking, @ts-ignore hides a specific error, and ! asserts non-null without proof — each reintroduces the runtime bugs the type system exists to prevent. Accept unknown at the edges and narrow it.",
    gotchas: [
      "Prefer unknown + a validation/narrowing step over any.",
      "If you must suppress, use @ts-expect-error (it errors once the problem is fixed) over @ts-ignore.",
    ],
  },
  "ts-http-errors": {
    how: "fetch only rejects on a network failure, not on 4xx/5xx — so res.json() on a 500 parses the error page as if it were your data. Check res.ok (and wrap axios calls) and convert failures into a typed error.",
    gotchas: [
      "axios rejects on non-2xx, but still catch and map it — don't let it bubble raw.",
      "Read the body once; calling res.json() twice throws.",
    ],
  },
  "ts-val-zod": {
    how: "Data crossing your boundary (request body, query string, env, third-party JSON) is unknown until validated. A schema parse both checks the shape and hands back a correctly typed value, so bad input fails fast with a clear error instead of crashing deep in the code.",
    gotchas: [
      "Infer your type from the schema (z.infer) so the type and validation never drift apart.",
      "Validate env vars at startup, not on first use.",
    ],
  },
  "ts-sec-env": {
    how: "Hardcoded tokens leak through git and client bundles. Read secrets from process.env and assert they exist at startup so a missing key fails loudly rather than sending undefined to an API.",
    gotchas: [
      "Never put secrets in client-side/bundled code — server env only.",
      "Rotate any secret that was ever committed.",
    ],
  },
  "ts-async-await": {
    how: "A promise you don't await is a 'floating promise' — its errors become unhandled rejections and its ordering isn't guaranteed. Await async calls (or explicitly .catch them), and re-throw a meaningful error at boundaries.",
    gotchas: [
      "Enable @typescript-eslint/no-floating-promises to catch these automatically.",
      "Use Promise.all for independent awaits instead of a serial chain.",
    ],
  },
  "ts-test-msw": {
    how: "MSW intercepts requests at the network layer, so your client code runs unchanged while you return canned success or error responses — making tests fast, offline, and deterministic.",
    gotchas: [
      "Reset handlers between tests so one test's mock doesn't leak into another.",
      "Test the error path, not only the happy path.",
    ],
  },
  "ts-struct-modules": {
    how: "Organizing by feature keeps related code together and imports short. Giant index.ts barrels that re-export everything defeat tree-shaking (the bundler pulls in the whole barrel) and invite circular imports.",
    gotchas: [
      "Import from the specific module, not a mega-barrel.",
      "Circular imports often trace back to a barrel re-exporting both sides.",
    ],
  },
  "ts-err-types": {
    how: "An empty catch discards why something failed. Catching, preserving the original cause (new Error(msg, { cause })), and throwing a typed error with a safe code gives callers something actionable and keeps the stack trace.",
    gotchas: [
      "Don't return null on error and let callers guess — throw a typed error.",
      "Keep the cause so you can debug the root failure.",
    ],
  },
  "ts-per-batch": {
    how: "Awaiting independent calls one after another (a waterfall) adds up their latencies; Promise.all runs them concurrently so total time is the slowest one. For large sets, page through results instead of loading everything at once.",
    gotchas: [
      "Only parallelize independent calls; dependent ones must stay sequential.",
      "Promise.all rejects on the first failure — use allSettled if you need every result.",
    ],
  },
  "ts-std-eslint": {
    how: "A stray console.log ships to production, clutters logs, and can print sensitive data. Use a real logger, and let ESLint (no-console, no-floating-promises) catch leftovers before merge.",
    steps: [
      "Install and extend @typescript-eslint in your ESLint config (typescript-eslint recommended-type-checked).",
      "Enable the rules: \"no-console\": \"warn\" and \"@typescript-eslint/no-floating-promises\": \"error\".",
      "Run eslint . in CI so violations block the merge, not just warn locally.",
    ],
    gotchas: ["Wire the lint rules into CI so they actually block a merge, not just warn locally."],
  },
};

export function getPracticeDetails(practiceId) {
  return PRACTICE_DETAILS[practiceId] ?? null;
}
