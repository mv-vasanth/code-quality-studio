import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.restassured.categories.map((c) => c.id);

/** REST Assured (Java) API-test rules. Heuristic, regex-based. */
export function analyseRestAssuredLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
  const hasTests = /@Test\b|given\s*\(\)|io\.restassured/i.test(content);
  const add = (r) => pushFinding(findings, r, disabled);

  const hasAssertion = /\.then\s*\(|statusCode\s*\(|\.body\s*\(|assertThat\s*\(/.test(content);
  if (hasTests && !hasAssertion) add({ ruleId: "RA-AST-001", category: "assertions", severity: "warning",
    title: "No response assertions", description: "REST Assured test present but no .then()/statusCode()/body() assertions found.", impact: "Test can pass without verifying the response.",
    fix: `given().when().get("/users/1").then().statusCode(200).body("id", equalTo(1));`, line: null, reference: "https://rest-assured.io" });

  const hasStatus = /statusCode\s*\(/.test(content);
  if (hasStatus && !/\.body\s*\(|matchesJsonSchema/.test(content)) add({ ruleId: "RA-AST-002", category: "assertions", severity: "info",
    title: "Status asserted but not body/schema", description: "Only the status code is checked; the payload isn't validated.", impact: "Contract regressions in the body slip through.",
    fix: `.then().statusCode(200).body("email", equalTo(expected))\n// or .body(matchesJsonSchemaInClasspath("user.json"))`, line: lineMatches(content, /statusCode\s*\(/)[0] });

  const secrets = lineMatches(content, /(?:password|apiKey|api_key|token|secret)\s*=\s*"[^"]{4,}"|Bearer\s+[A-Za-z0-9._-]{12,}/i)
    .filter((ln) => !/System\.getenv|@Value|process\.env/.test(lines[ln - 1] || ""));
  if (secrets.length) add({ ruleId: "RA-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded secret / token", description: "Literal credential or bearer token in the test.", impact: "Secret leaks via git history and CI logs.",
    fix: `String token = System.getenv("API_TOKEN");`, line: secrets[0] });

  const relaxed = lineMatches(content, /relaxedHTTPSValidation|useRelaxedHTTPSValidation/);
  if (relaxed.length) add({ ruleId: "RA-SEC-002", category: "security", severity: "warning",
    title: "TLS validation relaxed", description: "relaxedHTTPSValidation() disables certificate checks.", impact: "Tests pass against insecure/misconfigured endpoints.",
    fix: "Trust the environment's real certificates instead.", line: relaxed[0] });

  const absUrl = lineMatches(content, /(baseURI\s*=\s*"https?:\/\/|\.(get|post|put|delete|patch)\s*\(\s*"https?:\/\/)/i);
  if (absUrl.length) add({ ruleId: "RA-CFG-001", category: "ci_config", severity: "warning",
    title: "Hardcoded absolute URL / baseURI", description: "Endpoints hard-code a full URL instead of a configurable baseURI.", impact: "Breaks across local/staging/CI.",
    fix: `RestAssured.baseURI = System.getenv("BASE_URI");\ngiven().when().get("/users/1");`, line: absUrl[0] });

  const sleep = lineMatches(content, /Thread\.sleep\s*\(/);
  if (sleep.length) add({ ruleId: "RA-REL-001", category: "reliability", severity: "warning",
    title: "Thread.sleep() in test", description: "Blocking sleep is a hard wait.", impact: "Flaky and slow suites.",
    fix: "Poll with Awaitility, or assert on an eventually-consistent condition.", line: sleep[0] });

  if (countMatches(content, /given\s*\(\)/g) > 2 && !/RequestSpecification/.test(content))
    add({ ruleId: "RA-STR-001", category: "structure", severity: "info",
      title: "No reusable RequestSpecification", description: "Repeated given() setup without a shared RequestSpecification.", impact: "Duplicated auth/headers/baseURI across tests.",
      fix: `RequestSpecification spec = new RequestSpecBuilder().setBaseUri(base).build();\ngiven().spec(spec)…`, line: lineMatches(content, /given\s*\(\)/)[0] });

  const sysout = lineMatches(content, /System\.(out|err)\.print/);
  if (sysout.length) add({ ruleId: "RA-STD-001", category: "coding_standards", severity: "info",
    title: "System.out in test", description: "Console prints add noise; prefer log().ifValidationFails() or a logger.", impact: "Noisy output.",
    fix: `given().log().ifValidationFails()…`, line: sysout[0] });

  const todo = lineMatches(content, /\/\/\s*(TODO|FIXME)|\/\*\s*(TODO|FIXME)/i);
  if (todo.length) add({ ruleId: "RA-STD-002", category: "coding_standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.", impact: "Unfinished tests ship.",
    fix: "Resolve or link to an issue.", line: todo[0] });

  const statusCalls = lineMatches(content, /statusCode\s*\(/);
  const hasNegativeStatus = /statusCode\s*\(\s*(?:HttpStatus\.)?(?:SC_)?(?:4\d\d|5\d\d|BAD_REQUEST|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|CONFLICT|UNPROCESSABLE_ENTITY|TOO_MANY_REQUESTS|INTERNAL_SERVER_ERROR)/i.test(content)
    || /statusCode\s*\(\s*(?:anyOf|is|oneOf)\s*\([^)]*[45]\d\d/.test(content);
  if (statusCalls.length && !hasNegativeStatus)
    add({ ruleId: "RA-AST-003", category: "assertions", severity: "warning",
      title: "No negative-path coverage", description: `Every statusCode(...) assertion in this file expects a 2xx/3xx result (first at line ${statusCalls[0]}); no 4xx/5xx case is asserted anywhere.`, impact: "Error handling, validation and auth failures are completely untested — the API can start returning 200 for invalid input and the suite stays green.",
      fix: `@Test\nvoid rejectsUnknownUser() {\n    given().spec(spec)\n        .when().get("/users/999999")\n        .then().statusCode(404).body("error", equalTo("NOT_FOUND"));\n}`, line: statusCalls[0], reference: "https://rest-assured.io/#usage" });

  if (/\.body\s*\(/.test(content) && !/matchesJsonSchema/.test(content))
    add({ ruleId: "RA-AST-004", category: "assertions", severity: "info",
      title: "No JSON-schema contract validation", description: "Body assertions cherry-pick individual fields but the payload is never validated against a JSON schema.", impact: "Removed, renamed or re-typed fields that nobody asserts on go unnoticed until a consumer breaks.",
      fix: `.then().statusCode(200)\n    .body(matchesJsonSchemaInClasspath("schemas/user.json"));`, line: lineMatches(content, /\.body\s*\(/)[0], reference: "https://github.com/rest-assured/rest-assured/wiki/Usage#json-schema-validation" });

  if (hasTests && !/\btime\s*\(|ResponseTime|timeIn\s*\(|getTimeIn/.test(content))
    add({ ruleId: "RA-AST-005", category: "assertions", severity: "info",
      title: "Response time / SLA never asserted", description: "No .time(...) assertion anywhere; the suite never checks how long the API takes to respond.", impact: "Performance regressions ship silently because only correctness is gated.",
      fix: `.then().statusCode(200)\n    .time(lessThan(1500L), TimeUnit.MILLISECONDS);`, line: null, reference: "https://github.com/rest-assured/rest-assured/wiki/Usage#measuring-response-time" });

  const verboseLog = lineMatches(content, /\.log\s*\(\s*\)\s*\.(?:all|everything|body|headers)\s*\(|\.prettyPrint\s*\(\s*\)|\.prettyPeek\s*\(\s*\)|\.peek\s*\(\s*\)/);
  if (verboseLog.length) add({ ruleId: "RA-SEC-003", category: "security", severity: "warning",
    title: "Full request/response logged unconditionally", description: `log().all() / prettyPrint() at line ${verboseLog[0]} dumps every header and body, including Authorization, Set-Cookie and PII.`, impact: "Credentials and personal data end up in CI build logs, which are usually retained and broadly readable.",
    fix: `given().log().ifValidationFails()\n    .when().get("/users/1")\n    .then().log().ifValidationFails().statusCode(200);`, line: verboseLog[0], reference: "https://github.com/rest-assured/rest-assured/wiki/Usage#logging" });

  const inlineAuth = lineMatches(content, /\.(?:basic|digest|form|oauth2|oauth)\s*\(\s*"[^"]{2,}"/);
  if (inlineAuth.length) add({ ruleId: "RA-SEC-004", category: "security", severity: "critical",
    title: "Credentials inlined in auth() call", description: `An auth helper at line ${inlineAuth[0]} is called with string literals instead of injected values.`, impact: "Real usernames/passwords or OAuth tokens are committed to the repository and cannot be rotated without a code change.",
    fix: `given().auth().preemptive().basic(System.getenv("API_USER"), System.getenv("API_PASSWORD"))`, line: inlineAuth[0], reference: "https://github.com/rest-assured/rest-assured/wiki/Usage#authentication" });

  if (hasTests && !/CONNECTION_TIMEOUT|SO_TIMEOUT|socket\.timeout|connectTimeout|readTimeout|HttpClientConfig|http\.connection\.timeout/i.test(content))
    add({ ruleId: "RA-REL-002", category: "reliability", severity: "warning",
      title: "No HTTP connect/read timeout configured", description: "No HttpClientConfig / CONNECTION_TIMEOUT / SO_TIMEOUT setting is present, so requests fall back to the client default (often unbounded).",
      impact: "A hung or black-holed endpoint blocks the build until the CI job-level timeout kills it, hiding the real failure.",
      fix: `RestAssured.config = RestAssured.config().httpClient(\n    HttpClientConfig.httpClientConfig()\n        .setParam("http.connection.timeout", 5000)\n        .setParam("http.socket.timeout", 10000));`, line: null, reference: "https://github.com/rest-assured/rest-assured/wiki/Usage#connection-timeout" });

  const swallow = lineMatches(content, /catch\s*\(\s*(?:final\s+)?[\w.]*(?:Exception|Throwable)\b/);
  if (swallow.length && !/\bfail\s*\(|\bthrow\s+new\s+|assertThrows\s*\(/.test(content))
    add({ ruleId: "RA-REL-003", category: "reliability", severity: "warning",
      title: "Exception swallowed inside test", description: `A catch block at line ${swallow[0]} has no fail(...), rethrow or assertThrows(...).`, impact: "A genuine request/parse failure is silently absorbed and the test reports success — a permanently green, permanently useless test.",
      fix: `// let it propagate, or assert on it explicitly\nassertThrows(SocketTimeoutException.class, () -> given().spec(spec).get("/slow"));`, line: swallow[0] });

  const ordered = lineMatches(content, /@TestMethodOrder|@FixMethodOrder|@Order\s*\(|dependsOnMethods|@Stepwise/);
  if (ordered.length) add({ ruleId: "RA-STR-002", category: "structure", severity: "warning",
    title: "Order-dependent tests", description: `Explicit execution ordering is declared at line ${ordered[0]}, so tests rely on running in sequence.`, impact: "Tests cannot run in isolation or in parallel, and one early failure cascades into misleading downstream failures.",
    fix: `// Make each test self-sufficient via a fixture instead of ordering:\n@BeforeEach\nvoid seed() { createdId = createUser(); }`, line: ordered[0] });

  const mutableStatic = lineMatches(content, /^\s*(?:public|private|protected)?\s*static\s+(?!final\b)[A-Za-z_][\w.<>,[\]]*(?:<[^>]*>)?\s+\w+\s*(?:=[^=]|;)/);
  if (hasTests && mutableStatic.length) add({ ruleId: "RA-STR-003", category: "structure", severity: "warning",
    title: "Shared mutable static state between tests", description: `A non-final static field is declared at line ${mutableStatic[0]} and is written by tests.`, impact: "Tests leak state into each other, so results depend on execution order and break under parallel execution.",
    fix: `// Scope the state to the test, or make it immutable:\nprivate static final RequestSpecification SPEC = buildSpec();\nprivate int createdId; // per-instance, reset by JUnit each test`, line: mutableStatic[0] });

  const loginCalls = lineMatches(content, /\.(?:post|get)\s*\([^\n]*"[^"\n]*(?:\/login|\/oauth\/token|\/token|\/authenticate)\b/i);
  if (loginCalls.length > 1 && !/@BeforeAll|@BeforeClass/.test(content))
    add({ ruleId: "RA-STR-004", category: "structure", severity: "info",
      title: "Auth token re-fetched per test", description: `${loginCalls.length} separate authentication calls (first at line ${loginCalls[0]}) with no @BeforeAll to fetch the token once.`, impact: "Every test pays a login round-trip and can trip the identity provider's rate limits, making the suite slow and flaky.",
      fix: `private static String token;\n\n@BeforeAll\nstatic void authenticate() {\n    token = given().spec(spec).body(creds).post("/login").jsonPath().getString("token");\n}`, line: loginCalls[0] });

  const disabledTests = lineMatches(content, /@Disabled\b|@Ignore\b/);
  if (disabledTests.length) add({ ruleId: "RA-STD-003", category: "coding_standards", severity: "warning",
    title: "Disabled / ignored test", description: `@Disabled or @Ignore at line ${disabledTests[0]} keeps the test in the file but out of the run.`, impact: "Coverage looks intact while the scenario is actually unverified, and muted tests tend to stay muted indefinitely.",
    fix: `@Disabled("PROJ-1234: re-enable once /users/bulk is deployed to staging")\n// …or delete the test if the behaviour is gone.`, line: disabledTests[0] });

  // ── Test tagging / grouping ──
  {
    const hasTag = /@Tag\s*\(|@Category\s*\(|groups\s*=\s*[{"']/.test(content);
    if (/@Test\b/.test(content) && !hasTag) add({
      ruleId: "RA-STD-004", category: "coding_standards", severity: "info",
      title: "Tests carry no @Tag or TestNG group",
      description: "No @Tag, @Category or groups= appears in this file, so its tests cannot be selected by the runner.",
      impact: "Contract and smoke suites cannot be run separately, so every pipeline stage pays for the full API suite.",
      fix: `@Test\n@Tag("contract")\nvoid userSchemaIsStable() { }\n\n// then: mvn test -Dgroups=contract`,
      line: lineMatches(content, /@Test\b/)[0] ?? null,
      reference: "https://junit.org/junit5/docs/current/user-guide/#writing-tests-tagging-and-filtering",
    });
  }

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { tests: countMatches(content, /@Test\b/g), hardcodedSecrets: secrets.length, sleeps: sleep.length },
    summary: `REST Assured scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
