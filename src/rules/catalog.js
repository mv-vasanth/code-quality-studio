/**
 * Declarative catalog of built-in local (rules) checks — reviewed in the Rules tab.
 * Detection logic lives in localAnalyzer.js / analyzers/*.js; keep IDs in sync.
 */

const PLAYWRIGHT_RULES = [
  { ruleId: "PW-SEL-001", category: "selectors", severity: "warning", title: "XPath locators detected", description: "XPath-style locators in page.locator or xpath=.", impact: "Brittle tests when DOM changes.", detection: "xpath=, locator('//…'), page.locator with //" },
  { ruleId: "PW-SEL-002", category: "selectors", severity: "info", title: "CSS ID locators", description: "ID-based CSS selectors.", impact: "Couples tests to implementation IDs.", detection: "locator('#…')" },
  { ruleId: "PW-SEL-003", category: "selectors", severity: "info", title: "No user-facing locators found", description: "Spec file without getByRole/Label/Text/TestId.", impact: "Suite may rely on brittle selectors.", detection: "Missing getByRole|getByLabel|getByText|getByTestId in .spec/.test files" },
  { ruleId: "PW-REL-001", category: "reliability", severity: "critical", title: "Hard waits (waitForTimeout)", description: "Fixed delays instead of auto-waiting.", impact: "Flaky or slow CI.", detection: "waitForTimeout(" },
  { ruleId: "PW-REL-002", category: "reliability", severity: "warning", title: "page.$$() without web-first assertion", description: "Bulk queries without locator assertions.", impact: "Race conditions on dynamic UI.", detection: "page.$$(" },
  { ruleId: "PW-STR-001", category: "structure", severity: "info", title: "No describe grouping", description: "Tests without test.describe.", impact: "Harder navigation in large suites.", detection: "test( without test.describe" },
  { ruleId: "PW-AST-001", category: "assertions", severity: "warning", title: "expect(await ...) anti-pattern", description: "Await inside expect().", impact: "No assertion retries.", detection: "expect(await …)" },
  { ruleId: "PW-AST-002", category: "assertions", severity: "critical", title: "No expect() assertions", description: "Tests with no expect() calls.", impact: "Tests may pass without checks.", detection: "test( present, expect( absent" },
  { ruleId: "PW-MOB-001", category: "mobile", severity: "info", title: "No mobile / viewport signals", description: "No viewport/device/mobile project references.", impact: "Responsive regressions missed.", detection: "No viewport|devices|mobile in spec" },
  { ruleId: "PW-SEC-001", category: "security", severity: "critical", title: "Possible hardcoded secret", description: "Literal password/token/API key patterns.", impact: "Secrets in git history.", detection: "password|api_key|secret|token = '…'" },
  { ruleId: "PW-PER-001", category: "performance", severity: "info", title: "Many page.goto calls", description: "More than 3 navigations in one file.", impact: "Slower suites.", detection: "page.goto( count > 3" },
  { ruleId: "PW-A11Y-001", category: "accessibility", severity: "info", title: "Limited a11y-oriented interactions", description: "No keyboard/role interaction patterns.", impact: "A11y regressions uncaught.", detection: "No getByRole|keyboard|press in test file" },
  { ruleId: "PW-STD-001", category: "coding_standards", severity: "critical", title: "Focused test (.only)", description: "test.only / describe.only.", impact: "CI skips most tests.", detection: ".only(" },
  { ruleId: "PW-CI-001", category: "ci_config", severity: "warning", title: "Hardcoded absolute URLs", description: "goto('https://…') instead of baseURL.", impact: "Breaks across environments.", detection: "goto('http…')" },
  { ruleId: "PW-SEL-004", category: "selectors", severity: "info", title: "Index-based locator (.nth)", description: "Selecting elements by position.", impact: "Breaks when DOM order changes.", detection: ".nth(" },
  { ruleId: "PW-SEL-005", category: "selectors", severity: "info", title: "Legacy string selector engine", description: "locator('text=' / 'css=').", impact: "Less readable; misses getBy* API.", detection: "locator('text=' | 'css='" },
  { ruleId: "PW-REL-003", category: "reliability", severity: "warning", title: "waitForSelector used", description: "Explicit waits vs auto-waiting locators.", impact: "Redundant, hides timing assumptions.", detection: "waitForSelector(" },
  { ruleId: "PW-REL-004", category: "reliability", severity: "warning", title: "networkidle wait", description: "waitForLoadState('networkidle').", impact: "Flaky on polling/long connections.", detection: "networkidle" },
  { ruleId: "PW-REL-005", category: "reliability", severity: "warning", title: "Deprecated waitForNavigation", description: "waitForNavigation().", impact: "Races; deprecated.", detection: "waitForNavigation(" },
  { ruleId: "PW-REL-006", category: "reliability", severity: "warning", title: "Conditional on element state", description: "if (await …isVisible()).", impact: "Racy branching.", detection: "if (await …isVisible/isEnabled(" },
  { ruleId: "PW-STR-002", category: "structure", severity: "warning", title: "Serial mode couples tests", description: "describe.serial / mode:'serial'.", impact: "Cascading failures; no parallelism.", detection: "describe.serial( | mode:'serial'" },
  { ruleId: "PW-STR-003", category: "structure", severity: "info", title: "beforeAll/afterAll shared state", description: "State shared across tests.", impact: "Order-dependent flakiness.", detection: "beforeAll( | afterAll(" },
  { ruleId: "PW-AST-003", category: "assertions", severity: "info", title: "Weak assertion (toBeTruthy/Falsy)", description: "Truthiness instead of concrete state.", impact: "Passes for wrong reasons.", detection: ".toBeTruthy() | .toBeFalsy()" },
  { ruleId: "PW-AST-004", category: "assertions", severity: "warning", title: "Non-Playwright assertion library", description: "Node assert / chai.", impact: "No web-first retries.", detection: "assert( | from 'chai'" },
  { ruleId: "PW-STD-002", category: "coding_standards", severity: "warning", title: "page.pause() left in code", description: "Inspector pause committed.", impact: "Hangs CI.", detection: "page.pause(" },
  { ruleId: "PW-STD-003", category: "coding_standards", severity: "info", title: "console logging in tests", description: "Leftover console.* calls.", impact: "Noisy reports; possible data leak.", detection: "console.log/debug/info(" },
  { ruleId: "PW-STD-004", category: "coding_standards", severity: "info", title: "Skipped / fixme test committed", description: "test.skip / test.fixme.", impact: "Silent coverage loss.", detection: "test.skip( | .fixme(" },
  { ruleId: "PW-SEC-002", category: "security", severity: "warning", title: "ignoreHTTPSErrors enabled", description: "TLS validation disabled.", impact: "Masks cert problems.", detection: "ignoreHTTPSErrors: true" },
  { ruleId: "PW-SEC-003", category: "security", severity: "critical", title: "Credentials embedded in URL", description: "user:password@host URL.", impact: "Secret leaks via git/logs.", detection: "https://user:pass@…" },
  { ruleId: "PW-CI-002", category: "ci_config", severity: "warning", title: "headless: false committed", description: "Forced headed mode.", impact: "Slow / fails on headless agents.", detection: "headless: false" },
  { ruleId: "PW-CI-003", category: "ci_config", severity: "info", title: "Hardcoded per-test timeout", description: "test.setTimeout().", impact: "Masks slow flows.", detection: "test.setTimeout(" },
  { ruleId: "PW-MOB-002", category: "mobile", severity: "info", title: "Hardcoded viewport size", description: "setViewportSize() vs devices[].", impact: "Misses device UA/touch.", detection: "setViewportSize(" },
  { ruleId: "PW-PER-002", category: "performance", severity: "info", title: "Manual page.screenshot in test", description: "Inline screenshots.", impact: "Slower runs; extra artifacts.", detection: "page.screenshot(" },
  { ruleId: "PW-REL-007", category: "reliability", severity: "warning", title: "force: true bypasses actionability", description: "{ force: true } on actions.", impact: "Hides real UI problems.", detection: "force: true" },
  { ruleId: "PW-REL-008", category: "reliability", severity: "warning", title: "Low-level DOM access", description: "$eval / $$eval / elementHandle.", impact: "Stale refs; races.", detection: "$eval( | $$eval( | elementHandle" },
  { ruleId: "PW-STD-005", category: "coding_standards", severity: "info", title: "Arbitrary sleep in test", description: "setTimeout / custom sleep().", impact: "Flaky and slow.", detection: "setTimeout( | sleep(" },
  { ruleId: "PW-SEC-004", category: "security", severity: "warning", title: "Browser security disabled", description: "--disable-web-security launch flag.", impact: "Unrealistic config.", detection: "disable-web-security" },
  { ruleId: "PW-A11Y-002", category: "accessibility", severity: "info", title: "No automated accessibility scan", description: "Tests present without @axe-core.", impact: "WCAG regressions missed.", detection: "tests present, no axe/AxeBuilder" },
  { ruleId: "PW-PER-003", category: "performance", severity: "info", title: "test.slow() used", description: "Triples timeout instead of fixing.", impact: "Masks slow flows.", detection: "test.slow(" },
  { ruleId: "PW-AST-005", category: "assertions", severity: "info", title: "Brittle snapshot assertion", description: "toMatchSnapshot on text/DOM.", impact: "Noisy failures.", detection: "toMatchSnapshot(" },
  { ruleId: "PW-STD-006", category: "coding_standards", severity: "warning", title: "Possible unfinished / AI-boilerplate code", description: "Placeholder comments, TODO/FIXME stubs, generic YOUR_VALUE_HERE, or stray assistant text.", impact: "Half-finished code ships with stubs and fake values.", detection: "// TODO | // ... your code | YOUR_..._HERE | 'as an AI' chatter" },
];

const JAVA_API_RULES = [
  { ruleId: "JV-SEC-001", category: "security", severity: "critical", title: "SQL injection risk", description: "Dynamic SQL or Statement.", impact: "Data breach risk.", detection: "createStatement, concatenated SQL" },
  { ruleId: "JV-SEC-002", category: "security", severity: "critical", title: "Hardcoded credential or secret", description: "Literals for passwords/keys.", impact: "Leak via source control.", detection: "password|apiKey = \"…\"" },
  { ruleId: "JV-ERR-001", category: "error_handling", severity: "warning", title: "Empty catch block", description: "Swallowed exceptions.", impact: "Undiagnosable failures.", detection: "catch () { }" },
  { ruleId: "JV-OBS-001", category: "observability", severity: "warning", title: "System.out/err instead of logger", description: "Console print in services.", impact: "Poor observability.", detection: "System.out.print" },
  { ruleId: "JV-API-001", category: "api_design", severity: "info", title: "Consider explicit HTTP responses", description: "REST without ResponseEntity.", impact: "Ambiguous status codes.", detection: "@RestController without ResponseEntity" },
  { ruleId: "JV-API-002", category: "api_design", severity: "warning", title: "Nullable returns on API layer", description: "return null on API paths.", impact: "NPEs or empty 200s.", detection: "return null in controller" },
  { ruleId: "JV-CON-001", category: "concurrency", severity: "warning", title: "Manual thread creation", description: "new Thread() or .start().", impact: "Thread leaks under load.", detection: "new Thread(, .start()" },
  { ruleId: "JV-PER-001", category: "performance", severity: "warning", title: "Possible N+1 query pattern", description: "find in loop with JPA.", impact: "Latency at scale.", detection: "for + findById in loop" },
  { ruleId: "JV-TST-001", category: "testing", severity: "info", title: "No test annotations in file", description: "Service/controller without @Test.", impact: "Untested changes.", detection: "class Service/Controller, no @Test" },
  { ruleId: "JV-MNT-001", category: "maintainability", severity: "info", title: "Large class", description: "Class body very long.", impact: "Hard to maintain.", detection: "class > ~250 lines heuristic" },
  { ruleId: "JV-ERR-002", category: "error_handling", severity: "warning", title: "printStackTrace() instead of logging", description: "e.printStackTrace().", impact: "Errors bypass log aggregation.", detection: "printStackTrace(" },
  { ruleId: "JV-ERR-003", category: "error_handling", severity: "info", title: "Overly broad exception catch", description: "catch (Exception|Throwable).", impact: "Hides unexpected bugs.", detection: "catch (Exception | Throwable" },
  { ruleId: "JV-SEC-003", category: "security", severity: "warning", title: "Weak cryptographic algorithm", description: "MD5/SHA-1/DES/RC4.", impact: "Forgeable hashes / reversible ciphers.", detection: "getInstance(\"MD5\"|\"SHA-1\"|\"DES\"" },
  { ruleId: "JV-SEC-004", category: "security", severity: "warning", title: "Permissive CORS (*)", description: "origins=\"*\" / allowedOrigins(\"*\").", impact: "Any site can call the API.", detection: "@CrossOrigin origins=\"*\" | allowedOrigins(\"*\")" },
  { ruleId: "JV-DAT-001", category: "data_access", severity: "info", title: "SELECT * query", description: "Selecting all columns.", impact: "Extra I/O; fragile mapping.", detection: "SELECT *" },
  { ruleId: "JV-API-003", category: "api_design", severity: "warning", title: "@RequestBody without @Valid", description: "Payload bound without validation.", impact: "Invalid input reaches logic.", detection: "@RequestBody present, no @Valid/@Validated" },
  { ruleId: "JV-CON-002", category: "concurrency", severity: "warning", title: "Thread.sleep() blocks the thread", description: "Blocking sleep.", impact: "Thread-pool starvation.", detection: "Thread.sleep(" },
  { ruleId: "JV-STD-001", category: "java_standards", severity: "info", title: "Field injection (@Autowired)", description: "Field-level @Autowired.", impact: "Hard to unit test.", detection: "@Autowired on field" },
  { ruleId: "JV-STD-002", category: "java_standards", severity: "warning", title: "System.exit() in application code", description: "Abrupt JVM termination.", impact: "Kills the server/container.", detection: "System.exit(" },
  { ruleId: "JV-TST-002", category: "testing", severity: "info", title: "Disabled test committed", description: "@Disabled / @Ignore.", impact: "Silent coverage loss.", detection: "@Disabled | @Ignore" },
  { ruleId: "JV-MNT-002", category: "maintainability", severity: "info", title: "Unresolved TODO/FIXME", description: "Leftover TODO/FIXME.", impact: "Unfinished work ships.", detection: "// TODO | // FIXME" },
];

const TYPESCRIPT_RULES = [
  { ruleId: "TS-TYP-001", category: "type_safety", severity: "warning", title: "Use of `any`", description: "any / as any.", impact: "Runtime bugs.", detection: ": any, as any" },
  { ruleId: "TS-TYP-002", category: "type_safety", severity: "warning", title: "TypeScript error suppression", description: "@ts-ignore.", impact: "Hidden type debt.", detection: "@ts-ignore|@ts-expect-error" },
  { ruleId: "TS-TYP-003", category: "type_safety", severity: "info", title: "Heavy non-null assertion", description: "Frequent !.", impact: "Undefined at runtime.", detection: "!. operator count > 3" },
  { ruleId: "TS-HTTP-001", category: "http_clients", severity: "warning", title: "fetch() without status handling", description: "No response.ok check.", impact: "Silent HTTP failures.", detection: "fetch without .ok/status" },
  { ruleId: "TS-HTTP-002", category: "http_clients", severity: "info", title: "Axios without visible catch", description: "axios without error handling.", impact: "Unhandled rejections.", detection: "axios without catch" },
  { ruleId: "TS-SEC-001", category: "security", severity: "critical", title: "Hardcoded secret or token", description: "Secrets in source.", impact: "Exposure in bundles/git.", detection: "token/password literals" },
  { ruleId: "TS-STD-001", category: "standards", severity: "info", title: "Console logging", description: "Many console.log calls.", impact: "No structured logs.", detection: "console.log count > 2" },
  { ruleId: "TS-ERR-001", category: "error_handling", severity: "warning", title: "Empty catch block", description: "Swallowed errors.", impact: "Failed requests look OK.", detection: "empty catch" },
  { ruleId: "TS-VAL-001", category: "validation", severity: "warning", title: "Request body without validation", description: "req.body without Zod/Yup.", impact: "Invalid data in logic.", detection: "req.body without schema lib" },
  { ruleId: "TS-STR-001", category: "structure", severity: "info", title: "Large barrel re-exports", description: "Many export * from.", impact: "Circular deps / bundle size.", detection: "export * from count > 5" },
  { ruleId: "TS-ASY-001", category: "async_io", severity: "warning", title: "async callback in forEach", description: ".forEach(async …).", impact: "Unsequenced; errors lost.", detection: ".forEach(async" },
  { ruleId: "TS-PER-001", category: "performance", severity: "info", title: "Sequential await in loop", description: "await inside for/while.", impact: "Latency is the sum of calls.", detection: "for (…) { … await …" },
  { ruleId: "TS-SEC-002", category: "security", severity: "warning", title: "Dynamic code execution (eval)", description: "eval / new Function.", impact: "Code-injection risk.", detection: "eval( | new Function(" },
  { ruleId: "TS-SEC-003", category: "security", severity: "warning", title: "Unsanitised HTML injection", description: "innerHTML= / dangerouslySetInnerHTML.", impact: "XSS.", detection: "innerHTML= | dangerouslySetInnerHTML" },
  { ruleId: "TS-ERR-002", category: "error_handling", severity: "warning", title: "Throwing a non-Error value", description: "throw 'string'.", impact: "Loses stack; breaks instanceof.", detection: "throw '…' / \"…\" / `…`" },
  { ruleId: "TS-TYP-004", category: "type_safety", severity: "info", title: "Double type assertion", description: "as unknown as T.", impact: "Bypasses the type system.", detection: "as unknown as" },
  { ruleId: "TS-TYP-005", category: "type_safety", severity: "info", title: "Weak type (Function/Object)", description: ": Function / : Object.", impact: "Near-any types.", detection: ": Function | : Object" },
  { ruleId: "TS-TST-001", category: "testing", severity: "warning", title: "Focused test (.only)", description: "it.only / describe.only.", impact: "CI runs one test, stays green.", detection: "(it|test|describe).only(" },
  { ruleId: "TS-STD-002", category: "standards", severity: "info", title: "Legacy var declaration", description: "var used.", impact: "Scoping bugs.", detection: "var <name>" },
  { ruleId: "TS-VAL-002", category: "validation", severity: "info", title: "JSON.parse without guard", description: "JSON.parse with no try/catch.", impact: "Crashes on bad data; returns any.", detection: "JSON.parse( without try" },
  { ruleId: "TS-STD-003", category: "standards", severity: "info", title: "Unresolved TODO/FIXME", description: "Leftover TODO/FIXME.", impact: "Unfinished work ships.", detection: "// TODO | // FIXME" },
];

const PLAYWRIGHT_JAVA_RULES = [
  { ruleId: "PWJ-SEL-001", category: "selectors", severity: "warning", title: "XPath locator", description: "locator(\"//…\") / xpath=.", impact: "Brittle when DOM changes.", detection: "locator(\"//\" | xpath=" },
  { ruleId: "PWJ-SEL-002", category: "selectors", severity: "info", title: "CSS id locator", description: "locator(\"#…\").", impact: "Couples tests to ids.", detection: "locator(\"#\"" },
  { ruleId: "PWJ-SEL-003", category: "selectors", severity: "info", title: "No user-facing locators", description: "No getByRole/Text/Label/TestId.", impact: "Likely brittle selectors.", detection: "@Test present, no getBy*" },
  { ruleId: "PWJ-REL-001", category: "reliability", severity: "critical", title: "Hard wait (waitForTimeout)", description: "Fixed delay.", impact: "Flaky/slow CI.", detection: "waitForTimeout(" },
  { ruleId: "PWJ-REL-002", category: "reliability", severity: "critical", title: "Thread.sleep() in test", description: "Blocking hard wait.", impact: "Flaky and slow.", detection: "Thread.sleep(" },
  { ruleId: "PWJ-REL-003", category: "reliability", severity: "warning", title: "waitForSelector used", description: "Explicit wait vs auto-waiting.", impact: "Redundant; hides assumptions.", detection: "waitForSelector(" },
  { ruleId: "PWJ-REL-004", category: "reliability", severity: "warning", title: "Conditional on element state", description: "if (locator.isVisible()).", impact: "Racy branching.", detection: "if (…isVisible()/isEnabled())" },
  { ruleId: "PWJ-AST-001", category: "assertions", severity: "warning", title: "No web-first assertions", description: "No assertThat(...) in a test file.", impact: "Tests may not verify UI.", detection: "@Test present, no assertThat(" },
  { ruleId: "PWJ-AST-002", category: "assertions", severity: "warning", title: "JUnit assertion on locator state", description: "assertTrue(locator.isVisible()).", impact: "No web-first retry.", detection: "assertTrue/Equals(…isVisible()/textContent()" },
  { ruleId: "PWJ-STR-001", category: "structure", severity: "info", title: "No setup hooks", description: "No @BeforeEach/@BeforeAll.", impact: "Duplicated setup.", detection: "@Test present, no @BeforeEach/@BeforeAll" },
  { ruleId: "PWJ-SEC-001", category: "security", severity: "critical", title: "Hardcoded secret", description: "Literal password/token/apiKey.", impact: "Secret leaks via git/logs.", detection: "password/apiKey/secret/token = \"…\"" },
  { ruleId: "PWJ-SEC-002", category: "security", severity: "warning", title: "TLS validation disabled", description: "setIgnoreHTTPSErrors(true).", impact: "Masks cert problems.", detection: "setIgnoreHTTPSErrors(true)" },
  { ruleId: "PWJ-PER-001", category: "performance", severity: "info", title: "Inline screenshot", description: "Manual .screenshot().", impact: "Slower runs; extra artifacts.", detection: ".screenshot(" },
  { ruleId: "PWJ-RES-001", category: "resource_mgmt", severity: "warning", title: "Playwright not closed", description: "Playwright.create() without try-with-resources.", impact: "Leaked browser processes.", detection: "Playwright.create() without try (" },
  { ruleId: "PWJ-STD-001", category: "coding_standards", severity: "warning", title: "page.pause() left in code", description: "Inspector pause committed.", impact: "Hangs CI.", detection: ".pause()" },
  { ruleId: "PWJ-STD-002", category: "coding_standards", severity: "info", title: "System.out in tests", description: "Console prints.", impact: "Noisy output.", detection: "System.out/err.print" },
  { ruleId: "PWJ-STD-003", category: "coding_standards", severity: "info", title: "Unresolved TODO/FIXME", description: "Leftover TODO/FIXME.", impact: "Unfinished work ships.", detection: "// TODO | // FIXME" },
  { ruleId: "PWJ-CI-001", category: "ci_config", severity: "warning", title: "Hardcoded absolute URL", description: "navigate(\"https://…\").", impact: "Breaks across environments.", detection: "navigate(\"http…\")" },
];

export const RULE_CATALOG_BY_STACK = {
  playwright: PLAYWRIGHT_RULES,
  java_api: JAVA_API_RULES,
  typescript: TYPESCRIPT_RULES,
  playwright_java: PLAYWRIGHT_JAVA_RULES,
};

export function getRuleCatalog(stackId) {
  return RULE_CATALOG_BY_STACK[stackId] ?? RULE_CATALOG_BY_STACK.playwright;
}

export function getRuleCatalogEntry(stackId, ruleId) {
  return getRuleCatalog(stackId).find((r) => r.ruleId === ruleId) ?? null;
}
