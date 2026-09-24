import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.karate.categories.map((c) => c.id);

/** Karate (.feature) API-test rules. Heuristic, regex-based. */
export function analyseKarateLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const add = (r) => pushFinding(findings, r, disabled);
  const hasScenario = /Scenario:/.test(content);

  if (hasScenario && !/(Then|And)\s+status\b|(Then|And)\s+match\b/.test(content))
    add({ ruleId: "KA-AST-001", category: "assertions", severity: "warning",
      title: "Scenario without assertions", description: "A Scenario has no Then status / match assertion.", impact: "The call runs but nothing is verified.",
      fix: `When method get\nThen status 200\nAnd match response.id == 1`, line: lineMatches(content, /Scenario:/)[0] });

  if (/(Then|And)\s+status\b/.test(content) && !/match\s+response|(Then|And)\s+match\b/.test(content))
    add({ ruleId: "KA-AST-002", category: "assertions", severity: "info",
      title: "Status asserted but not body", description: "status is checked but the response body isn't matched.", impact: "Body/contract regressions slip through.",
      fix: `Then status 200\nAnd match response == { id: '#number', name: '#string' }`, line: lineMatches(content, /(Then|And)\s+status\b/)[0] });

  const url = lineMatches(content, /url\s+['"]https?:\/\//);
  if (url.length) add({ ruleId: "KA-CFG-001", category: "ci_config", severity: "warning",
    title: "Hardcoded URL", description: "Given url 'http…' hard-codes an environment.", impact: "Breaks across local/staging/CI.",
    fix: `# karate-config.js\nvar baseUrl = karate.env == 'prod' ? '…' : '…';\n# feature\nGiven url baseUrl`, line: url[0] });

  const secrets = lineMatches(content, /(token|password|apikey|api_key|secret)\s*=\s*['"][^'"]{4,}['"]|Bearer\s+[A-Za-z0-9._-]{12,}/i);
  if (secrets.length) add({ ruleId: "KA-SEC-001", category: "security", severity: "critical",
    title: "Hardcoded token / password", description: "Literal secret in the feature file.", impact: "Secret leaks via git and CI logs.",
    fix: `* def token = karate.properties['api.token']`, line: secrets[0] });

  const sleep = lineMatches(content, /\bsleep\s*\(|Thread\.sleep/i);
  if (sleep.length) add({ ruleId: "KA-REL-001", category: "reliability", severity: "warning",
    title: "sleep in scenario", description: "Fixed sleeps are hard waits.", impact: "Flaky and slow.",
    fix: "Use retry until, or poll for the expected state.", line: sleep[0] });

  if (countMatches(content, /Scenario:/g) > 1 && !/Background:/.test(content))
    add({ ruleId: "KA-STR-001", category: "structure", severity: "info",
      title: "No Background for shared setup", description: "Multiple Scenarios repeat setup with no Background.", impact: "Duplicated url/headers/auth.",
      fix: `Background:\n  * url baseUrl\n  * header Authorization = 'Bearer ' + token`, line: lineMatches(content, /Scenario:/)[0] });

  const dbgPrint = lineMatches(content, /\*\s*print\b/);
  if (dbgPrint.length) add({ ruleId: "KA-STD-001", category: "coding_standards", severity: "info",
    title: "Leftover * print", description: "Debug print statements committed.", impact: "Noisy output.",
    fix: "Remove * print before committing.", line: dbgPrint[0] });

  const todo = lineMatches(content, /#\s*(TODO|FIXME)/i);
  if (todo.length) add({ ruleId: "KA-STD-002", category: "coding_standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.", impact: "Unfinished scenarios ship.",
    fix: "Resolve or link to an issue.", line: todo[0] });

  const statusLines = lineMatches(content, /(?:Then|And|\*)\s+status\s+\d{3}/);
  if (statusLines.length && !/(?:Then|And|\*)\s+status\s+[45]\d\d/.test(content))
    add({ ruleId: "KA-AST-003", category: "assertions", severity: "info",
      title: "No negative-path coverage", description: `Every 'status' assertion in this feature expects a 2xx/3xx code (first at line ${statusLines[0]}); no 4xx/5xx scenario exists.`, impact: "Validation, auth and not-found handling are untested, so the API can start accepting bad input without any scenario failing.",
      fix: `Scenario: rejects an unknown user\n  Given path 'users', 999999\n  When method get\n  Then status 404\n  And match response.error == 'NOT_FOUND'`, line: statusLines[0], reference: "https://github.com/karatelabs/karate#status" });

  if (/match\s+response/.test(content) && !/#(?:string|number|boolean|array|object|notnull|present|uuid|regex|null|ignore|\()/.test(content))
    add({ ruleId: "KA-AST-004", category: "assertions", severity: "info",
      title: "No fuzzy-match / schema validation", description: "match is only used on concrete values; no fuzzy markers (#string, #number, #array, #notnull) validate the payload's shape.", impact: "Type changes and dropped fields slip through because only the handful of hard-coded values are checked.",
      fix: `And match response ==\n  """\n  { id: '#number', name: '#string', tags: '#[] #string', createdAt: '#notnull' }\n  """`, line: lineMatches(content, /match\s+response/)[0], reference: "https://github.com/karatelabs/karate#fuzzy-matching" });

  const rawAssert = lineMatches(content, /(?:\*|And|Then)\s+assert\s+.*\bresponse\b/);
  if (rawAssert.length) add({ ruleId: "KA-AST-005", category: "assertions", severity: "info",
    title: "assert used where match belongs", description: `Line ${rawAssert[0]} compares the response with 'assert' (a raw JS truthiness check) instead of 'match'.`, impact: "You lose Karate's deep comparison, fuzzy markers and its detailed diff output — a failure just says the expression was false.",
    fix: `# instead of: * assert response.id == 1\nAnd match response.id == 1`, line: rawAssert[0], reference: "https://github.com/karatelabs/karate#match" });

  const sslOff = lineMatches(content, /configure\s+ssl\s*=\s*true|relaxedHTTPSValidation/i);
  if (sslOff.length) add({ ruleId: "KA-SEC-002", category: "security", severity: "warning",
    title: "TLS certificate validation disabled", description: `'configure ssl = true' at line ${sslOff[0]} makes Karate trust every certificate.`, impact: "The suite happily passes against a misconfigured, expired or man-in-the-middled endpoint, so TLS breakage is never caught before production.",
    fix: "Remove the override and install the environment's real CA certificate in the JVM truststore.", line: sslOff[0], reference: "https://github.com/karatelabs/karate#configure" });

  const defUrl = lineMatches(content, /\*\s*def\s+\w*(?:[Uu]rl|[Hh]ost|[Ee]ndpoint)\w*\s*=\s*['"]https?:\/\//);
  if (defUrl.length) add({ ruleId: "KA-CFG-002", category: "ci_config", severity: "warning",
    title: "Environment URL defined inside the feature", description: `Line ${defUrl[0]} defines a host/base URL with '* def' in the feature file rather than in karate-config.js.`, impact: "The feature is pinned to one environment, so the same scenarios cannot be reused across local, staging and CI runs.",
    fix: `// karate-config.js\nvar config = { baseUrl: 'https://api-' + karate.env + '.example.com' };\n# feature\nGiven url baseUrl`, line: defUrl[0], reference: "https://github.com/karatelabs/karate#karate-configjs" });

  const inlineConfigure = lineMatches(content, /\*\s*configure\s+(?:headers|proxy|connectTimeout|readTimeout|charset|followRedirects|logPrettyRequest|logPrettyResponse|report)\b/);
  if (inlineConfigure.length) add({ ruleId: "KA-STR-002", category: "structure", severity: "warning",
    title: "Global 'configure' inside a feature", description: `Line ${inlineConfigure[0]} sets global HTTP configuration in the feature instead of karate-config.js.`, impact: "The setting is duplicated per feature and drifts; worse, it can leak into other features in the same run and cause order-dependent behaviour.",
    fix: `// karate-config.js\nkarate.configure('connectTimeout', 5000);\nkarate.configure('readTimeout', 10000);`, line: inlineConfigure[0], reference: "https://github.com/karatelabs/karate#configure" });

  if (/Scenario Outline:/.test(content) && !/Examples:/.test(content))
    add({ ruleId: "KA-STR-003", category: "structure", severity: "warning",
      title: "Scenario Outline without an Examples table", description: "A 'Scenario Outline:' is declared but no 'Examples:' data table follows it.", impact: "The outline's <placeholders> are never substituted — the scenario either fails to run or runs once with literal placeholder text, so the intended data-driven coverage does not exist.",
      fix: `Scenario Outline: reject invalid ids\n  Given path 'users', '<id>'\n  When method get\n  Then status <status>\n\n  Examples:\n    | id     | status |\n    | 0      | 400    |\n    | 999999 | 404    |`, line: lineMatches(content, /Scenario Outline:/)[0], reference: "https://github.com/karatelabs/karate#scenario-outline" });

  if (statusLines.length && !/responseTime/.test(content))
    add({ ruleId: "KA-REL-002", category: "reliability", severity: "info",
      title: "Response time / SLA never asserted", description: "Scenarios assert status and body but never check responseTime.", impact: "A steadily degrading endpoint keeps passing until it breaches a real user-facing timeout.",
      fix: `And assert responseTime < 1500`, line: statusLines[0], reference: "https://github.com/karatelabs/karate#responsetime" });

  if (hasScenario && !/^\s*@[\w-]+/m.test(content))
    add({ ruleId: "KA-STD-003", category: "coding_standards", severity: "info",
      title: "No tags on Feature or Scenarios", description: "The feature carries no @tags, so scenarios can't be selected or excluded by the runner.", impact: "CI has to run everything, all the time — no smoke subset, no way to quarantine a known-broken scenario.",
      fix: `@api @smoke\nFeature: users API\n\n  @regression\n  Scenario: get a user`, line: lineMatches(content, /Feature:/)[0] ?? null, reference: "https://github.com/karatelabs/karate#tags" });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { scenarios: countMatches(content, /Scenario:/g), hardcodedSecrets: secrets.length, sleeps: sleep.length },
    summary: `Karate scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
