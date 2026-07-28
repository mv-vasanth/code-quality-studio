import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.python_api.categories.map((c) => c.id);

/** Python backend/API rules (FastAPI / Flask / Django). Heuristic, regex-based. */
export function analysePythonApiLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
  const add = (r) => pushFinding(findings, r, disabled);

  const sqli = lineMatches(content, /(execute|executemany)\s*\(\s*f["']|(execute|executemany)\s*\([^)]*%[^)]*\)|(execute|executemany)\s*\([^)]*\+/);
  if (sqli.length) add({ ruleId: "PY-SEC-001", category: "security", severity: "critical",
    title: "SQL injection risk", description: "String-built SQL (f-string / % / +) in a cursor execute.", impact: "Attacker can read or modify data.",
    fix: `cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))`, line: sqli[0], reference: "OWASP SQL Injection" });

  const secrets = lineMatches(content, /(?:password|api_key|secret|token)\s*=\s*["'][^"']{4,}["']/i)
    .filter((ln) => !/os\.environ|getenv/.test(lines[ln - 1] || ""));
  if (secrets.length) add({ ruleId: "PY-SEC-002", category: "security", severity: "critical",
    title: "Hardcoded secret", description: "Literal password/token/api_key in source.", impact: "Leak via git and logs.",
    fix: `API_KEY = os.environ["API_KEY"]`, line: secrets[0] });

  const shell = lineMatches(content, /subprocess\.[a-z_]+\([^)]*shell\s*=\s*True/);
  if (shell.length) add({ ruleId: "PY-SEC-003", category: "security", severity: "warning",
    title: "subprocess with shell=True", description: "shell=True enables command injection from interpolated input.", impact: "Remote code execution risk.",
    fix: `subprocess.run(["ls", "-l", path])  # list args, no shell`, line: shell[0] });

  const evil = lineMatches(content, /\beval\s*\(|\bexec\s*\(/);
  if (evil.length) add({ ruleId: "PY-SEC-004", category: "security", severity: "warning",
    title: "Dynamic code execution (eval/exec)", description: "eval/exec run arbitrary strings.", impact: "Code-injection vulnerability.",
    fix: "Parse data or use a safe lookup instead.", line: evil[0] });

  const bareExcept = lineMatches(content, /except\s*:|except\s+Exception\s*:\s*(pass|\.\.\.)/);
  if (bareExcept.length) add({ ruleId: "PY-ERR-001", category: "error_handling", severity: "warning",
    title: "Bare / swallowed except", description: "except: or except Exception: pass hides failures.", impact: "Errors disappear silently.",
    fix: `except ValueError as e:\n    logger.exception("parse failed")\n    raise`, line: bareExcept[0] });

  if (/request\.(json|get_json|form|data)|await\s+request\.json/.test(content) && !/pydantic|BaseModel|marshmallow|schema\.load|serializers\./.test(content))
    add({ ruleId: "PY-VAL-001", category: "validation", severity: "warning",
      title: "Request body without validation", description: "Reading request data without a pydantic/marshmallow schema.", impact: "Invalid data reaches business logic.",
      fix: `class CreateOrder(BaseModel): product_id: str; qty: int\norder = CreateOrder(**await request.json())`, line: lineMatches(content, /request\.(json|get_json|form|data)/)[0] });

  const prints = lineMatches(content, /(^|\s)print\s*\(/);
  if (prints.length > 1) add({ ruleId: "PY-STD-001", category: "standards", severity: "info",
    title: "print() instead of logging", description: "print bypasses levels and structured logging.", impact: "No log levels or aggregation.",
    fix: `logger.info("order placed", extra={"order_id": order_id})`, line: prints[0] });

  const mutableDefault = lineMatches(content, /def\s+\w+\s*\([^)]*=\s*(\[\]|\{\})/);
  if (mutableDefault.length) add({ ruleId: "PY-STD-002", category: "standards", severity: "warning",
    title: "Mutable default argument", description: "def f(x=[]) shares one list across all calls.", impact: "State leaks between invocations.",
    fix: `def f(x=None):\n    x = x if x is not None else []`, line: mutableDefault[0] });

  const noTimeout = lineMatches(content, /requests\.(get|post|put|delete|patch)\s*\(/).filter((ln) => !/timeout\s*=/.test(content.split(/\r?\n/)[ln - 1] || ""));
  if (noTimeout.length) add({ ruleId: "PY-PER-001", category: "performance", severity: "info",
    title: "HTTP request without timeout", description: "requests.* with no timeout can hang forever.", impact: "Thread/worker starvation.",
    fix: `requests.get(url, timeout=5)`, line: noTimeout[0] });

  const selectStar = lineMatches(content, /SELECT\s+\*/i);
  if (selectStar.length) add({ ruleId: "PY-DAT-001", category: "data_access", severity: "info",
    title: "SELECT * query", description: "Fetches more than needed; breaks on schema change.", impact: "Extra I/O; fragile.",
    fix: "Select only the columns you use.", line: selectStar[0] });

  const asyncSleep = lineMatches(content, /time\.sleep\s*\(/).filter((ln) => /async\s+def/.test(content));
  if (asyncSleep.length) add({ ruleId: "PY-ASY-001", category: "async_io", severity: "warning",
    title: "Blocking sleep in async code", description: "time.sleep blocks the event loop in async functions.", impact: "Stalls all concurrent requests.",
    fix: `await asyncio.sleep(1)`, line: asyncSleep[0] });

  const todo = lineMatches(content, /#\s*(TODO|FIXME)/i);
  if (todo.length) add({ ruleId: "PY-STD-003", category: "standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.", impact: "Unfinished logic ships.",
    fix: "Resolve or link to an issue.", line: todo[0] });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { sqlInjectionRisks: sqli.length, hardcodedSecrets: secrets.length, bareExcepts: bareExcept.length, printCalls: prints.length },
    summary: `Python API scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
