import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.java_api.categories.map((c) => c.id);

export function analyseJavaApiLocally(filename, content, options = {}) {
  const disabledRuleIds = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);

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

  // ── Security ──────────────────────────────────────────────────────────────

  const pathTraversal = lineMatches(content, /new\s+File\s*\(\s*(?!["'])[\w.]*(?:request|param|input|userPath|fileName|filename)|Paths\.get\s*\(\s*(?!["'])[\w.]*(?:request|param|input|fileName|filename)/i);
  if (pathTraversal.length) pushFinding(findings, {
    ruleId: "JV-SEC-005", category: "security", severity: "critical",
    title: "Path traversal risk — user input in a file path",
    description: "A file path is built from a request/user-supplied value without normalisation, so \"../\" segments can escape the intended directory.",
    impact: "An attacker can read or overwrite arbitrary files on the server (CWE-22).",
    fix: `Path base = Paths.get("/srv/uploads").toAbsolutePath().normalize();\nPath target = base.resolve(fileName).normalize();\nif (!target.startsWith(base)) throw new SecurityException("Invalid path");`,
    line: pathTraversal[0], reference: "https://cwe.mitre.org/data/definitions/22.html",
  }, disabledRuleIds);

  const deser = lineMatches(content, /new\s+ObjectInputStream\s*\(|\.readObject\s*\(\s*\)/);
  if (deser.length) pushFinding(findings, {
    ruleId: "JV-SEC-006", category: "security", severity: "critical",
    title: "Unsafe Java deserialization",
    description: "ObjectInputStream.readObject() reconstructs arbitrary classes from the byte stream.",
    impact: "If the stream is attacker-controlled this is remote code execution via gadget chains (CWE-502).",
    fix: `// Prefer a data format that does not instantiate arbitrary types\nObjectMapper mapper = new ObjectMapper();\nMyDto dto = mapper.readValue(json, MyDto.class);`,
    line: deser[0], reference: "https://cwe.mitre.org/data/definitions/502.html",
  }, disabledRuleIds);

  const xmlParser = lineMatches(content, /DocumentBuilderFactory\.newInstance|SAXParserFactory\.newInstance|XMLInputFactory\.newInstance/);
  const xxeGuarded = /disallow-doctype-decl|XMLConstants\.FEATURE_SECURE_PROCESSING|setExpandEntityReferences\s*\(\s*false|IS_SUPPORTING_EXTERNAL_ENTITIES/.test(content);
  if (xmlParser.length && !xxeGuarded) pushFinding(findings, {
    ruleId: "JV-SEC-007", category: "security", severity: "critical",
    title: "XML parser without XXE protection",
    description: "An XML parser factory is created without disabling DOCTYPE declarations or external entities.",
    impact: "XML External Entity attacks can read local files or trigger SSRF from parsed documents (CWE-611).",
    fix: `DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();\nf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);\nf.setXIncludeAware(false);\nf.setExpandEntityReferences(false);`,
    line: xmlParser[0], reference: "https://cwe.mitre.org/data/definitions/611.html",
  }, disabledRuleIds);

  const logSensitive = lineMatches(content, /log(?:ger)?\s*\.\s*(?:info|debug|warn|error|trace)\s*\([^)]*(?:password|passwd|secret|token|apiKey|api_key|ssn|creditCard|cvv)/i);
  if (logSensitive.length) pushFinding(findings, {
    ruleId: "JV-SEC-008", category: "security", severity: "critical",
    title: "Sensitive data written to logs",
    description: `A log statement at line ${logSensitive[0]} interpolates a credential or personal identifier.`,
    impact: "Secrets and PII leak into log aggregators and backups, where they are rarely access-controlled or rotated.",
    fix: `// Log an identifier, never the secret itself\nlog.info("Authenticated userId={}", user.getId());`,
    line: logSensitive[0], reference: "https://cwe.mitre.org/data/definitions/532.html",
  }, disabledRuleIds);

  // ── Concurrency ───────────────────────────────────────────────────────────

  const unsafeFormatter = lineMatches(content, /(?:private|public|protected|static)[\w\s]*\b(?:SimpleDateFormat|Calendar)\s+\w+\s*=/);
  if (unsafeFormatter.length) pushFinding(findings, {
    ruleId: "JV-CON-003", category: "concurrency", severity: "critical",
    title: "SimpleDateFormat / Calendar held as a shared field",
    description: "SimpleDateFormat and Calendar are mutable and not thread-safe, but this one is a field shared across requests.",
    impact: "Under concurrency this silently produces wrong dates or throws — a bug that never reproduces in single-threaded tests.",
    fix: `// Thread-safe and immutable\nprivate static final DateTimeFormatter FMT =\n    DateTimeFormatter.ofPattern("yyyy-MM-dd");`,
    line: unsafeFormatter[0], reference: "https://docs.oracle.com/javase/8/docs/api/java/time/format/DateTimeFormatter.html",
  }, disabledRuleIds);

  const unboundedPool = lineMatches(content, /Executors\.newCachedThreadPool\s*\(|Executors\.newFixedThreadPool\s*\(\s*\d{3,}/);
  if (unboundedPool.length) pushFinding(findings, {
    ruleId: "JV-CON-004", category: "concurrency", severity: "warning",
    title: "Unbounded or oversized thread pool",
    description: "newCachedThreadPool() grows without limit; a very large fixed pool has the same effect.",
    impact: "A traffic spike creates threads until the JVM exhausts memory, taking the service down rather than shedding load.",
    fix: `new ThreadPoolExecutor(8, 32, 60L, TimeUnit.SECONDS,\n    new ArrayBlockingQueue<>(500),\n    new ThreadPoolExecutor.CallerRunsPolicy());`,
    line: unboundedPool[0],
  }, disabledRuleIds);

  // ── Data access ───────────────────────────────────────────────────────────

  const repoWrites = countMatches(content, /\.(?:save|saveAll|delete|deleteAll|update|persist|merge)\s*\(/g);
  const isService = /@Service\b|@Component\b/.test(content);
  if (isService && repoWrites >= 2 && !/@Transactional/.test(content)) pushFinding(findings, {
    ruleId: "JV-DAT-002", category: "data_access", severity: "critical",
    title: "Multiple writes without @Transactional",
    description: `This service performs ${repoWrites} repository write calls but declares no @Transactional boundary.`,
    impact: "A failure part-way through leaves the database in a half-written state that no rollback will undo.",
    fix: `@Transactional\npublic void transfer(Long from, Long to, BigDecimal amount) {\n    accounts.debit(from, amount);\n    accounts.credit(to, amount);\n}`,
    line: lineMatches(content, /\.(?:save|delete|update|persist|merge)\s*\(/)[0] ?? null,
  }, disabledRuleIds);

  const unpaged = lineMatches(content, /\.findAll\s*\(\s*\)/);
  if (unpaged.length) pushFinding(findings, {
    ruleId: "JV-DAT-003", category: "data_access", severity: "warning",
    title: "findAll() without pagination",
    description: "findAll() with no Pageable loads the entire table into memory.",
    impact: "Fine on a seeded dev database, then OOMs in production once the table grows.",
    fix: `Page<User> page = userRepository.findAll(PageRequest.of(0, 50));`,
    line: unpaged[0],
  }, disabledRuleIds);

  // ── Error handling ────────────────────────────────────────────────────────

  const optionalGet = lineMatches(content, /\.get\s*\(\s*\)/).filter((ln) => {
    const l = lines[ln - 1] || "";
    return /Optional|findBy|findById/.test(l) && !/isPresent|isEmpty|orElse|ifPresent/.test(l);
  });
  if (optionalGet.length) pushFinding(findings, {
    ruleId: "JV-ERR-004", category: "error_handling", severity: "warning",
    title: "Optional.get() without a presence check",
    description: `Line ${optionalGet[0]} unwraps an Optional directly instead of handling the empty case.`,
    impact: "Throws NoSuchElementException, which surfaces as an opaque HTTP 500 rather than a meaningful 404.",
    fix: `User user = userRepository.findById(id)\n    .orElseThrow(() -> new ResourceNotFoundException("User " + id));`,
    line: optionalGet[0],
  }, disabledRuleIds);

  const rawResource = lineMatches(content, /=\s*new\s+(?:FileInputStream|FileOutputStream|FileReader|FileWriter|BufferedReader|Socket|Scanner)\s*\(/)
    .filter((ln) => !/try\s*\(/.test(lines[ln - 1] || ""));
  if (rawResource.length) pushFinding(findings, {
    ruleId: "JV-ERR-005", category: "error_handling", severity: "warning",
    title: "Closeable opened outside try-with-resources",
    description: `A stream or reader is opened at line ${rawResource[0]} without try-with-resources.`,
    impact: "An exception before close() leaks the file handle or socket; enough leaks exhaust the descriptor limit.",
    fix: `try (BufferedReader reader = new BufferedReader(new FileReader(path))) {\n    return reader.lines().toList();\n}`,
    line: rawResource[0],
  }, disabledRuleIds);

  // ── Performance ───────────────────────────────────────────────────────────

  // Only String accumulators matter here — `count += 1` on an int is not a defect.
  const stringVars = new Set();
  for (const line of lines) {
    const m = /\bString\s+(\w+)\s*=/.exec(line);
    if (m) stringVars.add(m[1]);
  }
  const isStringAccum = (text) => {
    for (const re of [/(\w+)\s*\+=\s*[^;]+;/g, /(\w+)\s*=\s*\1\s*\+\s*[^;]+;/g]) {
      let m;
      while ((m = re.exec(text))) if (stringVars.has(m[1])) return true;
    }
    return false;
  };
  const concatInLoop = [];
  lines.forEach((line, idx) => {
    if (!/\b(?:for|while)\s*\(/.test(line)) return;
    let depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (depth <= 0) {
      // Single-line loop: the whole body is on this line
      if (isStringAccum(line.slice(line.indexOf("{") + 1))) concatInLoop.push(idx + 1);
      return;
    }
    for (let j = idx + 1; j < lines.length && depth > 0; j++) {
      if (isStringAccum(lines[j])) { concatInLoop.push(j + 1); break; }
      depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
    }
  });
  if (concatInLoop.length) pushFinding(findings, {
    ruleId: "JV-PER-002", category: "performance", severity: "warning",
    title: "String concatenation inside a loop",
    description: `Line ${concatInLoop[0]} builds a String with + inside a loop, allocating a new String each iteration.`,
    impact: "Quadratic time and garbage churn; noticeable once the loop runs thousands of times.",
    fix: `StringBuilder sb = new StringBuilder();\nfor (String part : parts) sb.append(part);\nreturn sb.toString();`,
    line: concatInLoop[0],
  }, disabledRuleIds);

  const httpClient = lineMatches(content, /new\s+RestTemplate\s*\(\s*\)|HttpClient\.newHttpClient\s*\(\s*\)/);
  const hasTimeout = /setConnectTimeout|setReadTimeout|connectTimeout|HttpComponentsClientHttpRequestFactory|\.timeout\s*\(/.test(content);
  if (httpClient.length && !hasTimeout) pushFinding(findings, {
    ruleId: "JV-PER-003", category: "performance", severity: "critical",
    title: "HTTP client without timeouts",
    description: "A RestTemplate or HttpClient is created with default settings, which means no connect or read timeout.",
    impact: "One slow upstream ties up request threads until the pool is exhausted — the classic cascading outage.",
    fix: `RestTemplate rt = new RestTemplateBuilder()\n    .setConnectTimeout(Duration.ofSeconds(2))\n    .setReadTimeout(Duration.ofSeconds(5))\n    .build();`,
    line: httpClient[0],
  }, disabledRuleIds);

  // ── API design ────────────────────────────────────────────────────────────

  const isController = /@RestController\b|@Controller\b/.test(content);
  if (isController && /@Entity\b/.test(content)) pushFinding(findings, {
    ruleId: "JV-API-004", category: "api_design", severity: "warning",
    title: "JPA entity exposed by a controller",
    description: "A @Entity type is referenced directly in a controller instead of a dedicated response DTO.",
    impact: "Every column becomes part of the public contract, lazy associations blow up during serialisation, and a schema rename silently breaks clients.",
    fix: `public record UserResponse(Long id, String email) {\n    static UserResponse from(User u) { return new UserResponse(u.getId(), u.getEmail()); }\n}`,
    line: lineMatches(content, /@Entity\b/)[0] ?? null,
  }, disabledRuleIds);

  // ── Java standards ────────────────────────────────────────────────────────

  const hasEquals = /public\s+boolean\s+equals\s*\(\s*Object/.test(content);
  const hasHashCode = /public\s+int\s+hashCode\s*\(\s*\)/.test(content);
  if (hasEquals !== hasHashCode) pushFinding(findings, {
    ruleId: "JV-STD-003", category: "java_standards", severity: "warning",
    title: `${hasEquals ? "equals() without hashCode()" : "hashCode() without equals()"}`,
    description: "equals() and hashCode() must be overridden together to honour the Object contract.",
    impact: "Objects that are equal land in different hash buckets, so HashMap/HashSet lookups silently miss.",
    fix: `@Override public boolean equals(Object o) { /* ... */ }\n@Override public int hashCode() { return Objects.hash(id); }`,
    line: lineMatches(content, hasEquals ? /public\s+boolean\s+equals\s*\(/ : /public\s+int\s+hashCode\s*\(/)[0] ?? null,
    reference: "https://docs.oracle.com/javase/8/docs/api/java/lang/Object.html#hashCode--",
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
