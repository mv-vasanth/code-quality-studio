/**
 * Security rules, proven in both directions.
 *
 * The golden master proves rules keep behaving the same; it cannot tell you
 * they are right. Every security rule bug found so far was caught by pairing
 * a vulnerable fixture with the correct form of the same code — including
 * PY-SEC-001, which reported the recommended parameterised query as critical
 * SQL injection. A scanner that flags correct code is worse than one that
 * misses: it teaches people to ignore it.
 *
 * So each pair asserts both halves:
 *   <stack>.vuln.<ext>  every listed rule MUST fire
 *   <stack>.safe.<ext>  NO security finding may fire
 *
 *   node test/security-rules.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { analyseJavaApiLocally }        from "../src/analyzers/javaApi.js";
import { analysePythonApiLocally }      from "../src/analyzers/pythonApi.js";
import { analyseTsFrontendLocally }     from "../src/analyzers/tsFrontend.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "security");

const PAIRS = [
  {
    name: "java",
    runner: analyseJavaApiLocally,
    vuln: "java.vuln.java",
    safe: "java.safe.java",
    expect: [
      "JV-SEC-001", // SQL injection
      "JV-SEC-003", // weak hash
      "JV-SEC-006", // unsafe deserialization
      "JV-SEC-009", // hardcoded credential
      "JV-SEC-010", // command injection
      "JV-SEC-011", // predictable randomness
    ],
  },
  {
    name: "python",
    runner: analysePythonApiLocally,
    vuln: "python.vuln.py",
    safe: "python.safe.py",
    expect: [
      "PY-SEC-001", // SQL injection
      "PY-SEC-002", // hardcoded secret
      "PY-SEC-003", // shell=True
      "PY-SEC-005", // pickle
    ],
  },
  {
    name: "ts_frontend",
    runner: analyseTsFrontendLocally,
    vuln: "tsfrontend.vuln.tsx",
    safe: "tsfrontend.safe.tsx",
    expect: [
      "TSF-SEC-001", // unsanitised HTML
      "TSF-SEC-003", // dynamic code execution
      "TSF-SEC-004", // hardcoded credential
    ],
  },
];

const securityFindings = (result) =>
  (result.findings ?? []).filter((f) => f.category === "security");

let failures = 0;
console.log("Security rules — vulnerable and safe pairs\n");

for (const { name, runner, vuln, safe, expect } of PAIRS) {
  const run = (file) => {
    const content = readFileSync(join(FIXTURES, file), "utf8");
    return securityFindings(runner(file, content, { disabledRuleIds: new Set() }));
  };

  // 1. every expected rule must fire on the vulnerable fixture
  const fired = new Set(run(vuln).map((f) => f.ruleId));
  const missed = expect.filter((id) => !fired.has(id));

  // 2. nothing may fire on the correct form
  const onSafe = run(safe);

  if (!missed.length && !onSafe.length) {
    console.log(`  ok    ${name.padEnd(12)} ${expect.length} rules fire on the defect, silent on the fix`);
    continue;
  }

  failures++;
  console.log(`  FAIL  ${name}`);
  for (const id of missed) {
    console.log(`          MISSED   ${id} did not fire on ${vuln}`);
  }
  for (const f of onSafe) {
    console.log(`          FALSE +  ${f.ruleId} fired on ${safe}:${f.line} — ${f.title}`);
  }
}

console.log();
if (failures) {
  console.log(`${failures} stack(s) FAILED.`);
  console.log("A rule firing on the safe fixture is the more serious failure:");
  console.log("it tells people to break working code.");
  process.exit(1);
}
console.log(`All ${PAIRS.length} stacks: rules fire on the defect and stay silent on the fix.`);
