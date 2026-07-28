import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.typescript.categories.map((c) => c.id);

export function analyseTypeScriptLocally(filename, content, options = {}) {
  const disabledRuleIds = options.disabledRuleIds ?? new Set();
  const findings = [];

  const anyLines = lineMatches(content, /:\s*any\b|as\s+any\b|<any>/);
  if (anyLines.length) {
    pushFinding(findings, {
      ruleId: "TS-TYP-001",
      category: "type_safety",
      severity: "warning",
      title: "Use of `any` weakens type safety",
      description: `${anyLines.length} occurrence(s) of any — prefer unknown, generics, or narrow types.`,
      impact: "Defeats compiler checks; bugs reach runtime.",
      fix: `function parsePayload(raw: unknown): User {\n  const data = userSchema.parse(raw);\n  return data;\n}`,
      line: anyLines[0],
    }, disabledRuleIds);
  }

  const tsIgnore = lineMatches(content, /@ts-ignore|@ts-expect-error/);
  if (tsIgnore.length) {
    pushFinding(findings, {
      ruleId: "TS-TYP-002",
      category: "type_safety",
      severity: "warning",
      title: "TypeScript error suppression",
      description: "ts-ignore hides real type errors instead of fixing them.",
      impact: "Technical debt accumulates; refactors break silently.",
      fix: `// fix underlying type or use @ts-expect-error with a comment explaining why`,
      line: tsIgnore[0],
    }, disabledRuleIds);
  }

  const nonNull = countMatches(content, /\w+!\./g);
  if (nonNull > 3) {
    pushFinding(findings, {
      ruleId: "TS-TYP-003",
      category: "type_safety",
      severity: "info",
      title: "Heavy non-null assertion usage",
      description: "Frequent !. assumes values exist without runtime checks.",
      impact: "Runtime undefined errors in API handlers.",
      fix: `if (!user) throw new NotFoundError('user');\nreturn user.email;`,
      line: lineMatches(content, /\w+!\./)[0],
    }, disabledRuleIds);
  }

  const fetchNoCheck = /fetch\s*\([^)]+\)/.test(content) && !/\.ok|response\.status|try\s*\{[\s\S]*fetch/.test(content);
  if (fetchNoCheck) {
    pushFinding(findings, {
      ruleId: "TS-HTTP-001",
      category: "http_clients",
      severity: "warning",
      title: "fetch() without status handling",
      description: "HTTP errors do not throw — check response.ok or status.",
      impact: "Silent failures and wrong success paths.",
      fix: `const res = await fetch(url);\nif (!res.ok) throw new HttpError(res.status, await res.text());\nreturn res.json();`,
      line: lineMatches(content, /fetch\s*\(/)[0],
    }, disabledRuleIds);
  }

  if (/axios\.(get|post)/.test(content) && !/catch\s*\(|\.catch\(/.test(content)) {
    pushFinding(findings, {
      ruleId: "TS-HTTP-002",
      category: "http_clients",
      severity: "info",
      title: "Axios call without visible error handling",
      description: "Network and 4xx/5xx should be handled at boundary.",
      impact: "Unhandled rejections in API layer.",
      fix: `try {\n  const { data } = await axios.get<User>('/api/user');\n  return data;\n} catch (err) {\n  throw mapAxiosError(err);\n}`,
      line: lineMatches(content, /axios\./)[0],
    }, disabledRuleIds);
  }

  const secrets = lineMatches(
    content,
    /(?:password|api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]{4,}['"]/i,
  ).filter((ln) => !/process\.env|import\.meta\.env/.test(content.split(/\r?\n/)[ln - 1]));
  if (secrets.length) {
    pushFinding(findings, {
      ruleId: "TS-SEC-001",
      category: "security",
      severity: "critical",
      title: "Hardcoded secret or token",
      description: "Load secrets from environment or vault.",
      impact: "Exposure via git and client bundles.",
      fix: `const apiKey = process.env.API_KEY;\nif (!apiKey) throw new Error('API_KEY missing');`,
      line: secrets[0],
    }, disabledRuleIds);
  }

  const consoleLog = lineMatches(content, /console\.(log|debug|info)\s*\(/);
  if (consoleLog.length > 2) {
    pushFinding(findings, {
      ruleId: "TS-STD-001",
      category: "standards",
      severity: "info",
      title: "Console logging in production code",
      description: "Use a structured logger (pino, winston) with levels.",
      impact: "No log aggregation or redaction in production.",
      fix: `logger.info({ orderId }, 'order created');`,
      line: consoleLog[0],
    }, disabledRuleIds);
  }

  const emptyCatch = lineMatches(content, /catch\s*\([^)]*\)\s*\{\s*\}/);
  if (emptyCatch.length) {
    pushFinding(findings, {
      ruleId: "TS-ERR-001",
      category: "error_handling",
      severity: "warning",
      title: "Empty catch block",
      description: "Errors are swallowed without logging or mapping.",
      impact: "Failed API calls appear successful.",
      fix: `catch (error) {\n  logger.error({ err: error }, 'request failed');\n  throw new AppError('REQUEST_FAILED', { cause: error });\n}`,
      line: emptyCatch[0],
    }, disabledRuleIds);
  }

  if (/z\.object|zod|yup\.object|class-validator/.test(content) === false && /req\.body|request\.json|ctx\.request/.test(content)) {
    pushFinding(findings, {
      ruleId: "TS-VAL-001",
      category: "validation",
      severity: "warning",
      title: "Request body used without visible validation",
      description: "Validate and parse input with Zod, Yup, or class-validator at the boundary.",
      impact: "Invalid data reaches business logic or persistence.",
      fix: `const body = createUserSchema.parse(await request.json());`,
      line: lineMatches(content, /req\.body|request\.json/)[0],
    }, disabledRuleIds);
  }

  if (/export\s+\*\s+from/.test(content) && countMatches(content, /export\s+\*\s+from/g) > 5) {
    pushFinding(findings, {
      ruleId: "TS-STR-001",
      category: "structure",
      severity: "info",
      title: "Barrel file with many re-exports",
      description: "Large index.ts barrels can hurt tree-shaking and create circular deps.",
      impact: "Slower builds and accidental public API surface.",
      fix: "Import from concrete modules; keep barrels thin.",
      line: lineMatches(content, /export\s+\*\s+from/)[0],
    }, disabledRuleIds);
  }

  // ── Advanced / SME-level TypeScript checks ───────────────────
  const tFirst = (re) => lineMatches(content, re)[0] ?? null;

  const forEachAsync = lineMatches(content, /\.forEach\s*\(\s*async\b/);
  if (forEachAsync.length) pushFinding(findings, {
    ruleId: "TS-ASY-001", category: "async_io", severity: "warning",
    title: "async callback in forEach",
    description: ".forEach does not await async callbacks — they run unsequenced and their errors are lost.",
    impact: "Race conditions and unhandled promise rejections.",
    fix: `for (const item of items) { await handle(item); }\n// or: await Promise.all(items.map(handle));`,
    line: forEachAsync[0],
  }, disabledRuleIds);

  if (/for\s*\([^)]*\)\s*\{[\s\S]{0,160}?\bawait\b/.test(content)) pushFinding(findings, {
    ruleId: "TS-PER-001", category: "performance", severity: "info",
    title: "Sequential await in loop",
    description: "Awaiting inside a loop runs requests one after another (a waterfall).",
    impact: "Total latency is the sum of all calls, not the slowest.",
    fix: `const results = await Promise.all(items.map((i) => fetchItem(i)));`,
    line: tFirst(/for\s*\(/),
  }, disabledRuleIds);

  const evalLines = lineMatches(content, /\beval\s*\(|new Function\s*\(/);
  if (evalLines.length) pushFinding(findings, {
    ruleId: "TS-SEC-002", category: "security", severity: "warning",
    title: "Dynamic code execution (eval)",
    description: "eval / new Function execute arbitrary strings as code.",
    impact: "Code-injection vulnerability.",
    fix: "Remove eval; parse data or use a safe lookup table.",
    line: evalLines[0], reference: "OWASP Injection",
  }, disabledRuleIds);

  const xssLines = lineMatches(content, /innerHTML\s*=|dangerouslySetInnerHTML/);
  if (xssLines.length) pushFinding(findings, {
    ruleId: "TS-SEC-003", category: "security", severity: "warning",
    title: "Unsanitised HTML injection",
    description: "Assigning innerHTML / dangerouslySetInnerHTML with dynamic data risks XSS.",
    impact: "Attacker-controlled markup executes in the browser.",
    fix: "Set textContent, or sanitise with DOMPurify before injecting HTML.",
    line: xssLines[0], reference: "OWASP XSS",
  }, disabledRuleIds);

  const throwStr = lineMatches(content, /throw\s+['"`]/);
  if (throwStr.length) pushFinding(findings, {
    ruleId: "TS-ERR-002", category: "error_handling", severity: "warning",
    title: "Throwing a non-Error value",
    description: "Throwing a string loses the stack trace and breaks instanceof checks.",
    impact: "Harder debugging and inconsistent error handling.",
    fix: `throw new AppError('CODE', 'message');`,
    line: throwStr[0],
  }, disabledRuleIds);

  const doubleCast = lineMatches(content, /as\s+unknown\s+as\b/);
  if (doubleCast.length) pushFinding(findings, {
    ruleId: "TS-TYP-004", category: "type_safety", severity: "info",
    title: "Double type assertion (as unknown as)",
    description: "Forcing a value through unknown bypasses the type system entirely.",
    impact: "Runtime shape can silently mismatch the asserted type.",
    fix: "Validate/narrow the value instead of asserting it.",
    line: doubleCast[0],
  }, disabledRuleIds);

  const weakTypes = lineMatches(content, /:\s*(Function|Object)\b/);
  if (weakTypes.length) pushFinding(findings, {
    ruleId: "TS-TYP-005", category: "type_safety", severity: "info",
    title: "Weak type (Function / Object)",
    description: "Function and Object are almost as loose as any.",
    impact: "Little compile-time protection.",
    fix: "Use a concrete signature, e.g. (id: string) => Promise<User>, or Record<string, unknown>.",
    line: weakTypes[0],
  }, disabledRuleIds);

  const onlyTest = lineMatches(content, /\b(it|test|describe)\.only\s*\(/);
  if (onlyTest.length) pushFinding(findings, {
    ruleId: "TS-TST-001", category: "testing", severity: "warning",
    title: "Focused test (.only)",
    description: "it.only / describe.only skips every other test in the run.",
    impact: "CI silently runs one test and still reports green.",
    fix: "Remove .only before committing.",
    line: onlyTest[0],
  }, disabledRuleIds);

  const varLines = lineMatches(content, /\bvar\s+\w/);
  if (varLines.length) pushFinding(findings, {
    ruleId: "TS-STD-002", category: "standards", severity: "info",
    title: "Legacy var declaration",
    description: "var is function-scoped and hoisted; const/let are block-scoped.",
    impact: "Subtle scoping and reassignment bugs.",
    fix: "Use const by default, let only when reassigned.",
    line: varLines[0],
  }, disabledRuleIds);

  const jsonParse = lineMatches(content, /JSON\.parse\s*\(/);
  if (jsonParse.length && !/try\s*\{/.test(content)) pushFinding(findings, {
    ruleId: "TS-VAL-002", category: "validation", severity: "info",
    title: "JSON.parse without guard",
    description: "JSON.parse throws on malformed input and returns an untyped any.",
    impact: "Crashes on bad data; unvalidated shape flows onward.",
    fix: "Wrap in try/catch and validate the result with a schema (schema.parse()).",
    line: jsonParse[0],
  }, disabledRuleIds);

  const tsTodo = lineMatches(content, /\/\/\s*(TODO|FIXME)/i);
  if (tsTodo.length) pushFinding(findings, {
    ruleId: "TS-STD-003", category: "standards", severity: "info",
    title: "Unresolved TODO/FIXME",
    description: "Leftover TODO/FIXME markers indicate unfinished work.",
    impact: "Incomplete logic can ship unnoticed.",
    fix: "Resolve the item or link it to a tracked issue.",
    line: tsTodo[0],
  }, disabledRuleIds);

  const crit = findings.filter((f) => f.severity === "critical").length;
  const summary =
    crit > 0
      ? `TypeScript scan of ${filename}: ${findings.length} finding(s), ${crit} critical.`
      : `TypeScript scan of ${filename}: ${findings.length} finding(s) from standard TS/API rules.`;

  return buildAuditResult({
    filename,
    categoryIds: CATEGORY_IDS,
    findings,
    metrics: {
      anyCount: anyLines.length,
      tsIgnoreCount: tsIgnore.length,
      consoleLogs: consoleLog.length,
      hardcodedSecrets: secrets.length,
    },
    summary,
    positives:
      anyLines.length === 0
        ? [{ title: "No explicit any", description: "Types are used for safer refactors." }]
        : undefined,
  });
}
