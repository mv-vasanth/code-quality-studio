import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, pushFinding } from "./analyzerUtils.js";

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

  const asyncSleep = /async\s+def/.test(content) ? lineMatches(content, /time\.sleep\s*\(/) : [];
  if (asyncSleep.length) add({ ruleId: "PY-ASY-001", category: "async_io", severity: "warning",
    title: "Blocking sleep in async code", description: "time.sleep blocks the event loop in async functions.", impact: "Stalls all concurrent requests.",
    fix: `await asyncio.sleep(1)`, line: asyncSleep[0] });

  const todo = lineMatches(content, /#\s*(TODO|FIXME)/i);
  if (todo.length) add({ ruleId: "PY-STD-003", category: "standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.", impact: "Unfinished logic ships.",
    fix: "Resolve or link to an issue.", line: todo[0] });

  const pickleLoad = lineMatches(content, /\b(?:pickle|cPickle|_pickle|marshal|dill)\.loads?\s*\(/);
  if (pickleLoad.length) add({ ruleId: "PY-SEC-005", category: "security", severity: "critical",
    title: "Deserialising untrusted data with pickle", description: `pickle/marshal deserialisation at line ${pickleLoad[0]} executes arbitrary objects while unpickling.`, impact: "A crafted payload gives remote code execution.",
    fix: `data = json.loads(raw)  # use a data-only format for untrusted input`, line: pickleLoad[0], reference: "https://docs.python.org/3/library/pickle.html#restricting-globals" });

  const unsafeYaml = lineMatches(content, /yaml\.load\s*\((?![^)]*(?:SafeLoader|CSafeLoader))/);
  if (unsafeYaml.length) add({ ruleId: "PY-SEC-006", category: "security", severity: "critical",
    title: "yaml.load without a safe loader", description: `yaml.load at line ${unsafeYaml[0]} uses the full loader, which can construct arbitrary Python objects.`, impact: "YAML input becomes code execution.",
    fix: `config = yaml.safe_load(raw)`, line: unsafeYaml[0], reference: "https://pyyaml.org/wiki/PyYAMLDocumentation" });

  const noVerify = lineMatches(content, /verify\s*=\s*False/);
  if (noVerify.length) add({ ruleId: "PY-SEC-007", category: "security", severity: "critical",
    title: "TLS certificate verification disabled", description: `verify=False at line ${noVerify[0]} turns off certificate validation.`, impact: "Traffic can be intercepted by a man-in-the-middle.",
    fix: `requests.get(url, timeout=5, verify=True)  # or verify="/path/to/ca-bundle.pem"`, line: noVerify[0], reference: "https://requests.readthedocs.io/en/latest/user/advanced/#ssl-cert-verification" });

  const debugTrue = lineMatches(content, /^\s*DEBUG\s*=\s*True\b|\bdebug\s*=\s*True\b/);
  if (debugTrue.length) add({ ruleId: "PY-SEC-008", category: "security", severity: "critical",
    title: "Debug mode enabled", description: `Debug mode is switched on at line ${debugTrue[0]}.`, impact: "Stack traces, settings and an interactive console leak to users in production.",
    fix: `DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"`, line: debugTrue[0], reference: "https://docs.djangoproject.com/en/stable/ref/settings/#debug" });

  const wildcardHosts = lineMatches(content, /ALLOWED_HOSTS\s*=\s*\[\s*["']\*["']/);
  if (wildcardHosts.length) add({ ruleId: "PY-SEC-009", category: "security", severity: "warning",
    title: "ALLOWED_HOSTS accepts any host", description: `ALLOWED_HOSTS is ['*'] at line ${wildcardHosts[0]}.`, impact: "Host-header poisoning enables cache poisoning and password-reset link hijacking.",
    fix: `ALLOWED_HOSTS = ["api.example.com", "www.example.com"]`, line: wildcardHosts[0], reference: "https://docs.djangoproject.com/en/stable/ref/settings/#allowed-hosts" });

  const runtimeAssert = lineMatches(content, /^\s*assert\s+/);
  if (runtimeAssert.length) add({ ruleId: "PY-SEC-010", category: "security", severity: "warning",
    title: "assert used for runtime validation", description: `assert statement at line ${runtimeAssert[0]} is used outside of tests.`, impact: "Python run with -O strips asserts, so the check silently disappears in production.",
    fix: `if not user.is_admin:\n    raise PermissionError("admin required")`, line: runtimeAssert[0], reference: "https://docs.python.org/3/reference/simple_stmts.html#the-assert-statement" });

  const openCors = lineMatches(content, /allow_origins\s*=\s*\[\s*["']\*["']|CORS_ALLOW_ALL_ORIGINS\s*=\s*True|CORS_ORIGIN_ALLOW_ALL\s*=\s*True|["']Access-Control-Allow-Origin["']\s*[:,]\s*["']\*["']/);
  if (openCors.length) add({ ruleId: "PY-SEC-011", category: "security", severity: "warning",
    title: "CORS open to every origin", description: `Wildcard CORS origin configured at line ${openCors[0]}.`, impact: "Any site can call the API with the user's credentials.",
    fix: `app.add_middleware(CORSMiddleware, allow_origins=["https://app.example.com"], allow_credentials=True)`, line: openCors[0], reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS" });

  const rawQuery = lineMatches(content, /\.objects\.raw\s*\(|\.extra\s*\(\s*(?:select|where|tables|params)\s*=/);
  if (rawQuery.length) add({ ruleId: "PY-DAT-002", category: "data_access", severity: "warning",
    title: "Django .raw() / .extra() escape hatch", description: `Raw ORM escape hatch used at line ${rawQuery[0]}.`, impact: "Bypasses the ORM's parameterisation and query planning; .extra() is deprecated.",
    fix: `Order.objects.filter(status="open").values("id", "total")`, line: rawQuery[0], reference: "https://docs.djangoproject.com/en/stable/ref/models/querysets/#extra" });

  const nPlusOne = lineMatches(content, /for\s+\w+\s+in\s+\w+\.objects\.(?:all|filter|exclude)\s*\(/)
    .filter(() => !/select_related|prefetch_related|\.only\(|\.values\(/.test(content));
  if (nPlusOne.length) add({ ruleId: "PY-DAT-003", category: "data_access", severity: "warning",
    title: "Probable N+1 query", description: `Line ${nPlusOne[0]} iterates a queryset with no select_related/prefetch_related anywhere in the file.`, impact: "One extra query per row; latency grows linearly with data size.",
    fix: `for order in Order.objects.select_related("customer").prefetch_related("items"):\n    ...`, line: nPlusOne[0], reference: "https://docs.djangoproject.com/en/stable/ref/models/querysets/#select-related" });

  const unbounded = lineMatches(content, /\.objects\.all\s*\(\s*\)|\.query\.all\s*\(\s*\)|session\.query\([^)]*\)\.all\s*\(\s*\)/)
    .filter(() => !/paginate|Paginator|LimitOffset|PageNumber|\.limit\(|\[\s*offset|\[\s*skip/i.test(content));
  if (unbounded.length) add({ ruleId: "PY-PER-002", category: "performance", severity: "warning",
    title: "Unbounded list query without pagination", description: `Line ${unbounded[0]} fetches an entire table and the file has no pagination.`, impact: "Memory and response size grow without limit as the table grows.",
    fix: `orders = Order.objects.all()[offset : offset + limit]  # or use a Paginator`, line: unbounded[0], reference: "https://docs.djangoproject.com/en/stable/topics/pagination/" });

  const blockingHttp = /async\s+def/.test(content)
    ? lineMatches(content, /\brequests\.(?:get|post|put|delete|patch|head)\s*\(|\burllib\.request\.urlopen\s*\(/)
    : [];
  if (blockingHttp.length) add({ ruleId: "PY-ASY-002", category: "async_io", severity: "warning",
    title: "Blocking HTTP call in async module", description: `Synchronous requests/urllib call at line ${blockingHttp[0]} in a module that defines async handlers.`, impact: "Blocks the event loop, serialising every concurrent request.",
    fix: `async with httpx.AsyncClient(timeout=5) as client:\n    resp = await client.get(url)`, line: blockingHttp[0], reference: "https://fastapi.tiangolo.com/async/" });

  const genericRaise = lineMatches(content, /raise\s+(?:Exception|BaseException)\s*\(/);
  if (genericRaise.length) add({ ruleId: "PY-ERR-002", category: "error_handling", severity: "warning",
    title: "Generic Exception raised", description: `raise Exception(...) at line ${genericRaise[0]}.`, impact: "Callers cannot catch the specific failure without catching everything.",
    fix: `class OrderNotFound(LookupError): ...\nraise OrderNotFound(order_id)`, line: genericRaise[0], reference: "https://peps.python.org/pep-0008/#programming-recommendations" });

  const leakDetail = lineMatches(content, /(?:return|detail\s*=|content\s*=|jsonify\s*\()[^\n]*\bstr\s*\(\s*(?:e|ex|exc|err|error)\s*\)/);
  if (leakDetail.length) add({ ruleId: "PY-ERR-003", category: "error_handling", severity: "warning",
    title: "Internal exception text returned to the client", description: `Line ${leakDetail[0]} puts str(exception) into the HTTP response.`, impact: "Leaks table names, file paths and library internals to attackers.",
    fix: `logger.exception("order create failed")\nraise HTTPException(status_code=500, detail="Internal server error")`, line: leakDetail[0], reference: "https://owasp.org/www-community/Improper_Error_Handling" });

  const uncheckedCast = lineMatches(content, /\b(?:int|float)\s*\(\s*request\.(?:args|form|json|data|GET|POST|query_params)/);
  if (uncheckedCast.length) add({ ruleId: "PY-VAL-002", category: "validation", severity: "warning",
    title: "Unchecked numeric cast of request input", description: `Line ${uncheckedCast[0]} casts request data to a number with no guard.`, impact: "Non-numeric input raises ValueError and returns a 500 instead of a 400.",
    fix: `page = request.args.get("page", type=int, default=1)\nif page is None or page < 1:\n    abort(400, "page must be a positive integer")`, line: uncheckedCast[0], reference: "https://docs.pydantic.dev/latest/concepts/validators/" });

  const verbInPath = lineMatches(content, /@\w+\.(?:route|get|post|put|delete|patch)\s*\(\s*["'][^"']*\/(?:get|create|update|delete|fetch|add|remove)[A-Z_]/);
  if (verbInPath.length) add({ ruleId: "PY-API-001", category: "api_design", severity: "info",
    title: "Verb in REST route path", description: `Route at line ${verbInPath[0]} encodes an action in the URL instead of using the HTTP method.`, impact: "Non-RESTful surface; caching and client tooling assumptions break.",
    fix: `@app.post("/orders")       # instead of /createOrder\n@app.delete("/orders/{id}") # instead of /deleteOrder`, line: verbInPath[0], reference: "https://restfulapi.net/resource-naming/" });

  const looseCompare = lineMatches(content, /(?:==|!=)\s*(?:None|True|False)\b|\btype\s*\([^)]*\)\s*==/);
  if (looseCompare.length) add({ ruleId: "PY-STD-004", category: "standards", severity: "info",
    title: "Identity/type comparison written with ==", description: `Line ${looseCompare[0]} compares against None/True/False or uses type(x) ==.`, impact: "Works only by accident with overloaded __eq__ and subclasses.",
    fix: `if value is None: ...\nif isinstance(value, str): ...`, line: looseCompare[0], reference: "https://peps.python.org/pep-0008/#programming-recommendations" });

  const starImport = lineMatches(content, /^\s*from\s+[\w.]+\s+import\s+\*/);
  if (starImport.length) add({ ruleId: "PY-STD-005", category: "standards", severity: "info",
    title: "Wildcard import", description: `Line ${starImport[0]} imports with *.`, impact: "Namespace pollution; shadowed names and unresolvable symbols for tooling.",
    fix: `from myapp.models import Order, Customer`, line: starImport[0], reference: "https://peps.python.org/pep-0008/#imports" });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { sqlInjectionRisks: sqli.length, hardcodedSecrets: secrets.length, bareExcepts: bareExcept.length, printCalls: prints.length },
    summary: `Python API scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
