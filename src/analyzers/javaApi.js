import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.java_api.categories.map((c) => c.id);

export function analyseJavaApiLocally(filename, content, options = {}) {
  const disabledRuleIds = options.disabledRuleIds ?? new Set();
  const findings = [];

  const sqlConcat = lineMatches(content, /\+\s*["']|["']\s*\+.*SELECT|executeQuery\s*\(\s*["'][^"']*\+/i);
  if (sqlConcat.length || /Statement\s+\w+\s*=|createStatement\s*\(/.test(content)) {
    const stmt = lineMatches(content, /createStatement\s*\(/);
    if (stmt.length || sqlConcat.length) {
      pushFinding(findings, {
        ruleId: "JV-SEC-001",
        category: "security",
        severity: "critical",
        title: "SQL injection risk — dynamic SQL or Statement",
        description: "Use PreparedStatement with bound parameters; avoid string-concatenated SQL and createStatement().",
        impact: "Attackers can read or modify data via crafted input.",
        fix: `// avoid\nstmt.executeQuery("SELECT * FROM users WHERE id = " + userId);\n\n// prefer\nPreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");\nps.setLong(1, userId);`,
        line: stmt[0] ?? sqlConcat[0],
        reference: "OWASP SQL Injection",
      }, disabledRuleIds);
    }
  }

  const secrets = lineMatches(
    content,
    /(?:password|apiKey|secret|privateKey)\s*=\s*["'][^"']{4,}["']/i,
  ).filter((ln) => !/process\.env|getenv|@Value\s*\("\$\{/.test(content.split(/\r?\n/)[ln - 1]));
  if (secrets.length) {
    pushFinding(findings, {
      ruleId: "JV-SEC-002",
      category: "security",
      severity: "critical",
      title: "Hardcoded credential or secret",
      description: "Secrets must come from environment or a secret manager.",
      impact: "Credentials leak through source control and logs.",
      fix: `@Value("${'{'}db.password{'}'}")\nprivate String dbPassword;`,
      line: secrets[0],
    }, disabledRuleIds);
  }

  const emptyCatch = lineMatches(content, /catch\s*\([^)]*\)\s*\{\s*\}/);
  if (emptyCatch.length) {
    pushFinding(findings, {
      ruleId: "JV-ERR-001",
      category: "error_handling",
      severity: "warning",
      title: "Empty catch block",
      description: "Exceptions are swallowed without logging or rethrow.",
      impact: "Production failures become impossible to diagnose.",
      fix: `catch (DataAccessException ex) {\n  log.error("Failed to load user", ex);\n  throw new ServiceException("USER_LOAD_FAILED", ex);\n}`,
      line: emptyCatch[0],
    }, disabledRuleIds);
  }

  if (/System\.out\.print|System\.err\.print/.test(content) && !/\/\/.*System\.out/.test(content)) {
    const ln = lineMatches(content, /System\.(out|err)\.print/)[0];
    pushFinding(findings, {
      ruleId: "JV-OBS-001",
      category: "observability",
      severity: "warning",
      title: "System.out/err instead of logger",
      description: "Use SLF4J or structured logging for production services.",
      impact: "Logs are not levelled, correlated, or collected by observability stacks.",
      fix: `private static final Logger log = LoggerFactory.getLogger(MyService.class);\nlog.info("Created order {}", orderId);`,
      line: ln,
    }, disabledRuleIds);
  }

  const hasRest = /@RestController|@Controller/.test(content);
  const returnsEntity = /ResponseEntity|@ResponseStatus/.test(content);
  if (hasRest && /public\s+\w+\s+\w+\s*\([^)]*\)\s*\{/.test(content) && !returnsEntity) {
    pushFinding(findings, {
      ruleId: "JV-API-001",
      category: "api_design",
      severity: "info",
      title: "Consider explicit HTTP responses",
      description: "REST endpoints benefit from ResponseEntity for status codes and headers.",
      impact: "Ambiguous status codes and harder API evolution.",
      fix: `return ResponseEntity.status(HttpStatus.CREATED).body(dto);`,
      line: lineMatches(content, /@(Get|Post|Put|Delete|Patch)Mapping/)[0],
      reference: "Spring ResponseEntity",
    }, disabledRuleIds);
  }

  if (/\.get\(\)\s*;|return\s+null\s*;/.test(content) && hasRest) {
    pushFinding(findings, {
      ruleId: "JV-API-002",
      category: "api_design",
      severity: "warning",
      title: "Nullable returns on API layer",
      description: "Prefer Optional, exceptions, or 404 ResponseEntity instead of null.",
      impact: "Clients receive 200 with empty body or NPEs in adapters.",
      fix: `return userRepository.findById(id)\n  .map(ResponseEntity::ok)\n  .orElseGet(() -> ResponseEntity.notFound().build());`,
      line: lineMatches(content, /return\s+null/)[0],
    }, disabledRuleIds);
  }

  if (/@Transactional/.test(content) && /private\s+void/.test(content) && !/public|protected/.test(content.match(/@Transactional[\s\S]{0,80}/)?.[0] ?? "")) {
    /* light heuristic skipped - too noisy */
  }

  if (/new\s+Thread\s*\(|\.start\s*\(\)/.test(content)) {
    pushFinding(findings, {
      ruleId: "JV-CON-001",
      category: "concurrency",
      severity: "warning",
      title: "Manual thread creation",
      description: "Use ExecutorService or framework-managed async (@Async, virtual threads).",
      impact: "Unbounded threads and poor lifecycle management under load.",
      fix: `executor.submit(() -> processJob(payload));`,
      line: lineMatches(content, /new\s+Thread/)[0] ?? lineMatches(content, /\.start\s*\(/)[0],
    }, disabledRuleIds);
  }

  if (/EntityManager|JpaRepository/.test(content) && /for\s*\([^)]*:\s*[^)]+\)\s*\{[\s\S]{0,200}?find(One|ById|By)/.test(content)) {
    pushFinding(findings, {
      ruleId: "JV-PER-001",
      category: "performance",
      severity: "warning",
      title: "Possible N+1 query pattern",
      description: "Loading entities inside a loop often causes N+1 database round-trips.",
      impact: "Latency spikes as data grows.",
      fix: `// fetch join or @EntityGraph\n@Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.id = :id")`,
      line: null,
    }, disabledRuleIds);
  }

  if (!/@Test|@ParameterizedTest/.test(content) && /class\s+\w+Service|class\s+\w+Controller/.test(content)) {
    pushFinding(findings, {
      ruleId: "JV-TST-001",
      category: "testing",
      severity: "info",
      title: "No test annotations in file",
      description: "Service/controller files should have corresponding tests elsewhere in the project.",
      impact: "Regressions ship without detection.",
      fix: `@ExtendWith(MockitoExtension.class)\nclass OrderServiceTest { ... }`,
      line: null,
    }, disabledRuleIds);
  }

  if (/public\s+class\s+\w+\s*\{[\s\S]{2500,}/.test(content)) {
    pushFinding(findings, {
      ruleId: "JV-MNT-001",
      category: "maintainability",
      severity: "info",
      title: "Large class — consider splitting",
      description: "Classes over ~250 lines often mix responsibilities.",
      impact: "Harder reviews, merges, and unit testing.",
      fix: "Extract validation, mapping, and persistence into dedicated classes.",
      line: 1,
    }, disabledRuleIds);
  }

  // ── Advanced / SME-level Java checks ─────────────────────────
  const jFirst = (re) => lineMatches(content, re)[0] ?? null;

  const pst = lineMatches(content, /printStackTrace\s*\(/);
  if (pst.length) pushFinding(findings, {
    ruleId: "JV-ERR-002", category: "error_handling", severity: "warning",
    title: "printStackTrace() instead of logging",
    description: "e.printStackTrace() writes to stderr and bypasses your logging pipeline.",
    impact: "Errors are invisible to log aggregation and alerting.",
    fix: `log.error("Failed to process order {}", orderId, e); // SLF4J`,
    line: pst[0],
  }, disabledRuleIds);

  const broadCatch = lineMatches(content, /catch\s*\(\s*(Exception|Throwable)\b/);
  if (broadCatch.length) pushFinding(findings, {
    ruleId: "JV-ERR-003", category: "error_handling", severity: "info",
    title: "Overly broad exception catch",
    description: "catch (Exception) / catch (Throwable) also swallows bugs you didn't mean to handle.",
    impact: "Unexpected failures are hidden alongside expected ones.",
    fix: "Catch the specific checked/unchecked types you can actually recover from.",
    line: broadCatch[0],
  }, disabledRuleIds);

  const weakCrypto = lineMatches(content, /getInstance\s*\(\s*"(MD5|SHA-1|SHA1)"|"DES"|"RC4"/i);
  if (weakCrypto.length) pushFinding(findings, {
    ruleId: "JV-SEC-003", category: "security", severity: "warning",
    title: "Weak cryptographic algorithm",
    description: "MD5, SHA-1, DES, and RC4 are broken for security use.",
    impact: "Hashes can be collided and ciphers reversed.",
    fix: "Use SHA-256+ for hashing and AES-GCM for encryption.",
    line: weakCrypto[0], reference: "OWASP Cryptographic Storage",
  }, disabledRuleIds);

  const openCors = lineMatches(content, /@CrossOrigin\s*\(\s*origins\s*=\s*"\*"|allowedOrigins\s*\(\s*"\*"/);
  if (openCors.length) pushFinding(findings, {
    ruleId: "JV-SEC-004", category: "security", severity: "warning",
    title: "Permissive CORS (*)",
    description: "Allowing all origins lets any website call the API with the user's credentials.",
    impact: "Cross-origin data theft and CSRF-style abuse.",
    fix: "Whitelist explicit trusted origins.",
    line: openCors[0], reference: "OWASP CORS",
  }, disabledRuleIds);

  const selectStar = lineMatches(content, /SELECT\s+\*/i);
  if (selectStar.length) pushFinding(findings, {
    ruleId: "JV-DAT-001", category: "data_access", severity: "info",
    title: "SELECT * query",
    description: "Selecting all columns fetches more than needed and breaks when the schema changes.",
    impact: "Extra I/O and fragile result mapping.",
    fix: "Select only the columns you use.",
    line: selectStar[0],
  }, disabledRuleIds);

  if (/@RequestBody/.test(content) && !/@Valid|@Validated/.test(content)) pushFinding(findings, {
    ruleId: "JV-API-003", category: "api_design", severity: "warning",
    title: "@RequestBody without @Valid",
    description: "Request payloads are bound without bean validation.",
    impact: "Invalid or malicious input reaches business logic.",
    fix: "public ResponseEntity<?> create(@Valid @RequestBody CreateDto dto) { ... }",
    line: jFirst(/@RequestBody/), reference: "Jakarta Bean Validation",
  }, disabledRuleIds);

  const threadSleep = lineMatches(content, /Thread\.sleep\s*\(/);
  if (threadSleep.length) pushFinding(findings, {
    ruleId: "JV-CON-002", category: "concurrency", severity: "warning",
    title: "Thread.sleep() blocks the thread",
    description: "Blocking sleeps tie up request or worker threads.",
    impact: "Reduced throughput and thread-pool starvation under load.",
    fix: "Use scheduled tasks / async callbacks; in tests use Awaitility.",
    line: threadSleep[0],
  }, disabledRuleIds);

  const fieldInjection = lineMatches(content, /@Autowired/);
  if (fieldInjection.length) pushFinding(findings, {
    ruleId: "JV-STD-001", category: "java_standards", severity: "info",
    title: "Field injection (@Autowired)",
    description: "Field injection hides dependencies and makes the class hard to unit test.",
    impact: "Cannot construct the class in a test without a container.",
    fix: "Use constructor injection with final fields.",
    line: fieldInjection[0],
  }, disabledRuleIds);

  const sysExit = lineMatches(content, /System\.exit\s*\(/);
  if (sysExit.length) pushFinding(findings, {
    ruleId: "JV-STD-002", category: "java_standards", severity: "warning",
    title: "System.exit() in application code",
    description: "System.exit terminates the JVM abruptly.",
    impact: "Kills the whole server/container and skips graceful shutdown.",
    fix: "Throw an exception and let the framework manage shutdown.",
    line: sysExit[0],
  }, disabledRuleIds);

  const disabledTest = lineMatches(content, /@Disabled\b|@Ignore\b/);
  if (disabledTest.length) pushFinding(findings, {
    ruleId: "JV-TST-002", category: "testing", severity: "info",
    title: "Disabled test committed",
    description: "@Disabled / @Ignore silently removes coverage.",
    impact: "A disabled test looks green but verifies nothing.",
    fix: "Fix and re-enable, or link the skip to a tracked issue.",
    line: disabledTest[0],
  }, disabledRuleIds);

  const jTodo = lineMatches(content, /\/\/\s*(TODO|FIXME)|\/\*\s*(TODO|FIXME)/i);
  if (jTodo.length) pushFinding(findings, {
    ruleId: "JV-MNT-002", category: "maintainability", severity: "info",
    title: "Unresolved TODO/FIXME",
    description: "Leftover TODO/FIXME markers indicate unfinished work.",
    impact: "Incomplete logic can ship unnoticed.",
    fix: "Resolve the item or link it to a tracked issue.",
    line: jTodo[0],
  }, disabledRuleIds);

  const crit = findings.filter((f) => f.severity === "critical").length;
  const summary =
    crit > 0
      ? `Java API scan of ${filename}: ${findings.length} finding(s), ${crit} critical (security/data).`
      : `Java API scan of ${filename}: ${findings.length} finding(s) from standard JVM/API rules.`;

  return buildAuditResult({
    filename,
    categoryIds: CATEGORY_IDS,
    findings,
    metrics: {
      sqlConcatLines: sqlConcat.length,
      emptyCatchBlocks: emptyCatch.length,
      systemOutCalls: countMatches(content, /System\.(out|err)\.print/g),
      hardcodedSecrets: secrets.length,
      restController: hasRest,
    },
    summary,
    positives: secrets.length === 0 ? [{ title: "No obvious hardcoded secrets", description: "Continue using externalized configuration." }] : undefined,
  });
}
