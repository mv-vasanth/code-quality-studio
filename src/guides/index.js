import { BEST_PRACTICES, BEST_PRACTICES_INTRO } from "../bestPracticesGuide.js";
import { AUDIT_STACKS } from "../stacks/definitions.js";
import { getRuleCatalog } from "../rules/catalog.js";

export const JAVA_API_PRACTICES = [
  {
    id: "jv-api-rest",
    category: "api_design",
    ruleIds: ["JV-API-001", "JV-API-002"],
    title: "Return explicit HTTP responses with DTOs",
    summary:
      "A REST endpoint should say exactly what happened: the right status code (201 for created, 404 for missing) and a stable response shape (a DTO), never a raw entity or a bare value that might be null. This makes your API predictable for the frontend and safe to evolve.",
    avoid: `// vague — always 200, leaks the JPA entity, can return null
@GetMapping("/orders/{id}")
public Order getOrder(@PathVariable Long id) {
    return repository.findById(id).orElse(null);
}`,
    prefer: `// explicit status + DTO at the boundary
@GetMapping("/orders/{id}")
public ResponseEntity<OrderDto> getOrder(@PathVariable Long id) {
    return repository.findById(id)
        .map(o -> ResponseEntity.ok(toDto(o)))
        .orElse(ResponseEntity.notFound().build());
}`,
    reference:
      "https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/responseentity.html",
  },
  {
    id: "jv-sec-prepared",
    category: "security",
    ruleIds: ["JV-SEC-001"],
    title: "Use parameterized SQL — never string concatenation",
    summary:
      "If you build SQL by gluing user input into a string, an attacker can inject their own SQL (e.g. drop tables, read other users' data). Always pass values as parameters (? or :named) so the driver keeps data and code separate.",
    avoid: `// SQL injection: email comes from the user
String sql = "SELECT * FROM users WHERE email = '" + email + "'";
statement.executeQuery(sql);`,
    prefer: `// value is bound as a parameter, not part of the query text
jdbcTemplate.query(
    "SELECT * FROM users WHERE email = ?",
    userRowMapper, email);`,
    reference:
      "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
  },
  {
    id: "jv-sec-secrets",
    category: "security",
    ruleIds: ["JV-SEC-002"],
    title: "Keep secrets out of source code",
    summary:
      "API keys, passwords, and tokens written directly in code get committed to git forever and show up in logs. Read them from environment variables or config so each environment supplies its own, and nothing sensitive lives in the repo.",
    avoid: `private static final String API_KEY = "sk_live_9fJ2...";`,
    prefer: `// value injected from env / config server at runtime
@Value("\${service.api-key}")
private String apiKey;`,
    reference:
      "https://docs.spring.io/spring-boot/reference/features/external-config.html",
  },
  {
    id: "jv-err-global",
    category: "error_handling",
    ruleIds: ["JV-ERR-001"],
    title: "Handle errors centrally — never swallow exceptions",
    summary:
      "An empty catch block hides real failures and makes bugs invisible. Let exceptions bubble up to one @ControllerAdvice that turns them into a consistent error response, so clients always get a clear status and message.",
    avoid: `try {
    orderService.place(cmd);
} catch (Exception e) {
    // nothing here — the failure just disappears
}`,
    prefer: `@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiError> handle(NotFoundException ex) {
        return ResponseEntity.status(404)
            .body(new ApiError("NOT_FOUND", ex.getMessage()));
    }
}`,
    reference:
      "https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-exceptionhandler.html",
  },
  {
    id: "jv-data-tx",
    category: "data_access",
    title: "Put transaction boundaries on the service layer",
    summary:
      "Wrap a unit of work in @Transactional on the service method so related writes commit or roll back together. Keep transactions short, and don't touch lazy-loaded relations after the transaction ends.",
    avoid: `// no transaction: a failure on the 2nd save leaves half-written data
public void placeOrder(Cmd cmd) {
    orderRepo.save(order);
    inventoryRepo.decrement(items); // if this throws, order is orphaned
}`,
    prefer: `@Transactional
public OrderDto placeOrder(PlaceOrderCommand cmd) {
    var order = orderRepo.save(toOrder(cmd));
    inventoryRepo.decrement(cmd.items());
    return toDto(order);
}`,
    reference:
      "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html",
  },
  {
    id: "jv-obs-log",
    category: "observability",
    ruleIds: ["JV-OBS-001"],
    title: "Log through SLF4J, not System.out",
    summary:
      "System.out.println can't be filtered by level, routed, or correlated, and it's invisible in most log aggregators. Use a logger with structured context (ids as parameters) so production issues are searchable.",
    avoid: `System.out.println("order placed " + orderId);`,
    prefer: `private static final Logger log = LoggerFactory.getLogger(OrderService.class);

log.info("order_placed orderId={} userId={}", orderId, userId);`,
    reference: "https://www.slf4j.org/manual.html",
  },
  {
    id: "jv-con-pool",
    category: "concurrency",
    ruleIds: ["JV-CON-001"],
    title: "Use managed thread pools, not new Thread()",
    summary:
      "Creating raw threads by hand has no back-pressure or shutdown and can exhaust resources under load. Submit work to an ExecutorService or use @Async so the framework manages the pool lifecycle.",
    avoid: `new Thread(() -> processOrder(id)).start();`,
    prefer: `@Async
public CompletableFuture<OrderDto> processAsync(OrderId id) {
    return CompletableFuture.completedFuture(process(id));
}`,
    reference:
      "https://docs.spring.io/spring-framework/reference/integration/scheduling.html",
  },
  {
    id: "jv-per-n1",
    category: "performance",
    ruleIds: ["JV-PER-001"],
    title: "Avoid N+1 database queries",
    summary:
      "Looping over parent rows and lazily loading each child fires one query per row (the 'N+1' problem) and gets slow fast. Fetch what you need in one query with a JOIN FETCH or @EntityGraph.",
    avoid: `// 1 query for orders + 1 per order for its items
for (Order o : orderRepo.findAll()) {
    o.getItems().size(); // triggers a query each iteration
}`,
    prefer: `@Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.status = :status")
List<Order> findWithItems(@Param("status") Status status);`,
    reference: "https://docs.spring.io/spring-data/jpa/reference/jpa/entity-graph.html",
  },
  {
    id: "jv-tst-junit",
    category: "testing",
    ruleIds: ["JV-TST-001"],
    title: "Unit-test services with JUnit 5 + Mockito",
    summary:
      "Mock a service's dependencies so you can test its logic quickly without a database or web server. Assert on both the happy path and error paths.",
    avoid: `// no tests in the file at all — regressions ship silently`,
    prefer: `@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock OrderRepository repo;
    @InjectMocks OrderService service;

    @Test
    void placesOrder() {
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));
        assertThat(service.place(cmd)).isNotNull();
    }
}`,
    reference: "https://junit.org/junit5/docs/current/user-guide/",
  },
  {
    id: "jv-mnt-layer",
    category: "maintainability",
    ruleIds: ["JV-MNT-001"],
    title: "Keep layers separate and classes small",
    summary:
      "Controller handles HTTP, service holds business logic, repository does persistence. Don't let HTTP types leak into persistence, and split a class once it grows past a single clear responsibility.",
    avoid: `// controller doing DB + business logic in one giant method
@GetMapping("/report")
public String report() { /* 300 lines of JDBC + formatting */ }`,
    prefer: `@GetMapping("/report")
public ResponseEntity<ReportDto> report() {
    return ResponseEntity.ok(reportService.build()); // logic lives in the service
}`,
    reference: "https://martinfowler.com/bliki/PresentationDomainDataLayering.html",
  },
  {
    id: "jv-std-records",
    category: "java_standards",
    title: "Prefer records for immutable DTOs",
    summary:
      "Java 17+ records give you an immutable data carrier with constructor, equals, hashCode, and toString for free — ideal for request/response objects and far less boilerplate than a mutable POJO.",
    avoid: `public class CreateOrderRequest {
    private UUID productId; private int quantity;
    // + getters, setters, equals, hashCode, toString ...
}`,
    prefer: `public record CreateOrderRequest(UUID productId, int quantity) {}`,
    reference: "https://docs.oracle.com/en/java/javase/17/language/records.html",
  },
];

export const JAVA_API_INTRO =
  "A practical, example-first guide to Java API and core-service standards. Each item shows what to avoid, what to do instead, and a link to the official docs — read top to bottom to learn the patterns, or filter by category to fix a specific finding.";

export const TYPESCRIPT_PRACTICES = [
  {
    id: "ts-types-strict",
    category: "type_safety",
    ruleIds: ["TS-TYP-001", "TS-TYP-002", "TS-TYP-003"],
    title: "Turn on strict mode and avoid any / @ts-ignore / !",
    summary:
      "any turns off type checking, @ts-ignore hides real errors, and the non-null ! assertion promises something the compiler can't verify — all three let bugs through at runtime. Enable strict in tsconfig, accept unknown at the edges, and narrow with a check or schema.",
    avoid: `function parse(input: any) {      // no checking at all
  // @ts-ignore                     // silences a real error
  return input.data!.value;         // ! assumes non-null and can crash
}`,
    prefer: `// tsconfig.json -> { "compilerOptions": { "strict": true } }
function parse(input: unknown) {
  const parsed = payloadSchema.parse(input); // validates + types it
  return parsed.data.value;
}`,
    reference: "https://www.typescriptlang.org/tsconfig#strict",
  },
  {
    id: "ts-http-errors",
    category: "http_clients",
    ruleIds: ["TS-HTTP-001", "TS-HTTP-002"],
    title: "Check every HTTP response for failure",
    summary:
      "fetch() does NOT throw on 404 or 500 — it only rejects on network errors — so code that reads response.json() straight away treats an error page as data. Check response.ok (and wrap axios calls) and turn failures into a clear error.",
    avoid: `const res = await fetch('/api/user/' + id);
const user = await res.json(); // a 500 error body is parsed as if it were a user`,
    prefer: `const res = await fetch(\`/api/user/\${id}\`);
if (!res.ok) {
  throw new HttpError(res.status, await res.text());
}
const user: User = await res.json();`,
    reference: "https://developer.mozilla.org/en-US/docs/Web/API/Response/ok",
  },
  {
    id: "ts-val-zod",
    category: "validation",
    ruleIds: ["TS-VAL-001"],
    title: "Validate external input at the edge",
    summary:
      "Data from a request body, query string, or third-party API is unknown until you check it — trusting its shape leads to crashes deep in your code. Parse it once with a schema (e.g. Zod) so from that point on it's both validated and correctly typed.",
    avoid: `app.post('/orders', (req, res) => {
  const qty = req.body.quantity; // could be undefined, a string, anything
  charge(qty * price);           // NaN or worse
});`,
    prefer: `const orderSchema = z.object({ productId: z.string(), quantity: z.number().int().positive() });

app.post('/orders', (req, res) => {
  const order = orderSchema.parse(req.body); // throws 400-able error if invalid
  charge(order.quantity * price);
});`,
    reference: "https://zod.dev/",
  },
  {
    id: "ts-sec-env",
    category: "security",
    ruleIds: ["TS-SEC-001"],
    title: "Read secrets from the environment, fail fast if missing",
    summary:
      "Hardcoded tokens leak through git and bundles. Load secrets from process.env and check they exist at startup so a missing key fails loudly instead of sending undefined to an API.",
    avoid: `const stripeKey = 'sk_live_51H...';`,
    prefer: `const stripeKey = process.env.STRIPE_KEY;
if (!stripeKey) throw new Error('STRIPE_KEY is required');`,
    reference: "https://12factor.net/config",
  },
  {
    id: "ts-async-await",
    category: "async_io",
    title: "await your promises and propagate errors",
    summary:
      "A promise you don't await is a 'floating promise' — errors vanish and ordering breaks. Always await async calls (or explicitly handle them), and re-throw a meaningful error at service boundaries.",
    avoid: `function save(user: User) {
  db.insert(user); // returns a promise that's never awaited — errors are lost
}`,
    prefer: `async function save(user: User) {
  try {
    return await db.insert(user);
  } catch (e) {
    throw mapDbError(e);
  }
}`,
    reference: "https://typescript-eslint.io/rules/no-floating-promises/",
  },
  {
    id: "ts-test-msw",
    category: "testing",
    title: "Test API clients against mocked HTTP",
    summary:
      "Hitting real servers in tests is slow and flaky. Intercept requests with MSW (or vi.mock) so you can assert both success and failure responses deterministically.",
    avoid: `// test calls the real staging API — slow, flaky, breaks offline
const user = await getUser('123');`,
    prefer: `server.use(
  http.get('/api/user/:id', () => HttpResponse.json(mockUser)),
);
const user = await getUser('123');
expect(user.name).toBe('Ada');`,
    reference: "https://mswjs.io/docs/",
  },
  {
    id: "ts-struct-modules",
    category: "structure",
    ruleIds: ["TS-STR-001"],
    title: "Group code by feature, keep barrel files lean",
    summary:
      "Organise files by domain (orders/, users/) rather than by technical type, and avoid giant index.ts barrels that re-export everything — they hurt tree-shaking and create circular imports. Import from the module you actually need.",
    avoid: `// src/index.ts re-exports 40 modules; everything imports from '..'
export * from './orders';
export * from './users';
export * from './billing'; /* ...and 37 more */`,
    prefer: `src/
  orders/orderService.ts
  orders/orderClient.ts
  users/userService.ts
// import { placeOrder } from '@/orders/orderService'`,
    reference: "https://www.typescriptlang.org/docs/handbook/2/modules.html",
  },
  {
    id: "ts-err-types",
    category: "error_handling",
    ruleIds: ["TS-ERR-001"],
    title: "Use typed errors — never an empty catch",
    summary:
      "An empty catch block throws away the reason something failed. Catch, keep the original cause, and throw a typed application error with a code that's safe to return to callers.",
    avoid: `try {
  await charge(order);
} catch (e) {
  // swallowed — the caller has no idea it failed
}`,
    prefer: `export class PaymentError extends Error {
  constructor(public code: string, cause: unknown) {
    super(code, { cause });
  }
}

try {
  await charge(order);
} catch (e) {
  throw new PaymentError('PAYMENT_FAILED', e);
}`,
    reference:
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause",
  },
  {
    id: "ts-per-batch",
    category: "performance",
    title: "Parallelise independent calls, paginate large ones",
    summary:
      "Awaiting independent requests one after another (a 'waterfall') is needlessly slow. Run them together with Promise.all, and page through large result sets instead of loading everything at once.",
    avoid: `const a = await getItem(1); // each await waits for the previous
const b = await getItem(2);
const c = await getItem(3);`,
    prefer: `const [a, b, c] = await Promise.all([
  getItem(1), getItem(2), getItem(3),
]);`,
    reference:
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all",
  },
  {
    id: "ts-std-eslint",
    category: "standards",
    ruleIds: ["TS-STD-001"],
    title: "No console.log in production code",
    summary:
      "Stray console.log leaks into production, clutters output, and can expose data. Use a real logger, and let ESLint catch leftover console and floating promises before they merge.",
    avoid: `console.log('user token', token); // ships to prod, leaks the token`,
    prefer: `logger.debug('user authenticated', { userId });
// .eslintrc: { "rules": { "no-console": "warn",
//   "@typescript-eslint/no-floating-promises": "error" } }`,
    reference: "https://typescript-eslint.io/rules/no-floating-promises/",
  },
];

export const TYPESCRIPT_INTRO =
  "A practical, example-first guide to TypeScript core and API-client standards. Every item pairs a common mistake with the fix and a link to the official docs — great for learning the patterns from scratch or resolving a specific finding.";

const AUTHORED_PRACTICES_BY_STACK = {
  playwright: BEST_PRACTICES,
  java_api: JAVA_API_PRACTICES,
  typescript: TYPESCRIPT_PRACTICES,
};

/**
 * Every rule should be represented in Practices. Start from the hand-authored,
 * example-rich practices, then auto-generate a concise card for any catalog rule
 * not already covered by one — so the guide + checklist reflect all rules.
 */
function practiceFromRule(rule) {
  const parts = [rule.description, rule.impact].filter(Boolean).join(" ");
  return {
    id: `rule-${rule.ruleId}`,
    category: rule.category,
    ruleIds: [rule.ruleId],
    title: rule.title,
    summary: parts || rule.title,
    detects: rule.detection || undefined,
    autoGenerated: true,
  };
}

const PRACTICES_CACHE = {};
function getPracticesForStack(stackId) {
  if (PRACTICES_CACHE[stackId]) return PRACTICES_CACHE[stackId];
  const authored = AUTHORED_PRACTICES_BY_STACK[stackId] ?? [];
  const covered = new Set(authored.flatMap((p) => p.ruleIds ?? []));
  const derived = getRuleCatalog(stackId)
    .filter((r) => !covered.has(r.ruleId))
    .map(practiceFromRule);
  const merged = [...authored, ...derived];
  PRACTICES_CACHE[stackId] = merged;
  return merged;
}

/** Find the practice whose ruleIds include this finding's ruleId (for finding cards). */
export function getPracticeByRuleId(stackId, ruleId) {
  if (!ruleId) return null;
  return getPracticesForStack(stackId).find((p) => p.ruleIds?.includes(ruleId)) ?? null;
}

const PLAYWRIGHT_JAVA_INTRO =
  "Standards for the Playwright Java binding (com.microsoft.playwright). Focus on locators, auto-waiting, web-first assertions (PlaywrightAssertions.assertThat), and JVM resource management.";

const INTRO_BY_STACK = {
  playwright_java: PLAYWRIGHT_JAVA_INTRO,
  java_api: JAVA_API_INTRO,
  typescript: TYPESCRIPT_INTRO,
  playwright: BEST_PRACTICES_INTRO,
};

export function getGuideForStack(stackId) {
  const stack = AUDIT_STACKS[stackId] ?? AUDIT_STACKS.playwright;
  return {
    intro: INTRO_BY_STACK[stackId] ?? BEST_PRACTICES_INTRO,
    practices: getPracticesForStack(stackId), // authored + auto-filled for every rule
    title: stack.practicesTitle,
    docPath: stack.practicesDoc,
  };
}
