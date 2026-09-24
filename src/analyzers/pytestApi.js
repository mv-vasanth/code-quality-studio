import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.pytest_api.categories.map((c) => c.id);

/** Python API-test rules (pytest + requests/httpx). Heuristic, regex-based. */
export function analysePytestApiLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
  const hasTests = /def\s+test_|@pytest/.test(content);
  const add = (r) => pushFinding(findings, r, disabled);

  if (hasTests && !/status_code|assert\s+resp|\.raise_for_status/.test(content))
    add({ ruleId: "PYA-AST-001", category: "assertions", severity: "warning",
      title: "No response assertion", description: "Test present but nothing asserts on the response (status_code/body).", impact: "Test passes without verifying the API.",
      fix: `resp = client.get("/users/1")\nassert resp.status_code == 200`, line: null });

  if (/status_code/.test(content) && !/\.json\s*\(\)|response\.json|resp\.json/.test(content))
    add({ ruleId: "PYA-AST-002", category: "assertions", severity: "info",
      title: "Status checked but not body", description: "Only status_code is asserted; the JSON body isn't.", impact: "Body/contract regressions slip through.",
      fix: `body = resp.json()\nassert body["id"] == 1`, line: lineMatches(content, /status_code/)[0] });

  const secrets = lineMatches(content, /(?:password|api_key|apikey|secret|token)\s*=\s*["'][^"']{4,}["']|Bearer\s+[A-Za-z0-9._-]{12,}/i)
    .filter((ln) => !/os\.environ|getenv/.test(lines[ln - 1] || ""));
  if (secrets.length) add({ ruleId: "PYA-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded secret / token", description: "Literal credential or bearer token in the test.", impact: "Leak via git and CI logs.",
    fix: `token = os.environ["API_TOKEN"]`, line: secrets[0] });

  const sleep = lineMatches(content, /time\.sleep\s*\(/);
  if (sleep.length) add({ ruleId: "PYA-REL-001", category: "reliability", severity: "warning",
    title: "time.sleep() in test", description: "Fixed sleep is a hard wait.", impact: "Flaky and slow.",
    fix: "Poll with a timeout, or use tenacity/retry.", line: sleep[0] });

  const noTimeout = lineMatches(content, /requests\.(get|post|put|delete|patch)\s*\(/).filter((ln) => !/timeout\s*=/.test(lines[ln - 1] || ""));
  if (noTimeout.length) add({ ruleId: "PYA-PER-001", category: "performance", severity: "info",
    title: "HTTP request without timeout", description: "requests.* with no timeout can hang.", impact: "Slow/hanging suites.",
    fix: `requests.get(url, timeout=5)`, line: noTimeout[0] });

  if (hasTests && !/@pytest\.fixture|conftest/.test(content))
    add({ ruleId: "PYA-STR-001", category: "structure", severity: "info",
      title: "No client/session fixture", description: "Tests present without a shared client/session fixture.", impact: "Duplicated setup and auth.",
      fix: `@pytest.fixture\ndef client():\n    return httpx.Client(base_url=BASE_URL)`, line: null });

  if (/\.json\s*\(\)/.test(content) && !/jsonschema|validate\(|BaseModel|pydantic|schema/.test(content))
    add({ ruleId: "PYA-VAL-001", category: "validation", severity: "info",
      title: "No response schema validation", description: "The JSON body isn't validated against a schema.", impact: "Shape drift goes unnoticed.",
      fix: `jsonschema.validate(resp.json(), user_schema)`, line: lineMatches(content, /\.json\s*\(\)/)[0] });

  const prints = lineMatches(content, /(^|\s)print\s*\(/);
  if (prints.length) add({ ruleId: "PYA-STD-001", category: "coding_standards", severity: "info",
    title: "print() in test", description: "Console prints add noise.", impact: "Noisy output.",
    fix: "Remove debug prints or use logging.", line: prints[0] });

  const absUrl = lineMatches(content, /(get|post|put|delete|patch)\s*\(\s*["']https?:\/\//i);
  if (absUrl.length) add({ ruleId: "PYA-STD-002", category: "coding_standards", severity: "warning",
    title: "Hardcoded base URL", description: "Full URL hard-coded instead of a configurable base URL.", impact: "Breaks across environments.",
    fix: `BASE_URL = os.environ["BASE_URL"]  # then client.get("/users/1")`, line: absUrl[0] });

  const todo = lineMatches(content, /#\s*(TODO|FIXME)/i);
  if (todo.length) add({ ruleId: "PYA-STD-003", category: "coding_standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.", impact: "Unfinished tests ship.",
    fix: "Resolve or link to an issue.", line: todo[0] });

  const statusLines = lineMatches(content, /status_code/);
  const hasNegativePath = /status_code\s*(?:==|!=|in|>=|<)\s*[^\n]*\b[45]\d\d\b|\b[45]\d\d\b\s*==\s*[^\n]*status_code|pytest\.raises\s*\([^)]*(?:HTTPError|HTTPStatusError|ResponseError)/.test(content);
  if (statusLines.length && !hasNegativePath)
    add({ ruleId: "PYA-AST-003", category: "assertions", severity: "warning",
      title: "No negative-path coverage", description: `Every status_code assertion expects a 2xx/3xx result (first at line ${statusLines[0]}); no 4xx/5xx case is asserted anywhere.`, impact: "Validation, auth and not-found handling are untested, so the API can start returning 200 for invalid input with the suite still green.",
      fix: `def test_unknown_user_returns_404(client):\n    resp = client.get("/users/999999")\n    assert resp.status_code == 404\n    assert resp.json()["error"] == "NOT_FOUND"`, line: statusLines[0] });

  const truthyAssert = lineMatches(content, /assert\s+[\w.]*\.ok\b|assert\s+(?:resp|response|r)\s*(?:#.*)?$/);
  if (truthyAssert.length) add({ ruleId: "PYA-AST-004", category: "assertions", severity: "warning",
    title: "Truthiness assertion instead of an explicit status", description: `Line ${truthyAssert[0]} asserts on the response object or .ok rather than a specific status code.`, impact: "`.ok` is true for any 2xx/3xx, and a bare Response object is always truthy — a 204, a 302 redirect to a login page, or any response at all passes.",
    fix: `assert resp.status_code == 201`, line: truthyAssert[0] });

  const noVerify = lineMatches(content, /verify\s*=\s*False/);
  if (noVerify.length) add({ ruleId: "PYA-SEC-002", category: "security", severity: "critical",
    title: "TLS verification disabled", description: `verify=False at line ${noVerify[0]} turns off certificate validation for the request.`, impact: "Tests pass against expired, self-signed or intercepted certificates, so a TLS misconfiguration reaches production unnoticed — and the pattern gets copied into application code.",
    fix: `resp = client.get("/users/1", timeout=5)  # trust the real CA\n# if an internal CA is needed: verify="/etc/ssl/certs/internal-ca.pem"`, line: noVerify[0], reference: "https://requests.readthedocs.io/en/latest/user/advanced/#ssl-cert-verification" });

  const leakyLog = lineMatches(content, /(?:print|(?:logger|logging|log|LOG)\.\w+)\s*\([^)]*\b\w*(?:resp|response)\w*\.(?:text|content|headers|json\s*\(\s*\))/i);
  if (leakyLog.length) add({ ruleId: "PYA-SEC-003", category: "security", severity: "warning",
    title: "Full response body/headers logged", description: `Line ${leakyLog[0]} logs the raw response text, content or headers.`, impact: "Access tokens, Set-Cookie values and PII from the response land in CI logs, which are retained and widely readable.",
    fix: `logger.debug("GET /users/1 -> %s", resp.status_code)  # status only`, line: leakyLog[0] });

  const ordered = lineMatches(content, /@pytest\.mark\.(?:dependency|order|run)\b|^\s*global\s+\w+/);
  if (ordered.length) add({ ruleId: "PYA-REL-002", category: "reliability", severity: "warning",
    title: "Order-dependent / shared mutable state", description: `Line ${ordered[0]} declares an execution-order dependency or mutates a module-level global.`, impact: "Tests can't run in isolation, under -p no:randomly, or with pytest-xdist; one early failure cascades into misleading downstream failures.",
    fix: `@pytest.fixture\ndef created_user(client):\n    resp = client.post("/users", json=payload)\n    yield resp.json()\n    client.delete(f"/users/{resp.json()['id']}")`, line: ordered[0] });

  const swallowed = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*except\b[^\n]*:\s*(?:pass|\.\.\.)\s*(?:#.*)?$/.test(lines[i])) swallowed.push(i + 1);
    else if (/^\s*except\b[^\n]*:\s*(?:#.*)?$/.test(lines[i]) && /^\s*(?:pass|\.\.\.)\s*(?:#.*)?$/.test(lines[i + 1] || "")) swallowed.push(i + 1);
  }
  if (swallowed.length) add({ ruleId: "PYA-REL-003", category: "reliability", severity: "warning",
    title: "Exception silently swallowed", description: `The except block at line ${swallowed[0]} does nothing but pass.`, impact: "A real connection error, timeout or JSON decode failure is absorbed and the test reports success — a permanently green, permanently useless test.",
    fix: `with pytest.raises(httpx.ConnectTimeout):\n    client.get("/slow", timeout=0.001)`, line: swallowed[0] });

  if (hasTests && !/\.elapsed\b|response_time|perf_counter|time\.monotonic/.test(content))
    add({ ruleId: "PYA-PER-002", category: "performance", severity: "info",
      title: "Response time / SLA never asserted", description: "No test measures how long a request took (resp.elapsed, perf_counter).", impact: "A steadily degrading endpoint stays green until it breaches a real user-facing timeout.",
      fix: `assert resp.elapsed.total_seconds() < 1.5`, line: null });

  if (/\.json\s*\(\)/.test(content) && !/headers\s*\[|\.headers\.get|content[-_]type/i.test(content))
    add({ ruleId: "PYA-VAL-002", category: "validation", severity: "info",
      title: "Response headers never validated", description: "The body is parsed as JSON but no test checks Content-Type or any other response header.", impact: "A service that starts returning HTML error pages, or drops cache/CORS/security headers, passes unnoticed.",
      fix: `assert resp.headers["content-type"].startswith("application/json")`, line: lineMatches(content, /\.json\s*\(\)/)[0] });

  const directCalls = countMatches(content, /requests\.(?:get|post|put|delete|patch|head)\s*\(/g);
  if (directCalls >= 3 && !/requests\.Session\s*\(|httpx\.(?:Client|AsyncClient)\s*\(/.test(content))
    add({ ruleId: "PYA-STR-002", category: "structure", severity: "info",
      title: "New connection per request (no Session)", description: `${directCalls} module-level requests.* calls with no requests.Session() / httpx.Client().`, impact: "Every call re-does DNS, TCP and the TLS handshake and cannot share auth headers or cookies — slow suites and duplicated setup.",
      fix: `@pytest.fixture(scope="session")\ndef client():\n    with requests.Session() as s:\n        s.headers.update({"Authorization": f"Bearer {token}"})\n        yield s`, line: lineMatches(content, /requests\.(?:get|post|put|delete|patch|head)\s*\(/)[0] });

  const loginCalls = lineMatches(content, /\.(?:get|post|request)\s*\([^\n]*["'][^"'\n]*(?:\/login|\/token|\/oauth|\/authenticate|\/signin)\b/i);
  if (loginCalls.length > 1 && !/@pytest\.fixture\s*\(\s*scope\s*=\s*["'](?:session|module|package)["']/.test(content))
    add({ ruleId: "PYA-STR-003", category: "structure", severity: "warning",
      title: "Auth token re-fetched per test", description: `${loginCalls.length} authentication calls (first at line ${loginCalls[0]}) with no session/module-scoped fixture caching the token.`, impact: "Every test pays a login round-trip and can trip the identity provider's rate limits, making the suite slow and intermittently 429-flaky.",
      fix: `@pytest.fixture(scope="session")\ndef token(client):\n    return client.post("/oauth/token", json=creds).json()["access_token"]`, line: loginCalls[0] });

  const skipped = lineMatches(content, /@pytest\.mark\.(?:skip|skipif|xfail)\b|pytest\.skip\s*\(/);
  if (skipped.length) add({ ruleId: "PYA-STD-004", category: "coding_standards", severity: "warning",
    title: "Skipped / xfailed test", description: `Line ${skipped[0]} disables a test with a skip, skipif or xfail marker.`, impact: "The file still looks like it covers the scenario while nothing is actually verified, and muted tests tend to stay muted for good.",
    fix: `@pytest.mark.skip(reason="PROJ-1234: re-enable once /users/bulk ships")\n# …or delete the test if the behaviour is gone.`, line: skipped[0] });

  // ── Test tagging / markers ──
  if (hasTests && !/@pytest\.mark\.\w+/.test(content))
    add({ ruleId: "PYA-STD-005", category: "coding_standards", severity: "info",
      title: "Tests carry no @pytest.mark marker",
      description: "No @pytest.mark.* marker appears in this file, so its tests cannot be selected with -m.",
      impact: "CI runs everything on every commit — no smoke subset, and a flaky endpoint test can only be excluded by deleting it.",
      fix: `@pytest.mark.contract\ndef test_user_schema(client):\n    ...\n\n# then: pytest -m contract`,
      line: lineMatches(content, /def\s+test_/)[0] ?? null,
      reference: "https://docs.pytest.org/en/stable/example/markers.html" });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { tests: countMatches(content, /def\s+test_/g), hardcodedSecrets: secrets.length, sleeps: sleep.length },
    summary: `Pytest API scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
