import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.postman.categories.map((c) => c.id);

function looksLikeCollection(content) {
  if (!/"item"\s*:/.test(content)) return false;
  return /"_postman_id"|schema.*getpostman|"info"\s*:/.test(content);
}

/** Postman / Newman collection (.json) rules. Heuristic, regex on the collection text. */
export function analysePostmanLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const add = (r) => pushFinding(findings, r, disabled);

  if (!looksLikeCollection(content)) {
    add({ ruleId: "PM-FMT-001", category: "coding_standards", severity: "info",
      title: "Not a Postman collection", description: "This .json doesn't look like a Postman v2.1 collection (no info/item).", impact: "Nothing to audit for this stack.",
      fix: "Export the collection from Postman as Collection v2.1 (JSON).", line: 1 });
    return buildAuditResult({ filename, categoryIds: CATEGORY_IDS, findings, metrics: {}, summary: `Postman scan of ${filename}: not a recognized collection.` });
  }

  const hasRequests = /"request"\s*:/.test(content);
  if (hasRequests && !/pm\.test\s*\(/.test(content))
    add({ ruleId: "PM-AST-001", category: "assertions", severity: "warning",
      title: "Requests without tests", description: "The collection has requests but no pm.test(...) scripts.", impact: "Runs (Newman) verify nothing.",
      fix: `pm.test("status is 200", () => pm.response.to.have.status(200));`, line: lineMatches(content, /"request"\s*:/)[0] });

  if (/pm\.test\s*\(/.test(content) && !/pm\.expect|pm\.response\.to|responseCode/.test(content))
    add({ ruleId: "PM-AST-002", category: "assertions", severity: "info",
      title: "Tests without assertions", description: "pm.test blocks exist but contain no pm.expect / pm.response.to assertions.", impact: "Tests pass trivially.",
      fix: `pm.test("has id", () => pm.expect(pm.response.json().id).to.eql(1));`, line: lineMatches(content, /pm\.test\s*\(/)[0] });

  const secret = lineMatches(content, /Bearer\s+(?!\{\{)[A-Za-z0-9._-]{12,}|"(?:token|apikey|api_key|password)"\s*:\s*"(?!\{\{)[^"]{8,}"/i);
  if (secret.length) add({ ruleId: "PM-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded token / secret", description: "A literal token/secret is embedded instead of a {{variable}}.", impact: "Secret leaks when the collection is shared or committed.",
    fix: `Use a variable: "Bearer {{authToken}}" and set authToken as an environment secret.`, line: secret[0] });

  const absUrl = lineMatches(content, /"raw"\s*:\s*"https?:\/\/(?!\{\{)/);
  if (absUrl.length) add({ ruleId: "PM-CFG-001", category: "ci_config", severity: "warning",
    title: "Hardcoded URL (no {{baseUrl}})", description: "Request URLs hard-code a host instead of a {{baseUrl}} variable.", impact: "Can't retarget environments without editing the collection.",
    fix: `Use {{baseUrl}}/users/1 and define baseUrl per environment.`, line: absUrl[0] });

  const clog = lineMatches(content, /console\.log/);
  if (clog.length) add({ ruleId: "PM-STD-001", category: "coding_standards", severity: "info",
    title: "console.log in scripts", description: "Leftover console.log in test/pre-request scripts.", impact: "Noisy Newman output.",
    fix: "Remove debug logging before committing.", line: clog[0] });

  const requestCount = countMatches(content, /"request"\s*:/g);
  const testCount = countMatches(content, /pm\.test\s*\(/g);

  if (/pm\.response\.to\.have\.status|pm\.response\.code|responseCode\.code/.test(content) && !/pm\.response\.json\s*\(/.test(content))
    add({ ruleId: "PM-AST-003", category: "assertions", severity: "info",
      title: "Status asserted but body never read", description: "Tests check the HTTP status code but never call pm.response.json() to inspect the payload.", impact: "An endpoint that returns 200 with an empty, malformed or error-shaped body passes every test.",
      fix: `pm.test("returns the requested user", () => {\n  const body = pm.response.json();\n  pm.expect(body.id).to.eql(1);\n  pm.expect(body).to.have.property("email");\n});`, line: lineMatches(content, /pm\.response\.to\.have\.status|pm\.response\.code/)[0], reference: "https://learning.postman.com/docs/tests-and-scripts/write-scripts/test-examples/" });

  const anyStatusAssert = /\.to\.have\.status\s*\(\s*\d{3}|(?:pm\.response\.code|responseCode\.code)\s*[=!]==?\s*\d{3}|\.code\s*\)?\s*\.to\.eql\s*\(\s*\d{3}/.test(content);
  const negStatusAssert = /\.to\.have\.status\s*\(\s*[45]\d\d|(?:pm\.response\.code|responseCode\.code)\s*[=!]==?\s*[45]\d\d|\.code\s*\)?\s*\.to\.eql\s*\(\s*[45]\d\d|\.to\.be\.oneOf\s*\(\s*\[[^\]]*[45]\d\d/.test(content);
  if (anyStatusAssert && !negStatusAssert)
    add({ ruleId: "PM-AST-004", category: "assertions", severity: "warning",
      title: "No negative-path coverage", description: "Every status assertion in the collection expects a 2xx/3xx code; nothing asserts a 4xx or 5xx response.", impact: "Auth rejection, validation errors and not-found handling are untested, so the API can silently start accepting invalid requests.",
      fix: `pm.test("unknown user returns 404", () => {\n  pm.response.to.have.status(404);\n  pm.expect(pm.response.json().error).to.eql("NOT_FOUND");\n});`, line: lineMatches(content, /\.to\.have\.status\s*\(/)[0] });

  if (requestCount > 0 && testCount > 0 && testCount < requestCount)
    add({ ruleId: "PM-AST-005", category: "assertions", severity: "warning",
      title: "Requests outnumber test scripts", description: `The collection has ${requestCount} request(s) but only ${testCount} pm.test(...) block(s), so some requests are executed with nothing asserted.`, impact: "Newman reports those requests as 'passed' purely because they were sent — regressions on the untested endpoints are invisible.",
      fix: `// Add at least one pm.test to every request's Tests tab:\npm.test("status is 200", () => pm.response.to.have.status(200));`, line: lineMatches(content, /"request"\s*:/)[0] });

  const envSecret = lineMatches(content, /pm\.(?:environment|globals|collectionVariables)\.set\s*\(\s*\\?["'][^"'\\]*(?:token|secret|password|apikey|api_key|credential)/i);
  if (envSecret.length) add({ ruleId: "PM-SEC-002", category: "security", severity: "warning",
    title: "Secret written into a persisted variable", description: `A script at line ${envSecret[0]} stores a credential with pm.environment.set / pm.globals.set.`, impact: "Postman persists these to the environment/globals file, which is routinely exported, synced and committed — the live token leaves the process.",
    fix: `// Keep it in memory for this run only:\npm.variables.set("authToken", pm.response.json().access_token);`, line: envSecret[0], reference: "https://learning.postman.com/docs/sending-requests/variables/variables/" });

  const evals = lineMatches(content, /(?:^|[^\w.$])eval\s*\(/);
  if (evals.length) add({ ruleId: "PM-SEC-003", category: "security", severity: "critical",
    title: "eval() in a collection script", description: `A pre-request or test script calls eval() at line ${evals[0]}.`, impact: "Any response or variable that reaches that call becomes executable code on the runner — a compromised or spoofed API can run arbitrary commands in CI.",
    fix: `// Parse instead of executing:\nconst payload = pm.response.json();`, line: evals[0], reference: "https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-api/" });

  const sslOff = lineMatches(content, /"strictSSL"\s*:\s*false|"insecureHTTPParser"\s*:\s*true|"disabledSystemHeaders"\s*:\s*\{\s*"host"\s*:\s*true/);
  if (sslOff.length) add({ ruleId: "PM-SEC-004", category: "security", severity: "warning",
    title: "TLS verification disabled in the collection", description: `protocolProfileBehavior turns off certificate validation at line ${sslOff[0]}.`, impact: "Requests succeed against expired, self-signed or intercepted certificates, so the suite can never catch a TLS misconfiguration.",
    fix: `Remove "strictSSL": false and trust the environment's real CA instead.`, line: sslOff[0], reference: "https://learning.postman.com/docs/sending-requests/requests/" });

  if (hasRequests && !/"auth"\s*:/.test(content))
    add({ ruleId: "PM-SEC-005", category: "security", severity: "info",
      title: "No auth defined anywhere in the collection", description: "Neither the collection nor any request declares an \"auth\" block, so authentication is presumably pasted into raw headers or missing entirely.",
      impact: "Auth cannot be rotated or switched per environment in one place, and requests drift toward hand-written Authorization headers with literal tokens.",
      fix: `"auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{authToken}}", "type": "string" }] }`, line: lineMatches(content, /"request"\s*:/)[0], reference: "https://learning.postman.com/docs/sending-requests/authorization/authorization/" });

  const localHost = lineMatches(content, /"(?:raw|host)"\s*:\s*(?:\[\s*)?"(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\d{1,3}(?:\.\d{1,3}){3})/ )
    .concat(lineMatches(content, /^\s*"(?:localhost|127\.0\.0\.1|0\.0\.0\.0)"\s*,?\s*$/));
  if (localHost.length) add({ ruleId: "PM-CFG-002", category: "ci_config", severity: "warning",
    title: "Request pinned to localhost / a raw IP", description: `A request URL targets a machine-local or literal-IP host at line ${localHost[0]}.`, impact: "The collection only works on the author's laptop — in CI or on a teammate's machine the run fails with connection refused.",
    fix: `Use {{baseUrl}}/users/1 and set baseUrl per environment (http://localhost:3000 locally, the real host in CI).`, line: localHost[0] });

  const legacyApi = lineMatches(content, /tests\s*\[\s*\\?["']|responseCode\.code|postman\.setEnvironmentVariable|postman\.setGlobalVariable/);
  if (legacyApi.length) add({ ruleId: "PM-STD-002", category: "coding_standards", severity: "info",
    title: "Deprecated Postman sandbox API", description: `Line ${legacyApi[0]} uses the pre-v2 sandbox (tests[...], responseCode.code, postman.setEnvironmentVariable).`, impact: "These globals are deprecated, produce no per-assertion reporting in Newman, and will break on a future sandbox upgrade.",
    fix: `pm.test("status is 200", () => pm.response.to.have.status(200));\npm.environment.set("userId", pm.response.json().id);`, line: legacyApi[0], reference: "https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-api/" });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { requests: countMatches(content, /"request"\s*:/g), testScripts: countMatches(content, /pm\.test\s*\(/g) },
    summary: `Postman scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
