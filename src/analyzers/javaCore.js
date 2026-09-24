import { AUDIT_STACKS } from "../stacks/definitions.js";
import { buildAuditResult, lineMatches, countMatches, pushFinding } from "./analyzerUtils.js";

const CATEGORY_IDS = AUDIT_STACKS.java_frontend.categories.map((c) => c.id);

/** General (non-API) Java code-quality rules. Heuristic, regex-based. */
export function analyseJavaCoreLocally(filename, content, options = {}) {
  const disabled = options.disabledRuleIds ?? new Set();
  const findings = [];
  const lines = content.split(/\r?\n/);
  const add = (r) => pushFinding(findings, r, disabled);

  const pst = lineMatches(content, /printStackTrace\s*\(/);
  if (pst.length) add({ ruleId: "JVF-ERR-001", category: "error_handling", severity: "warning",
    title: "printStackTrace() instead of logging", description: "Writes to stderr and bypasses logging.", impact: "Errors invisible to log aggregation.",
    fix: `log.error("context", e);`, line: pst[0] });

  const emptyCatch = lineMatches(content, /catch\s*\([^)]*\)\s*\{\s*\}/);
  if (emptyCatch.length) add({ ruleId: "JVF-ERR-002", category: "error_handling", severity: "warning",
    title: "Empty catch block", description: "Exceptions are swallowed silently.", impact: "Failures become undiagnosable.",
    fix: "Log with the cause or rethrow a domain exception.", line: emptyCatch[0] });

  const sysout = lineMatches(content, /System\.(out|err)\.print/);
  if (sysout.length) add({ ruleId: "JVF-STD-001", category: "coding_standards", severity: "warning",
    title: "System.out/err instead of logger", description: "Console prints bypass structured logging.", impact: "No levels/aggregation.",
    fix: `log.info("value {}", value);`, line: sysout[0] });

  const strEq = lineMatches(content, /(==|!=)\s*"|"\s*(==|!=)/);
  if (strEq.length) add({ ruleId: "JVF-STD-002", category: "coding_standards", severity: "warning",
    title: "String compared with == / !=", description: "== compares references, not contents.", impact: "Intermittent wrong comparisons.",
    fix: `"expected".equals(actual)  // or Objects.equals(a, b)`, line: strEq[0] });

  const rand = lineMatches(content, /new\s+Random\s*\(/);
  if (rand.length) add({ ruleId: "JVF-SEC-001", category: "security", severity: "info",
    title: "java.util.Random used", description: "Random is predictable; not for tokens/passwords.", impact: "Guessable values if used for security.",
    fix: "Use SecureRandom for anything security-sensitive.", line: rand[0] });

  const concatLoop = lineMatches(content, /(for|while)\s*\([^)]*\)\s*\{[\s\S]{0,160}?\w+\s*\+=\s*"/);
  if (concatLoop.length) add({ ruleId: "JVF-PER-001", category: "performance", severity: "info",
    title: "String concatenation in loop", description: "+= on String in a loop creates many intermediate objects.", impact: "Avoidable GC pressure.",
    fix: "Use a StringBuilder inside the loop.", line: concatLoop[0] });

  const rawList = lineMatches(content, /\b(List|Map|Set)\s+\w+\s*=\s*new\s+(ArrayList|HashMap|HashSet)\s*\(\s*\)/);
  if (rawList.length) add({ ruleId: "JVF-STD-003", category: "coding_standards", severity: "info",
    title: "Raw collection type", description: "Collection declared without generics.", impact: "Loses compile-time type safety.",
    fix: `List<Order> orders = new ArrayList<>();`, line: rawList[0] });

  if (/public\s+class\s+\w+\s*\{[\s\S]{2500,}/.test(content)) add({ ruleId: "JVF-MNT-001", category: "maintainability", severity: "info",
    title: "Large class — consider splitting", description: "Very long class body often mixes responsibilities.", impact: "Harder reviews and testing.",
    fix: "Extract cohesive responsibilities into separate classes.", line: 1 });

  const todo = lineMatches(content, /\/\/\s*(TODO|FIXME)|\/\*\s*(TODO|FIXME)/i);
  if (todo.length) add({ ruleId: "JVF-STD-004", category: "coding_standards", severity: "info",
    title: "Unresolved TODO/FIXME", description: "Leftover markers indicate unfinished work.", impact: "Unfinished logic ships.",
    fix: "Resolve or link to an issue.", line: todo[0] });

  const catchThrowable = lineMatches(content, /catch\s*\(\s*(?:final\s+)?(?:java\.lang\.)?(?:Throwable|Error)\s+\w+\s*\)/);
  if (catchThrowable.length) add({ ruleId: "JVF-ERR-003", category: "error_handling", severity: "warning",
    title: "catch (Throwable) / catch (Error)", description: `Line ${catchThrowable[0]} catches Throwable or Error.`, impact: "Swallows OutOfMemoryError, StackOverflowError and thread-death, leaving the JVM in an undefined state.",
    fix: `} catch (IOException e) {\n    log.error("read failed", e);\n    throw new StorageException(e);\n}`, line: catchThrowable[0], reference: "https://wiki.sei.cmu.edu/confluence/display/java/ERR08-J.+Do+not+catch+NullPointerException+or+any+of+its+ancestors" });

  const messageOnly = lineMatches(content, /\.(?:error|warn)\s*\([^;]*\.getMessage\s*\(\s*\)\s*\)\s*;/);
  if (messageOnly.length) add({ ruleId: "JVF-ERR-004", category: "error_handling", severity: "warning",
    title: "Exception logged as getMessage() only", description: `Line ${messageOnly[0]} logs the message text and discards the throwable.`, impact: "No stack trace and no cause chain, so the failure cannot be located; NPEs log as \"null\".",
    fix: `log.error("failed to load order {}", orderId, e);  // pass the throwable itself`, line: messageOnly[0], reference: "https://www.slf4j.org/faq.html#paramException" });

  const procExec = lineMatches(content, /Runtime\.getRuntime\s*\(\s*\)\s*\.exec\s*\(|new\s+ProcessBuilder\s*\(/);
  if (procExec.length) add({ ruleId: "JVF-SEC-002", category: "security", severity: "warning",
    title: "External process execution", description: `Line ${procExec[0]} spawns an OS process.`, impact: "If any argument derives from user input this becomes command injection.",
    fix: `new ProcessBuilder(List.of("/usr/bin/convert", inputPath, outputPath)).start();  // never build one shell string`, line: procExec[0], reference: "https://owasp.org/www-community/attacks/Command_Injection" });

  const javaSecret = lineMatches(content, /\b(?:password|passwd|pwd|secret|apiKey|api_key|accessKey|authToken|token)\s*=\s*"[^"]{4,}"/i);
  if (javaSecret.length) add({ ruleId: "JVF-SEC-003", category: "security", severity: "critical",
    title: "Hardcoded credential", description: `A password/token literal is assigned at line ${javaSecret[0]}.`, impact: "The secret is in version control and in every decompiled build artifact.",
    fix: `String apiKey = System.getenv("API_KEY");`, line: javaSecret[0], reference: "https://cwe.mitre.org/data/definitions/798.html" });

  const weakHash = lineMatches(content, /MessageDigest\.getInstance\s*\(\s*"(?:MD2|MD5|SHA-?1)"|DigestUtils\.(?:md5|sha1)\w*\s*\(/i);
  if (weakHash.length) add({ ruleId: "JVF-SEC-004", category: "security", severity: "warning",
    title: "Broken hash algorithm (MD5/SHA-1)", description: `Line ${weakHash[0]} uses MD5 or SHA-1.`, impact: "Both are collision-broken and unsuitable for signatures, integrity checks or password storage.",
    fix: `MessageDigest.getInstance("SHA-256");  // for passwords use BCrypt/Argon2, not a raw digest`, line: weakHash[0], reference: "https://cwe.mitre.org/data/definitions/327.html" });

  const sqlConcat = lineMatches(content, /(?:executeQuery|executeUpdate|prepareStatement|createQuery|createNativeQuery)\s*\([^;]*"\s*\+|String\s+\w*(?:sql|query|Sql|Query)\w*\s*=\s*"[^"]*"\s*\+/);
  if (sqlConcat.length) add({ ruleId: "JVF-SEC-005", category: "security", severity: "critical",
    title: "SQL built by string concatenation", description: `Line ${sqlConcat[0]} concatenates values into a SQL string.`, impact: "Direct SQL injection: an attacker can read or destroy the database.",
    fix: `PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");\nps.setLong(1, userId);`, line: sqlConcat[0], reference: "https://owasp.org/www-community/attacks/SQL_Injection" });

  const legacyCollections = lineMatches(content, /\bnew\s+(?:Vector|Hashtable|StringBuffer)\s*[<(]|\b(?:Vector|Hashtable)\s*<[^>]*>\s+\w+\s*[=;]/);
  if (legacyCollections.length) add({ ruleId: "JVF-PER-002", category: "performance", severity: "info",
    title: "Legacy synchronized collection / StringBuffer", description: `Line ${legacyCollections[0]} uses Vector, Hashtable or StringBuffer.`, impact: "Pays for method-level locking that single-threaded code never needs, and the locking is too coarse to make callers thread-safe anyway.",
    fix: `List<Order> orders = new ArrayList<>();\nMap<String, Order> byId = new HashMap<>();   // ConcurrentHashMap if shared\nStringBuilder sb = new StringBuilder();`, line: legacyCollections[0], reference: "https://docs.oracle.com/javase/8/docs/api/java/util/Vector.html" });

  const explicitGc = lineMatches(content, /System\.gc\s*\(\s*\)|Runtime\.getRuntime\s*\(\s*\)\s*\.gc\s*\(/);
  if (explicitGc.length) add({ ruleId: "JVF-PER-003", category: "performance", severity: "warning",
    title: "Explicit System.gc() call", description: `Line ${explicitGc[0]} requests a garbage collection.`, impact: "Can force a full stop-the-world collection and defeat the collector's own heuristics.",
    fix: "Delete the call; release references and let the JVM manage collection.", line: explicitGc[0], reference: "https://wiki.sei.cmu.edu/confluence/display/java/MET12-J.+Do+not+use+finalizers" });

  const unclosed = lineMatches(content, /=\s*new\s+(?:FileInputStream|FileOutputStream|FileReader|FileWriter|BufferedReader|BufferedWriter|Scanner|Socket|RandomAccessFile)\s*\(/)
    .filter((ln) => !/\btry\s*\(/.test(lines[ln - 1] || "") && !/\btry\s*\($/.test((lines[ln - 2] || "").trim()));
  if (unclosed.length) add({ ruleId: "JVF-PER-004", category: "performance", severity: "warning",
    title: "Resource opened outside try-with-resources", description: `Line ${unclosed[0]} opens a stream/reader/socket that is not managed by try-with-resources.`, impact: "On an exception the file handle or socket leaks until GC, exhausting descriptors under load.",
    fix: `try (BufferedReader r = new BufferedReader(new FileReader(path))) {\n    return r.readLine();\n}`, line: unclosed[0], reference: "https://docs.oracle.com/javase/tutorial/essential/exceptions/tryResourceClose.html" });

  const equalsNoHash = /(?:public|protected)\s+boolean\s+equals\s*\(\s*Object\s/.test(content) && !/\bint\s+hashCode\s*\(\s*\)/.test(content)
    ? lineMatches(content, /(?:public|protected)\s+boolean\s+equals\s*\(\s*Object\s/) : [];
  if (equalsNoHash.length) add({ ruleId: "JVF-MNT-002", category: "maintainability", severity: "warning",
    title: "equals() without hashCode()", description: `equals is overridden at line ${equalsNoHash[0]} but hashCode is not.`, impact: "Equal objects get different hashes, so HashMap/HashSet lookups silently miss.",
    fix: `@Override public int hashCode() { return Objects.hash(id, name); }`, line: equalsNoHash[0], reference: "https://docs.oracle.com/javase/8/docs/api/java/lang/Object.html#hashCode--" });

  const mutableStatic = lineMatches(content, /public\s+static\s+(?!final\b)(?!void\b)[\w.]+(?:\s*<[^>]*>)?(?:\s*\[\s*\])?\s+\w+\s*[=;]/);
  if (mutableStatic.length) add({ ruleId: "JVF-MNT-003", category: "maintainability", severity: "warning",
    title: "Mutable public static field", description: `Line ${mutableStatic[0]} exposes a non-final public static field.`, impact: "Global mutable state: any class can reassign it, and concurrent writes are unsynchronised.",
    fix: `private static final Config CONFIG = Config.load();\npublic static Config config() { return CONFIG; }`, line: mutableStatic[0], reference: "https://wiki.sei.cmu.edu/confluence/display/java/OBJ10-J.+Do+not+use+public+static+nonfinal+fields" });

  const finalizer = lineMatches(content, /(?:protected|public)\s+void\s+finalize\s*\(\s*\)/);
  if (finalizer.length) add({ ruleId: "JVF-MNT-004", category: "maintainability", severity: "warning",
    title: "finalize() override", description: `finalize is overridden at line ${finalizer[0]}.`, impact: "Deprecated since Java 9 and never guaranteed to run; it delays collection and can resurrect objects.",
    fix: `class Handle implements AutoCloseable {\n    @Override public void close() { release(); }\n}`, line: finalizer[0], reference: "https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Object.html#finalize()" });

  const boxedCtor = lineMatches(content, /new\s+(?:Integer|Boolean|Double|Long|Float|Short|Byte|Character)\s*\(/);
  if (boxedCtor.length) add({ ruleId: "JVF-STD-005", category: "coding_standards", severity: "warning",
    title: "Deprecated boxed-primitive constructor", description: `Line ${boxedCtor[0]} calls a wrapper constructor such as new Integer(...).`, impact: "Deprecated for removal since Java 9; allocates a new object every time and breaks == identity assumptions.",
    fix: `Integer count = Integer.valueOf(text);   // or just: int count = Integer.parseInt(text);`, line: boxedCtor[0], reference: "https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Integer.html#%3Cinit%3E(int)" });

  const missingOverride = lineMatches(content, /(?:public|protected)\s+(?:final\s+)?(?:String|boolean|int)\s+(?:toString|equals|hashCode)\s*\(/)
    .filter((ln) => {
      // @Override is commonly written on the same line as the signature
      if ((lines[ln - 1] || "").includes("@Override")) return false;
      for (let i = ln - 2; i >= 0; i--) {
        const prev = (lines[i] || "").trim();
        if (!prev || prev.startsWith("//") || prev.startsWith("*") || prev.startsWith("/*")) continue;
        return !prev.includes("@Override");
      }
      return true;
    });
  if (missingOverride.length) add({ ruleId: "JVF-STD-006", category: "coding_standards", severity: "info",
    title: "Overridden method without @Override", description: `toString/equals/hashCode at line ${missingOverride[0]} is not annotated with @Override.`, impact: "A signature typo silently defines a new method instead of overriding, and the compiler cannot warn.",
    fix: `@Override\npublic String toString() { return "Order[" + id + "]"; }`, line: missingOverride[0], reference: "https://docs.oracle.com/javase/8/docs/api/java/lang/Override.html" });

  const crit = findings.filter((f) => f.severity === "critical").length;
  return buildAuditResult({
    filename, categoryIds: CATEGORY_IDS, findings,
    metrics: { printStackTraces: pst.length, emptyCatchBlocks: emptyCatch.length, systemOutCalls: countMatches(content, /System\.(out|err)\.print/g) },
    summary: `Java core scan of ${filename}: ${findings.length} finding(s)${crit ? `, ${crit} critical` : ""}.`,
  });
}
