/**
 * Why use this rule + how the fix helps — every built-in rule id (all stacks).
 * Used by finding cards, reports, and Rules tab.
 */
export const RULE_WHY_HELP = {
  "PW-SEL-001": {
    whyUse: "XPath and long CSS paths target structure that designers and devs change often.",
    howHelps: "Role, label, and text locators stay stable longer and read like user actions.",
  },
  "PW-SEL-002": {
    whyUse: "DOM ids are implementation details; renaming an id breaks tests without a product bug.",
    howHelps: "getByTestId or roles decouple tests from markup ids.",
  },
  "PW-SEL-003": {
    whyUse: "Raw CSS/XPath chains break when classes or DOM change, even when UX is fine.",
    howHelps: "User-facing locators match accessibility and survive refactors.",
  },
  "PW-REL-001": {
    whyUse: "Fixed sleeps guess timing; they flake under load or waste minutes in CI.",
    howHelps: "expect() auto-waits for real UI state so tests are faster and reliable.",
  },
  "PW-REL-002": {
    whyUse: "page.$$() returns immediately; the DOM may still be updating.",
    howHelps: "Locator + expect() uses Playwright retries until the UI is ready.",
  },
  "PW-STR-001": {
    whyUse: "Flat lists of tests are hard to navigate and share setup.",
    howHelps: "test.describe groups related flows and lets you use one beforeEach for the whole group.",
    simpleTerms:
      "This file has several standalone test() calls. Grouping them under test.describe makes the suite easier to read and gives one place for shared beforeEach setup — you do not repeat the same login/goto in every test.",
  },
  "PW-AST-001": {
    whyUse: "await inside expect() runs once with no retry window.",
    howHelps: "await expect(locator) retries until the assertion passes or times out.",
  },
  "PW-AST-002": {
    whyUse: "Tests without expect() can pass while the app is wrong or on the wrong page.",
    howHelps: "Assertions fail CI on regressions and define what success means.",
    simpleTerms:
      "Your file has tests that do things (open pages, click buttons) but never check that the result is correct. Without expect(), CI can stay green even when the app is broken.",
  },
  "PW-MOB-001": {
    whyUse: "Desktop-only runs miss viewport, touch, and responsive layout bugs.",
    howHelps: "Mobile projects or viewports catch breakage on real device sizes.",
    simpleTerms:
      "This spec file does not reference mobile viewports or device projects. That is normal for a .spec file — add a mobile project in playwright.config.ts and run with --project=mobile-chrome instead of editing every test here.",
  },
  "PW-A11Y-001": {
    whyUse: "Mouse-only flows miss keyboard and screen-reader regressions.",
    howHelps: "Role and keyboard actions align tests with inclusive UX.",
    simpleTerms:
      "Flows here rely on clicks without keyboard or role-based checks — users who navigate without a mouse may be blocked.",
  },
  "PW-SEC-001": {
    whyUse: "Secrets in repo text are copied to git history, forks, and logs.",
    howHelps: "Environment variables and vaults keep credentials out of source.",
  },
  "PW-PER-001": {
    whyUse: "Repeated full navigations multiply run time and network noise.",
    howHelps: "storageState and shared beforeEach cut redundant page.goto calls.",
  },
  "PW-STD-001": {
    whyUse: "test.only / describe.only silently skips the rest of the suite in CI.",
    howHelps: "Running the full suite catches regressions outside one test.",
  },
  "PW-CI-001": {
    whyUse: "Hard-coded hosts tie tests to one environment.",
    howHelps: "baseURL + relative paths run the same tests in local, staging, and CI.",
  },
  "JV-SEC-001": {
    whyUse: "String-built SQL lets attackers read or modify data via input.",
    howHelps: "PreparedStatement / bound parameters separate code from data.",
  },
  "JV-SEC-002": {
    whyUse: "Passwords and API keys in code leak through git and builds.",
    howHelps: "@Value, env vars, or vaults rotate secrets without code changes.",
  },
  "JV-ERR-001": {
    whyUse: "Empty catch hides failures; operators see success with broken behavior.",
    howHelps: "Log, map, or rethrow so APIs and monitors surface real errors.",
  },
  "JV-OBS-001": {
    whyUse: "System.out is not levelled, searchable, or correlated in production.",
    howHelps: "SLF4J logs integrate with metrics, traces, and alerting.",
  },
  "JV-API-001": {
    whyUse: "Implicit status codes confuse clients and complicate API versioning.",
    howHelps: "ResponseEntity makes status, headers, and body explicit.",
  },
  "JV-API-002": {
    whyUse: "return null on REST paths yields ambiguous 200 or NPEs in adapters.",
    howHelps: "Optional, 404 ResponseEntity, or exceptions give clear contracts.",
  },
  "JV-CON-001": {
    whyUse: "Hand-started threads are easy to leak and hard to cap under load.",
    howHelps: "Managed executors and @Async give lifecycle and pool limits.",
  },
  "JV-PER-001": {
    whyUse: "Loading entities inside a loop causes N+1 database round-trips.",
    howHelps: "Fetch joins, graphs, or batch queries scale with data volume.",
  },
  "JV-TST-001": {
    whyUse: "Production services without tests ship regressions undetected.",
    howHelps: "JUnit/Mockito tests lock behavior before refactor or release.",
  },
  "JV-MNT-001": {
    whyUse: "Very large classes mix responsibilities and slow reviews.",
    howHelps: "Smaller types are easier to test, name, and change safely.",
  },
  "TS-TYP-001": {
    whyUse: "`any` turns off the compiler where bugs often hide.",
    howHelps: "Proper types catch mistakes at build time, not in production.",
  },
  "TS-TYP-002": {
    whyUse: "@ts-ignore hides real type errors instead of fixing them.",
    howHelps: "Fixing types or narrow @ts-expect-error documents real exceptions.",
  },
  "TS-TYP-003": {
    whyUse: "Frequent !. assumes values exist without runtime checks.",
    howHelps: "Guards and validation avoid undefined crashes in handlers.",
  },
  "TS-HTTP-001": {
    whyUse: "fetch does not throw on 4xx/5xx; code may treat failures as success.",
    howHelps: "Checking response.ok maps HTTP errors to thrown or Result types.",
  },
  "TS-HTTP-002": {
    whyUse: "Unhandled axios rejections crash requests or return partial data.",
    howHelps: "catch / try-await surfaces failures to callers and logs.",
  },
  "TS-SEC-001": {
    whyUse: "Tokens in source appear in bundles, git, and client-side builds.",
    howHelps: "process.env and server-only config keep secrets off the client.",
  },
  "TS-STD-001": {
    whyUse: "console.log in services is noisy and lacks levels in production.",
    howHelps: "Structured loggers support filtering, redaction, and aggregation.",
  },
  "TS-ERR-001": {
    whyUse: "Swallowed errors make failed API calls look successful.",
    howHelps: "Logging and mapped errors return consistent failure responses.",
  },
  "TS-VAL-001": {
    whyUse: "Unvalidated input reaches business logic and persistence.",
    howHelps: "Schema validation at the boundary rejects bad data early.",
  },
  "TS-STR-001": {
    whyUse: "Huge barrel files hide dependencies and encourage circular imports.",
    howHelps: "Direct imports clarify boundaries and improve tree-shaking.",
  },
};
