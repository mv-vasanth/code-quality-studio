/**
 * Golden-master regression test for all 18 stacks.
 *
 * Runs every analyzer over a fixture that deliberately contains defects, and
 * compares the findings to a committed snapshot. Any change in which rules fire,
 * on which line, at which severity, fails the run.
 *
 * This is the regression net for the rule set: a rule that silently stops firing
 * produces no error anywhere else — the report just gets quieter.
 *
 *   node test/golden-master.mjs            verify against the snapshots
 *   node test/golden-master.mjs --update   re-record them (review the diff!)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { analysePlaywright }             from "../src/analyzers/playwright.js";
import { analysePlaywrightJavaLocally }  from "../src/analyzers/playwrightJava.js";
import { analysePlaywrightPythonLocally }from "../src/analyzers/playwrightPython.js";
import { analyseSeleniumJavaLocally }    from "../src/analyzers/seleniumJava.js";
import { analyseSeleniumCsharpLocally }  from "../src/analyzers/seleniumCsharp.js";
import { analyseCypressLocally }         from "../src/analyzers/cypress.js";
import { analyseAppiumJavaLocally }      from "../src/analyzers/appiumJava.js";
import { analyseToscaXmlLocally }        from "../src/analyzers/toscaXml.js";
import { analyseRestAssuredLocally }     from "../src/analyzers/restAssured.js";
import { analyseKarateLocally }          from "../src/analyzers/karate.js";
import { analysePytestApiLocally }       from "../src/analyzers/pytestApi.js";
import { analysePostmanLocally }         from "../src/analyzers/postman.js";
import { analyseJavaApiLocally }         from "../src/analyzers/javaApi.js";
import { analyseJavaCoreLocally }        from "../src/analyzers/javaCore.js";
import { analyseTypeScriptLocally }      from "../src/analyzers/typescript.js";
import { analyseTsFrontendLocally }      from "../src/analyzers/tsFrontend.js";
import { analysePythonApiLocally }       from "../src/analyzers/pythonApi.js";
import { analysePythonFrontendLocally }  from "../src/analyzers/pythonFrontend.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const GOLDEN = join(__dirname, "golden");

const STACKS = [
  ["playwright",        "playwright.ts",         analysePlaywright],
  ["playwright_java",   "playwright_java.java",  analysePlaywrightJavaLocally],
  ["playwright_python", "playwright_python.py",  analysePlaywrightPythonLocally],
  ["selenium_java",     "selenium_java.java",    analyseSeleniumJavaLocally],
  ["selenium_csharp",   "selenium_csharp.cs",    analyseSeleniumCsharpLocally],
  ["cypress",           "cypress.ts",            analyseCypressLocally],
  ["appium_java",       "appium_java.java",      analyseAppiumJavaLocally],
  ["tosca_xml",         "tosca_xml.xml",         analyseToscaXmlLocally],
  ["restassured",       "restassured.java",      analyseRestAssuredLocally],
  ["karate",            "karate.feature",        analyseKarateLocally],
  ["pytest_api",        "pytest_api.py",         analysePytestApiLocally],
  ["postman",           "postman.json",          analysePostmanLocally],
  ["java_api",          "java_api.java",         analyseJavaApiLocally],
  ["java_frontend",     "java_frontend.java",    analyseJavaCoreLocally],
  ["typescript",        "typescript.ts",         analyseTypeScriptLocally],
  ["ts_frontend",       "ts_frontend.tsx",       analyseTsFrontendLocally],
  ["python_api",        "python_api.py",         analysePythonApiLocally],
  ["python_frontend",   "python_frontend.html",  analysePythonFrontendLocally],
];

/** Only the fields a regression should care about — not prose, which is free to be reworded. */
function snapshot(result) {
  return {
    overallScore: result.overallScore,
    categoryScores: result.categoryScores,
    findings: (result.findings ?? [])
      .map((f) => ({ ruleId: f.ruleId, severity: f.severity, category: f.category, line: f.line ?? null }))
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId) || (a.line ?? 0) - (b.line ?? 0)),
  };
}

function diff(expected, actual) {
  const problems = [];
  if (expected.overallScore !== actual.overallScore) {
    problems.push(`overallScore ${expected.overallScore} -> ${actual.overallScore}`);
  }
  for (const cat of Object.keys(expected.categoryScores ?? {})) {
    if (expected.categoryScores[cat] !== actual.categoryScores?.[cat]) {
      problems.push(`category ${cat}: ${expected.categoryScores[cat]} -> ${actual.categoryScores?.[cat]}`);
    }
  }
  const key = (f) => `${f.ruleId}@${f.line ?? "-"}`;
  const was = new Map(expected.findings.map((f) => [key(f), f]));
  const now = new Map(actual.findings.map((f) => [key(f), f]));
  for (const [k, f] of was) {
    if (!now.has(k)) problems.push(`STOPPED FIRING  ${k} [${f.severity}]`);
    else if (now.get(k).severity !== f.severity) problems.push(`severity changed ${k}: ${f.severity} -> ${now.get(k).severity}`);
  }
  for (const [k, f] of now) {
    if (!was.has(k)) problems.push(`NEW FINDING     ${k} [${f.severity}]`);
  }
  return problems;
}

const update = process.argv.includes("--update");
mkdirSync(GOLDEN, { recursive: true });

let failed = 0, checked = 0, totalFindings = 0;
console.log(update ? "Recording golden masters\n" : "Golden-master regression\n");

for (const [stackId, fixture, runner] of STACKS) {
  const path = join(FIXTURES, fixture);
  if (!existsSync(path)) { console.log(`  MISSING FIXTURE  ${fixture}`); failed++; continue; }

  let actual;
  try {
    actual = snapshot(runner(fixture, readFileSync(path, "utf8"), { disabledRuleIds: new Set() }));
  } catch (e) {
    console.log(`  THREW            ${stackId}: ${e.message}`);
    failed++; continue;
  }
  totalFindings += actual.findings.length;

  const goldenPath = join(GOLDEN, `${stackId}.json`);
  if (update || !existsSync(goldenPath)) {
    writeFileSync(goldenPath, JSON.stringify(actual, null, 2) + "\n");
    console.log(`  recorded  ${stackId.padEnd(18)} ${actual.findings.length} findings, score ${actual.overallScore}`);
    continue;
  }

  const expected = JSON.parse(readFileSync(goldenPath, "utf8"));
  const problems = diff(expected, actual);
  checked++;
  if (problems.length === 0) {
    console.log(`  ok        ${stackId.padEnd(18)} ${actual.findings.length} findings, score ${actual.overallScore}`);
  } else {
    failed++;
    console.log(`  FAIL      ${stackId}`);
    for (const p of problems) console.log(`              ${p}`);
  }
}

console.log();
if (update) {
  console.log(`Recorded ${STACKS.length} snapshots — review the diff before committing.`);
  process.exit(0);
}
console.log(`${checked} stacks checked, ${totalFindings} findings total`);
if (failed > 0) {
  console.log(`\n${failed} stack(s) FAILED. If the change was intentional, re-run with --update and review the diff.`);
  process.exit(1);
}
console.log("All stacks match their golden master.");
