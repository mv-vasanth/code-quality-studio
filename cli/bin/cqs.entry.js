/**
 * cqs — Code Quality Studio CLI
 * Entry point bundled by build.mjs → dist/cqs.js
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "fs";
import { resolve, extname, basename, relative, join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import process from "process";

/* global __CQS_VERSION__ */
const CQS_VERSION = typeof __CQS_VERSION__ !== "undefined" ? __CQS_VERSION__ : "1.0.0";

// ── Analyzers (imported directly — bypass localStorage in index.js) ──────────
import { analysePlaywright }           from "../../src/analyzers/playwright.js";
import { analyseJavaApiLocally }       from "../../src/analyzers/javaApi.js";
import { analyseTypeScriptLocally }    from "../../src/analyzers/typescript.js";
import { analysePlaywrightJavaLocally }   from "../../src/analyzers/playwrightJava.js";
import { analysePlaywrightPythonLocally } from "../../src/analyzers/playwrightPython.js";
import { analyseTsFrontendLocally }    from "../../src/analyzers/tsFrontend.js";
import { analysePythonApiLocally }     from "../../src/analyzers/pythonApi.js";
import { analysePythonFrontendLocally }from "../../src/analyzers/pythonFrontend.js";
import { analyseJavaCoreLocally }      from "../../src/analyzers/javaCore.js";
import { analyseRestAssuredLocally }   from "../../src/analyzers/restAssured.js";
import { analyseKarateLocally }        from "../../src/analyzers/karate.js";
import { analysePytestApiLocally }     from "../../src/analyzers/pytestApi.js";
import { analysePostmanLocally }       from "../../src/analyzers/postman.js";
import { analyseSeleniumJavaLocally }  from "../../src/analyzers/seleniumJava.js";
import { analyseSeleniumCsharpLocally }from "../../src/analyzers/seleniumCsharp.js";
import { analyseCypressLocally }       from "../../src/analyzers/cypress.js";
import { analyseAppiumJavaLocally }    from "../../src/analyzers/appiumJava.js";
import { analyseToscaXmlLocally }      from "../../src/analyzers/toscaXml.js";
import { AUDIT_STACKS }                from "../../src/stacks/definitions.js";
import { RULES_FILENAME, discoverRulesFile, loadRulesFile, runFileRules } from "../../src/rules/fileRules.js";
import { buildFixPrompt, extractCode, evaluateFix, lineDiff } from "../../src/rules/remediate.js";
import { formatVerification } from "../../src/rules/verifyFix.js";

// ── Runner map ────────────────────────────────────────────────────────────────
const RUNNERS = {
  playwright:        analysePlaywright,
  java_api:          analyseJavaApiLocally,
  typescript:        analyseTypeScriptLocally,
  playwright_java:   analysePlaywrightJavaLocally,
  playwright_python: analysePlaywrightPythonLocally,
  ts_frontend:       analyseTsFrontendLocally,
  python_api:        analysePythonApiLocally,
  python_frontend:   analysePythonFrontendLocally,
  java_frontend:     analyseJavaCoreLocally,
  restassured:       analyseRestAssuredLocally,
  karate:            analyseKarateLocally,
  pytest_api:        analysePytestApiLocally,
  postman:           analysePostmanLocally,
  selenium_java:     analyseSeleniumJavaLocally,
  selenium_csharp:   analyseSeleniumCsharpLocally,
  cypress:           analyseCypressLocally,
  appium_java:       analyseAppiumJavaLocally,
  tosca_xml:         analyseToscaXmlLocally,
};

// ── ANSI colours ─────────────────────────────────────────────────────────────
let useColor = process.stdout.isTTY !== false;
const C = {
  reset:   () => useColor ? "\x1b[0m"  : "",
  bold:    () => useColor ? "\x1b[1m"  : "",
  dim:     () => useColor ? "\x1b[2m"  : "",
  red:     () => useColor ? "\x1b[31m" : "",
  yellow:  () => useColor ? "\x1b[33m" : "",
  blue:    () => useColor ? "\x1b[34m" : "",
  cyan:    () => useColor ? "\x1b[36m" : "",
  green:   () => useColor ? "\x1b[32m" : "",
  magenta: () => useColor ? "\x1b[35m" : "",
  gray:    () => useColor ? "\x1b[90m" : "",
  bgRed:   () => useColor ? "\x1b[41m" : "",
};
const b  = (s) => `${C.bold()}${s}${C.reset()}`;
const dim = (s) => `${C.dim()}${s}${C.reset()}`;

// ── Arg parser ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    paths: [], stack: null, severity: "all", category: null, output: "pretty",
    help: false, listStacks: false, readReport: null, open: false,
    rulesFile: null, noRules: false,
    command: null, dryRun: false, commit: false, branch: null, maxFiles: 10, force: false,
    // AI flags
    ai: null, apiKey: null, model: null,
    awsRegion: null, awsAccessKey: null, awsSecretKey: null,
    vertexProject: null, vertexLocation: null, vertexKeyFile: null,
  };
  let i = 0;
  if (argv[0] === "remediate") { args.command = "remediate"; i = 1; }
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--help" || a === "-h")        { args.help = true; }
    else if (a === "--list-stacks")          { args.listStacks = true; }
    else if (a === "--no-color")             { useColor = false; }
    else if ((a === "--stack" || a === "-s") && argv[i+1])  { args.stack = argv[++i]; }
    else if ((a === "--severity" || a === "-S") && argv[i+1]) { args.severity = argv[++i]; }
    else if ((a === "--category" || a === "-c") && argv[i+1]) { args.category = argv[++i]; }
    else if ((a === "--output" || a === "-o") && argv[i+1])   { args.output = argv[++i]; }
    else if ((a === "--read-report" || a === "-r") && argv[i+1]) { args.readReport = argv[++i]; }
    else if (a === "--open")                                      { args.open = true; }
    else if (a === "--rules")                                     { args.rulesFile = argv[++i]; }
    else if (a === "--no-rules")                                  { args.noRules = true; }
    else if (a === "--dry-run")                                   { args.dryRun = true; }
    else if (a === "--commit")                                    { args.commit = true; }
    else if (a === "--branch" && argv[i+1])                       { args.branch = argv[++i]; }
    else if (a === "--max-files" && argv[i+1])                    { args.maxFiles = parseInt(argv[++i], 10) || 10; }
    else if (a === "--force")                                     { args.force = true; }
    else if (a === "--provider" && argv[i+1])                     { args.ai = argv[++i]; }
    else if (a === "--ai" && argv[i+1])                           { args.ai = argv[++i]; }
    else if (a === "--api-key" && argv[i+1])                      { args.apiKey = argv[++i]; }
    else if (a === "--model" && argv[i+1])                        { args.model = argv[++i]; }
    else if (a === "--aws-region" && argv[i+1])                   { args.awsRegion = argv[++i]; }
    else if (a === "--aws-access-key" && argv[i+1])               { args.awsAccessKey = argv[++i]; }
    else if (a === "--aws-secret-key" && argv[i+1])               { args.awsSecretKey = argv[++i]; }
    else if (a === "--vertex-project" && argv[i+1])               { args.vertexProject = argv[++i]; }
    else if (a === "--vertex-location" && argv[i+1])              { args.vertexLocation = argv[++i]; }
    else if (a === "--vertex-key-file" && argv[i+1])              { args.vertexKeyFile = argv[++i]; }
    else if (!a.startsWith("-"))                                   { args.paths.push(a); }
    i++;
  }
  return args;
}

// ── File collector ────────────────────────────────────────────────────────────
function collectFiles(inputPath, stackId) {
  const pattern = AUDIT_STACKS[stackId]?.filePattern;
  const abs = resolve(inputPath);
  if (!existsSync(abs)) { console.error(`  Path not found: ${abs}`); process.exit(1); }
  const stat = statSync(abs);
  if (stat.isFile()) return [abs];

  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") walk(full);
      else if (entry.isFile() && (!pattern || pattern.test(entry.name))) out.push(full);
    }
  }
  walk(abs);
  return out;
}

// ── Auto-detect stack ─────────────────────────────────────────────────────────
function detectStack(files) {
  // Score each stack by how many files match its pattern
  const scores = {};
  for (const [id, stack] of Object.entries(AUDIT_STACKS)) {
    if (!stack.filePattern) continue;
    scores[id] = files.filter(f => stack.filePattern.test(basename(f))).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : "playwright";
}

// ── Grade helper ──────────────────────────────────────────────────────────────
function grade(score) {
  if (score >= 90) return { letter: "A", color: C.green() };
  if (score >= 75) return { letter: "B", color: C.cyan() };
  if (score >= 60) return { letter: "C", color: C.yellow() };
  if (score >= 40) return { letter: "D", color: C.magenta() };
  return { letter: "F", color: C.red() };
}

// ── Severity badge ────────────────────────────────────────────────────────────
function sevBadge(sev) {
  if (sev === "critical") return `${C.bold()}${C.red()} CRIT ${C.reset()}`;
  if (sev === "warning")  return `${C.bold()}${C.yellow()} WARN ${C.reset()}`;
  return `${C.blue()} INFO ${C.reset()}`;
}

// ── Help text ─────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${b("cqs")} — Code Quality Studio CLI  ${dim(`v${CQS_VERSION}`)}

${b("USAGE")}
  cqs [path...]                   Analyse files/folders (defaults to current directory)
  cqs --list-stacks               List all available stacks
  cqs --read-report <file>        Print summary of a saved JSON report

${b("OPTIONS")}
  -s, --stack  <id>               Force a stack (see --list-stacks for IDs)
  -S, --severity <level>          Filter findings: all | critical | warning | info
  -c, --category <id>             Filter by category id
  -o, --output  <fmt>             Output format: pretty | json | summary
  -r, --read-report <file>        Read a saved JSON report and print summary
      --open                      Open the HTML report in the browser after analysis
      --rules <file>              Use this cqs-rules.json (default: discovered by walking up)
      --no-rules                  Ignore any cqs-rules.json found
      --no-color                  Disable ANSI colours
  -h, --help                      Show this help

${b("EXAMPLES")}
  cqs ./tests/
  cqs ./tests/ --stack cypress --severity critical
  cqs ./tests/ --output json > report.json
  cqs ./tests/ --open                                    # run + open HTML in browser
  cqs --read-report report.json --open                   # open saved report in browser
  cqs ./e2e/ -s selenium_java -S warning
  cqs . --list-stacks

${b("AI REVIEW")}  ${dim("(adds second-eye review on top of 300+ rules)")}
  cqs ./tests/ --ai anthropic --api-key sk-ant-xxx
  cqs ./tests/ --ai bedrock --aws-region us-east-1 --aws-access-key KEY --aws-secret-key SECRET
  cqs ./tests/ --ai vertex --vertex-project my-proj --vertex-location us-central1 --vertex-key-file sa.json

  ${dim("Or set via environment variables (recommended for CI):")}
  ANTHROPIC_API_KEY=sk-ant-xxx cqs ./tests/ --ai anthropic
  AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=K AWS_SECRET_ACCESS_KEY=S cqs ./tests/ --ai bedrock
  VERTEX_PROJECT=p VERTEX_LOCATION=us-central1 GOOGLE_APPLICATION_CREDENTIALS=sa.json cqs ./tests/ --ai vertex
`);
}

// ── List stacks ───────────────────────────────────────────────────────────────
function printStacks() {
  console.log(`\n${b("Available stacks")}\n`);
  const groups = {};
  for (const [id, s] of Object.entries(AUDIT_STACKS)) {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push({ id, s });
  }
  for (const [group, items] of Object.entries(groups)) {
    console.log(`  ${C.cyan()}${C.bold()}${group}${C.reset()}`);
    for (const { id, s } of items) {
      console.log(`    ${C.bold()}${id.padEnd(20)}${C.reset()} ${s.icon} ${s.name}  ${dim(s.fileAccept)}`);
    }
    console.log();
  }
}

// ── Pretty output ─────────────────────────────────────────────────────────────
function printPretty(stackId, results, args) {
  const stack = AUDIT_STACKS[stackId];
  const allFindings = results.flatMap(r => r.result.findings ?? []);
  const shown = allFindings.filter(f =>
    (args.severity === "all" || f.severity === args.severity) &&
    (!args.category || f.category === args.category)
  );

  const crit = allFindings.filter(f => f.severity === "critical").length;
  const warn = allFindings.filter(f => f.severity === "warning").length;
  const info = allFindings.filter(f => f.severity === "info").length;
  const avgScore = results.length
    ? Math.round(results.reduce((s, r) => s + (r.result.overallScore ?? 0), 0) / results.length)
    : 0;
  const { letter, color: gc } = grade(avgScore);

  console.log();
  console.log(`${C.cyan()}${C.bold()}  Code Quality Studio${C.reset()}  ${dim("─")} ${stack.icon} ${b(stack.name)}`);
  console.log(`  ${dim("─".repeat(52))}`);
  console.log(`  Files analysed : ${b(String(results.length))}`);
  console.log(`  Overall score  : ${gc}${C.bold()}${avgScore}/100  Grade ${letter}${C.reset()}`);
  console.log(`  Findings       : ${C.red()}${C.bold()}${crit} critical${C.reset()}  ${C.yellow()}${warn} warning${C.reset()}  ${C.blue()}${info} info${C.reset()}`);
  console.log(`  ${dim("─".repeat(52))}`);

  // Per-file summary
  console.log(`\n${b("  FILES")}\n`);
  for (const { file, result } of results) {
    const g = grade(result.overallScore ?? 0);
    const fc = result.findings.filter(f => f.severity === "critical").length;
    const fw = result.findings.filter(f => f.severity === "warning").length;
    const fi = result.findings.filter(f => f.severity === "info").length;
    const fname = basename(file);
    const badge = `${g.color}${C.bold()}${(result.overallScore ?? 0).toString().padStart(3)}${C.reset()}`;
    const counts = [
      fc ? `${C.red()}${fc}c${C.reset()}` : null,
      fw ? `${C.yellow()}${fw}w${C.reset()}` : null,
      fi ? `${C.blue()}${fi}i${C.reset()}` : null,
    ].filter(Boolean).join(" ");
    console.log(`  ${badge}  ${fname.padEnd(40)} ${counts || dim("clean")}`);
  }

  if (shown.length === 0) {
    console.log(`\n  ${C.green()}${C.bold()}✓ No findings match the current filter.${C.reset()}\n`);
    return;
  }

  // Findings grouped by file
  const byFile = {};
  for (const f of shown) {
    if (!byFile[f._file]) byFile[f._file] = [];
    byFile[f._file].push(f);
  }

  console.log(`\n${b("  FINDINGS")}  ${dim(`(${shown.length} shown)`)}\n`);

  for (const [file, findings] of Object.entries(byFile)) {
    const fname = basename(file);
    console.log(`  ${C.cyan()}${C.bold()}${fname}${C.reset()}  ${dim(relative(process.cwd(), file))}`);

    // Group by severity for clean display
    for (const sev of ["critical", "warning", "info"]) {
      const sevFindings = findings.filter(f => f.severity === sev);
      if (!sevFindings.length) continue;
      for (const f of sevFindings) {
        const lineRef = f.line ? `${C.gray()}:${f.line}${C.reset()}` : "";
        const ruleTag = dim(`[${f.ruleId}]`);
        console.log(`    ${sevBadge(sev)} ${b(f.title)} ${ruleTag}${lineRef}`);
        console.log(`           ${dim(f.description)}`);
        if (f.fix && !f.fix.includes("\n")) {
          console.log(`           ${C.green()}Fix:${C.reset()} ${dim(f.fix)}`);
        }
        console.log();
      }
    }
  }

  // Category score summary
  if (results.length === 1 && results[0].result.categoryScores) {
    const cats = stack.categories ?? [];
    console.log(`  ${b("CATEGORY SCORES")}\n`);
    for (const cat of cats) {
      const s = results[0].result.categoryScores[cat.id] ?? 100;
      const { letter: gl } = grade(s);
      const bar = "█".repeat(Math.round(s / 10)).padEnd(10, "░");
      const gc2 = grade(s);
      console.log(`  ${gc2.color}${bar}${C.reset()} ${s.toString().padStart(3)}  ${cat.icon} ${cat.label}`);
    }
    console.log();
  }
}

// ── Summary output ────────────────────────────────────────────────────────────
function printSummary(stackId, results) {
  const stack = AUDIT_STACKS[stackId];
  const allFindings = results.flatMap(r => r.result.findings ?? []);
  const crit = allFindings.filter(f => f.severity === "critical").length;
  const warn = allFindings.filter(f => f.severity === "warning").length;
  const avgScore = results.length
    ? Math.round(results.reduce((s, r) => s + (r.result.overallScore ?? 0), 0) / results.length)
    : 0;
  console.log(`cqs ${stack.icon} ${stack.name} · ${results.length} files · score ${avgScore} · ${crit} critical · ${warn} warning`);
  if (crit > 0) process.exitCode = 1;
}

// ── JSON output ───────────────────────────────────────────────────────────────
function printJson(stackId, results, args) {
  const stack = AUDIT_STACKS[stackId];
  const allFindings = results.flatMap(r => r.result.findings ?? []).filter(f =>
    (args.severity === "all" || f.severity === args.severity) &&
    (!args.category || f.category === args.category)
  );
  console.log(JSON.stringify({
    stack: { id: stackId, name: stack.name },
    files: results.length,
    avgScore: results.length
      ? Math.round(results.reduce((s, r) => s + (r.result.overallScore ?? 0), 0) / results.length)
      : 0,
    summary: {
      critical: allFindings.filter(f => f.severity === "critical").length,
      warning:  allFindings.filter(f => f.severity === "warning").length,
      info:     allFindings.filter(f => f.severity === "info").length,
    },
    results: results.map(({ file, result }) => ({
      file,
      overallScore: result.overallScore,
      categoryScores: result.categoryScores,
      findings: result.findings.filter(f =>
        (args.severity === "all" || f.severity === args.severity) &&
        (!args.category || f.category === args.category)
      ),
    })),
  }, null, 2));
}

// ── HTML Report Generator ─────────────────────────────────────────────────────
function buildHtmlReport(report, aiResults = []) {
  const { stack, files, avgScore, summary, results = [] } = report;
  const gradeColor = avgScore >= 90 ? "#16a34a" : avgScore >= 75 ? "#0891b2" : avgScore >= 60 ? "#d97706" : "#dc2626";
  const gradeLetter = avgScore >= 90 ? "A" : avgScore >= 75 ? "B" : avgScore >= 60 ? "C" : avgScore >= 40 ? "D" : "F";

  // Top files by critical count
  const sortedFiles = [...results].sort((a, b) => {
    const ac = (a.findings ?? []).filter(f => f.severity === "critical").length;
    const bc = (b.findings ?? []).filter(f => f.severity === "critical").length;
    return bc - ac;
  });

  // Top rules
  const ruleCounts = {};
  for (const r of results) {
    for (const f of (r.findings ?? [])) {
      if (!ruleCounts[f.ruleId]) ruleCounts[f.ruleId] = { count: 0, title: f.title, sev: f.severity };
      ruleCounts[f.ruleId].count++;
    }
  }
  const topRules = Object.entries(ruleCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 10);

  // Category averages
  const catTotals = {}; const catCounts2 = {};
  for (const r of results) {
    for (const [cat, score] of Object.entries(r.categoryScores ?? {})) {
      catTotals[cat] = (catTotals[cat] ?? 0) + score;
      catCounts2[cat] = (catCounts2[cat] ?? 0) + 1;
    }
  }
  const catAvgs = Object.entries(catTotals)
    .map(([cat, total]) => ({ cat, avg: Math.round(total / catCounts2[cat]) }))
    .sort((a, b) => a.avg - b.avg);

  const sevColor = sev => sev === "critical" ? "#dc2626" : sev === "warning" ? "#d97706" : "#2563eb";
  const sevBg = sev => sev === "critical" ? "#fef2f2" : sev === "warning" ? "#fffbeb" : "#eff6ff";
  const scoreCol = s => s >= 90 ? "#16a34a" : s >= 75 ? "#0891b2" : s >= 60 ? "#d97706" : "#dc2626";

  const filesHtml = sortedFiles.map(r => {
    const fc = (r.findings ?? []).filter(f => f.severity === "critical").length;
    const fw = (r.findings ?? []).filter(f => f.severity === "warning").length;
    const fi = (r.findings ?? []).filter(f => f.severity === "info").length;
    const sc = r.overallScore ?? 0;
    const fname = basename(r.file ?? "");
    const findingsHtml = (r.findings ?? []).map(f => `
      <div style="padding:8px 12px;border-bottom:1px solid #f1f5f9;display:flex;gap:10px;align-items:flex-start">
        <span style="background:${sevBg(f.severity)};color:${sevColor(f.severity)};font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:2px">${f.severity.toUpperCase().slice(0,4)}</span>
        <div>
          <div style="font-weight:600;font-size:13px;color:#1e293b">${f.title ?? ""} <span style="font-size:11px;color:#94a3b8;font-weight:400">[${f.ruleId ?? ""}]${f.line ? ` :${f.line}` : ""}</span></div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">${f.description ?? ""}</div>
          ${f.fix ? `<div style="font-size:11px;color:#059669;margin-top:3px">💡 ${f.fix}</div>` : ""}
        </div>
      </div>`).join("");
    return `
    <details style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;overflow:hidden">
      <summary style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:12px;background:#f8fafc;list-style:none;user-select:none">
        <span style="background:${scoreCol(sc)};color:#fff;font-weight:700;font-size:13px;padding:3px 10px;border-radius:6px;min-width:36px;text-align:center">${sc}</span>
        <span style="font-weight:600;font-size:14px;color:#1e293b;flex:1">${fname}</span>
        ${fc ? `<span style="background:#fef2f2;color:#dc2626;font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px">${fc} critical</span>` : ""}
        ${fw ? `<span style="background:#fffbeb;color:#d97706;font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px">${fw} warn</span>` : ""}
        ${fi ? `<span style="background:#eff6ff;color:#2563eb;font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px">${fi} info</span>` : ""}
      </summary>
      <div style="font-size:11px;color:#94a3b8;padding:4px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0">${r.file ?? ""}</div>
      ${findingsHtml || `<div style="padding:12px 16px;color:#64748b;font-size:13px">✓ No findings</div>`}
    </details>`;
  }).join("");

  const rulesHtml = topRules.map(([ruleId, info]) => `
    <tr>
      <td style="padding:8px 12px;font-weight:700;color:${sevColor(info.sev)};font-size:18px">${info.count}</td>
      <td style="padding:8px 12px;font-family:monospace;font-size:12px;color:#64748b">${ruleId}</td>
      <td style="padding:8px 12px;font-size:13px;color:#1e293b">${info.title}</td>
      <td style="padding:8px 12px"><span style="background:${sevBg(info.sev)};color:${sevColor(info.sev)};font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px">${info.sev}</span></td>
    </tr>`).join("");

  const catsHtml = catAvgs.map(({ cat, avg }) => {
    const pct = avg;
    const col = scoreCol(avg);
    return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <div style="width:110px;font-size:12px;color:#64748b;text-align:right">${cat}</div>
      <div style="flex:1;background:#e2e8f0;border-radius:4px;height:12px;overflow:hidden">
        <div style="width:${pct}%;background:${col};height:100%;border-radius:4px;transition:width .3s"></div>
      </div>
      <div style="width:36px;font-weight:700;font-size:13px;color:${col}">${avg}</div>
    </div>`;
  }).join("");

  const now = new Date().toLocaleString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>cqs Report — ${stack?.name ?? "Code Quality"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh}
  .header{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#fff;padding:32px 40px}
  .header h1{font-size:28px;font-weight:800;letter-spacing:-0.5px}
  .header .sub{font-size:14px;color:#94a3b8;margin-top:4px}
  .stats{display:flex;gap:16px;margin-top:24px;flex-wrap:wrap}
  .stat{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:16px 24px;min-width:140px}
  .stat .val{font-size:32px;font-weight:800;line-height:1}
  .stat .lbl{font-size:12px;color:#94a3b8;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
  .body{max-width:1200px;margin:0 auto;padding:32px 24px}
  .section{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:24px;overflow:hidden}
  .section-head{padding:16px 20px;border-bottom:1px solid #f1f5f9;font-weight:700;font-size:15px;color:#0f172a;display:flex;align-items:center;gap:8px}
  .section-body{padding:20px}
  table{width:100%;border-collapse:collapse}
  tr:hover{background:#f8fafc}
  details>summary::-webkit-details-marker{display:none}
  @media(max-width:600px){.stats{gap:10px}.stat{min-width:120px;padding:12px 16px}}
</style>
</head>
<body>
<div class="header">
  <h1>⚡ cqs Code Quality Report</h1>
  <div class="sub">${stack?.name ?? ""} &nbsp;·&nbsp; Generated ${now} &nbsp;·&nbsp; cqs v${CQS_VERSION}</div>
  <div class="stats">
    <div class="stat"><div class="val" style="color:${gradeColor}">${avgScore}<span style="font-size:18px;margin-left:4px">${gradeLetter}</span></div><div class="lbl">Overall Score</div></div>
    <div class="stat"><div class="val">${files}</div><div class="lbl">Files Analysed</div></div>
    <div class="stat"><div class="val" style="color:#dc2626">${summary.critical}</div><div class="lbl">Critical</div></div>
    <div class="stat"><div class="val" style="color:#d97706">${summary.warning}</div><div class="lbl">Warning</div></div>
    <div class="stat"><div class="val" style="color:#2563eb">${summary.info}</div><div class="lbl">Info</div></div>
  </div>
</div>

<div class="body">

  ${catAvgs.length ? `
  <div class="section">
    <div class="section-head">📊 Category Scores</div>
    <div class="section-body">${catsHtml}</div>
  </div>` : ""}

  <div class="section">
    <div class="section-head">🔴 Top Rule Violations</div>
    <div class="section-body" style="padding:0">
      <table>
        <thead><tr style="background:#f8fafc;font-size:11px;text-transform:uppercase;color:#64748b">
          <th style="padding:8px 12px;text-align:left">Count</th>
          <th style="padding:8px 12px;text-align:left">Rule ID</th>
          <th style="padding:8px 12px;text-align:left">Description</th>
          <th style="padding:8px 12px;text-align:left">Severity</th>
        </tr></thead>
        <tbody>${rulesHtml}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-head">📁 Files &nbsp;<span style="font-size:12px;color:#94a3b8;font-weight:400">click a file to expand findings</span></div>
    <div class="section-body">${filesHtml}</div>
  </div>

  ${aiResults.length ? `
  <div class="section">
    <div class="section-head" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff">🤖 AI Second-Eye Review</div>
    <div class="section-body">
      ${aiResults.map(r => `
      <details style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px;overflow:hidden" open>
        <summary style="padding:10px 16px;cursor:pointer;background:#f5f3ff;font-weight:700;font-size:13px;color:#4f46e5;list-style:none">${r.fname}</summary>
        <div style="padding:16px;font-size:13px;color:#1e293b;line-height:1.7;white-space:pre-wrap;font-family:-apple-system,sans-serif">${r.text ? r.text.replace(/</g,"&lt;").replace(/>/g,"&gt;") : `<span style="color:#dc2626">Error: ${r.error}</span>`}</div>
      </details>`).join("")}
    </div>
  </div>` : ""}

</div>
</body>
</html>`;
}

// ── AI Engine ─────────────────────────────────────────────────────────────────

function buildAiPrompt(filename, content, findings) {
  const top = findings.filter(f => f.severity === "critical" || f.severity === "warning");
  const list = top.map(f =>
    `- [${f.severity.toUpperCase()}] ${f.title} (Rule: ${f.ruleId}${f.line ? `, Line: ${f.line}` : ""})\n  ${f.description}${f.fix ? `\n  Hint: ${f.fix}` : ""}`
  ).join("\n");

  const lines = content.split("\n");
  const ctx = new Set();
  for (const f of top) {
    if (f.line) for (let i = Math.max(0, f.line - 3); i < Math.min(lines.length, f.line + 5); i++) ctx.add(i);
  }
  const snippet = ctx.size > 0
    ? [...ctx].sort((a, b) => a - b).map(i => `${String(i + 1).padStart(4)}: ${lines[i]}`).join("\n")
    : content.slice(0, 3000);

  return `You are a test automation quality expert. Review this file and its findings.

File: ${filename}

STATIC ANALYSIS FINDINGS:
${list}

RELEVANT CODE:
\`\`\`
${snippet}
\`\`\`

Respond with:
1. **Assessment** (2-3 sentences on the main quality issues)
2. **Fixes** — for each CRITICAL finding show a before/after code snippet
3. **Priority** — which to fix first and why

Be concise and specific. Focus on critical issues.`;
}

async function callAnthropic(prompt, apiKey, model) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).content[0].text;
}

async function callBedrock(prompt, { region, accessKey, secretKey }) {
  const { createHmac, createHash } = await import("crypto");
  const model = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
  const host  = `bedrock-runtime.${region}.amazonaws.com`;
  const path  = `/model/${encodeURIComponent(model)}/invoke`;
  const body  = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const payHash   = createHash("sha256").update(body).digest("hex");
  const canonical = `POST\n${path}\n\ncontent-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n\ncontent-type;host;x-amz-date\n${payHash}`;
  const scope     = `${dateStamp}/${region}/bedrock/aws4_request`;
  const sts       = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash("sha256").update(canonical).digest("hex")}`;
  const sign      = (k, m) => createHmac("sha256", k).update(m).digest();
  const sigKey    = sign(sign(sign(sign("AWS4" + secretKey, dateStamp), region), "bedrock"), "aws4_request");
  const sig       = createHmac("sha256", sigKey).update(sts).digest("hex");
  const auth      = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=content-type;host;x-amz-date, Signature=${sig}`;

  const resp = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-amz-date": amzDate, "authorization": auth },
    body,
  });
  if (!resp.ok) throw new Error(`Bedrock ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).content[0].text;
}

async function callVertex(prompt, { project, location, keyFile }) {
  const { createSign } = await import("crypto");
  let sa;
  try { sa = JSON.parse(readFileSync(resolve(keyFile), "utf8")); }
  catch { throw new Error(`Cannot read Vertex key file: ${keyFile}`); }

  const now = Math.floor(Date.now() / 1000);
  const hdr = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const pay = Buffer.from(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now,
  })).toString("base64url");
  const s = createSign("RSA-SHA256"); s.update(`${hdr}.${pay}`);
  const jwt = `${hdr}.${pay}.${s.sign(sa.private_key, "base64url")}`;

  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!tok.ok) throw new Error(`Vertex auth: ${await tok.text()}`);
  const { access_token } = await tok.json();

  const model = "claude-haiku@20251001";
  const resp = await fetch(
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/anthropic/models/${model}:rawPredict`,
    {
      method: "POST",
      headers: { "authorization": `Bearer ${access_token}`, "content-type": "application/json" },
      body: JSON.stringify({
        anthropic_version: "vertex-2023-10-16",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    }
  );
  if (!resp.ok) throw new Error(`Vertex ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).content[0].text;
}

async function callOpenAI(prompt, apiKey, model) {
  const m = model || "gpt-4o-mini";
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: m,
      max_tokens: 1024,
      messages: [
        { role: "system", content: "You are a test automation quality expert. Be concise and specific." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).choices[0].message.content;
}

async function runAiReview(results, fileContents, aiConfig) {
  const { provider } = aiConfig;
  const label = provider === "anthropic" ? `Anthropic Claude (${aiConfig.model || "claude-haiku-4-5-20251001"})` :
                provider === "bedrock"   ? "AWS Bedrock Claude" :
                provider === "vertex"    ? "Google Vertex Claude" :
                provider === "openai"    ? `OpenAI (${aiConfig.model || "gpt-4o-mini"})` : provider;

  const toReview = results.filter(r =>
    (r.result.findings ?? []).some(f => f.severity === "critical" || f.severity === "warning")
  ).slice(0, 10); // cap at 10 files to control cost

  if (toReview.length === 0) {
    console.log(`\n  ${C.green()}${C.bold()}🤖 AI Review: no critical/warning findings — nothing to review!${C.reset()}\n`);
    return [];
  }

  console.log(`\n  ${C.cyan()}${C.bold()}🤖 AI Review${C.reset()}  ${dim(`· ${label} · ${toReview.length} file(s)`)}`);
  console.log(`  ${dim("─".repeat(60))}\n`);

  const aiResults = [];
  for (const { file, result } of toReview) {
    const fname = basename(file);
    const findings = result.findings ?? [];
    const content  = fileContents[file] ?? "";
    process.stdout.write(`  ${dim("⏳")} ${fname.padEnd(48)} `);
    try {
      const prompt = buildAiPrompt(fname, content, findings);
      let text;
      if      (provider === "anthropic") text = await callAnthropic(prompt, aiConfig.apiKey, aiConfig.model);
      else if (provider === "bedrock")   text = await callBedrock(prompt, aiConfig);
      else if (provider === "vertex")    text = await callVertex(prompt, aiConfig);
      else if (provider === "openai")    text = await callOpenAI(prompt, aiConfig.apiKey, aiConfig.model);
      console.log(`${C.green()}✓${C.reset()}`);
      console.log();
      console.log(`  ${C.cyan()}${C.bold()}${fname}${C.reset()}`);
      for (const ln of text.split("\n")) console.log(`  ${ln}`);
      console.log();
      aiResults.push({ file, fname, text });
    } catch (err) {
      console.log(`${C.red()}✗ ${err.message}${C.reset()}`);
      aiResults.push({ file, fname, text: null, error: err.message });
    }
  }
  return aiResults;
}

function resolveAiConfig(args) {
  if (!args.ai) return null;
  const p = args.ai.toLowerCase();
  if (p === "anthropic") {
    const key = args.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) { console.error("  --ai anthropic requires --api-key or ANTHROPIC_API_KEY env var"); process.exit(1); }
    return { provider: "anthropic", apiKey: key };
  }
  if (p === "bedrock") {
    const region    = args.awsRegion      || process.env.AWS_REGION            || process.env.AWS_DEFAULT_REGION;
    const accessKey = args.awsAccessKey   || process.env.AWS_ACCESS_KEY_ID;
    const secretKey = args.awsSecretKey   || process.env.AWS_SECRET_ACCESS_KEY;
    if (!region || !accessKey || !secretKey) {
      console.error("  --ai bedrock requires --aws-region, --aws-access-key, --aws-secret-key\n  (or AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY env vars)");
      process.exit(1);
    }
    return { provider: "bedrock", region, accessKey, secretKey };
  }
  if (p === "vertex") {
    const project  = args.vertexProject  || process.env.VERTEX_PROJECT;
    const location = args.vertexLocation || process.env.VERTEX_LOCATION  || "us-central1";
    const keyFile  = args.vertexKeyFile  || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!project || !keyFile) {
      console.error("  --ai vertex requires --vertex-project and --vertex-key-file\n  (or VERTEX_PROJECT and GOOGLE_APPLICATION_CREDENTIALS env vars)");
      process.exit(1);
    }
    return { provider: "vertex", project, location, keyFile };
  }
  if (p === "openai") {
    const key = args.apiKey || process.env.OPENAI_API_KEY;
    if (!key) { console.error("  --ai openai requires --api-key or OPENAI_API_KEY env var"); process.exit(1); }
    return { provider: "openai", apiKey: key, model: args.model };
  }
  console.error(`  Unknown AI provider: "${args.ai}". Use: anthropic | bedrock | vertex | openai`);
  process.exit(1);
}

function openHtmlReport(htmlContent) {
  const tmp = join(tmpdir(), `cqs-report-${Date.now()}.html`);
  writeFileSync(tmp, htmlContent, "utf8");
  const cmd = process.platform === "win32" ? `start "" "${tmp}"` :
               process.platform === "darwin" ? `open "${tmp}"` : `xdg-open "${tmp}"`;
  try { execSync(cmd); } catch { /* ignore */ }
  console.log(`\n  ${dim("HTML report:")} ${tmp}\n`);
  return tmp;
}

// ── Read Report Summary ───────────────────────────────────────────────────────
function printReportSummary(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    console.error(`  Report file not found: ${abs}`);
    process.exit(1);
  }
  let report;
  try { report = JSON.parse(readFileSync(abs, "utf8")); }
  catch { console.error(`  Could not parse JSON: ${abs}`); process.exit(1); }

  const { stack, files, avgScore, summary, results = [] } = report;
  const { letter, color: gc } = grade(avgScore);

  console.log();
  console.log(`${C.cyan()}${C.bold()}  Code Quality Studio${C.reset()}  ${dim("─")}  ${b("Report Summary")}`);
  console.log(`  ${dim("─".repeat(52))}`);
  console.log(`  Stack          : ${b(stack?.name ?? stack?.id ?? "unknown")}`);
  console.log(`  Files analysed : ${b(String(files))}`);
  console.log(`  Overall score  : ${gc}${C.bold()}${avgScore}/100  Grade ${letter}${C.reset()}`);
  console.log(`  Findings       : ${C.red()}${C.bold()}${summary.critical} critical${C.reset()}  ${C.yellow()}${summary.warning} warning${C.reset()}  ${C.blue()}${summary.info} info${C.reset()}`);
  console.log(`  ${dim("─".repeat(52))}`);

  // ── Top 10 worst files ────────────────────────────────────────────────────
  const sorted = [...results].sort((a, b) => {
    const ac = (a.findings ?? []).filter(f => f.severity === "critical").length;
    const bc = (b.findings ?? []).filter(f => f.severity === "critical").length;
    return bc - ac || (a.overallScore ?? 0) - (b.overallScore ?? 0);
  });

  console.log(`\n${b("  TOP FILES BY CRITICAL FINDINGS")}\n`);
  const top = sorted.filter(r => (r.findings ?? []).some(f => f.severity === "critical")).slice(0, 10);
  if (top.length === 0) {
    console.log(`  ${C.green()}${C.bold()}✓ No critical findings in any file!${C.reset()}`);
  } else {
    for (const r of top) {
      const fc = (r.findings ?? []).filter(f => f.severity === "critical").length;
      const fw = (r.findings ?? []).filter(f => f.severity === "warning").length;
      const { color: sc } = grade(r.overallScore ?? 0);
      const fname = basename(r.file ?? "unknown");
      console.log(`  ${sc}${C.bold()}${(r.overallScore ?? 0).toString().padStart(3)}${C.reset()}  ${fname.padEnd(45)} ${C.red()}${fc}c${C.reset()} ${C.yellow()}${fw}w${C.reset()}`);
    }
  }

  // ── Top recurring rule violations ─────────────────────────────────────────
  const ruleCounts = {};
  for (const r of results) {
    for (const f of (r.findings ?? [])) {
      if (f.severity === "critical") {
        ruleCounts[f.ruleId] = ruleCounts[f.ruleId] ?? { count: 0, title: f.title, sev: f.severity };
        ruleCounts[f.ruleId].count++;
      }
    }
  }
  const topRules = Object.entries(ruleCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 8);

  if (topRules.length > 0) {
    console.log(`\n${b("  TOP CRITICAL RULES  (most violations)")}\n`);
    for (const [ruleId, info] of topRules) {
      console.log(`  ${C.red()}${C.bold()}${String(info.count).padStart(4)}x${C.reset()}  ${dim(`[${ruleId}]`)}  ${info.title}`);
    }
  }

  // ── Category score breakdown ──────────────────────────────────────────────
  const catTotals = {};
  const catCounts = {};
  for (const r of results) {
    if (!r.categoryScores) continue;
    for (const [cat, score] of Object.entries(r.categoryScores)) {
      catTotals[cat] = (catTotals[cat] ?? 0) + score;
      catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    }
  }
  const catAvgs = Object.entries(catTotals)
    .map(([cat, total]) => ({ cat, avg: Math.round(total / catCounts[cat]) }))
    .sort((a, b) => a.avg - b.avg);

  if (catAvgs.length > 0) {
    console.log(`\n${b("  CATEGORY AVERAGES")}\n`);
    for (const { cat, avg } of catAvgs) {
      const bar = "█".repeat(Math.round(avg / 10)).padEnd(10, "░");
      const gc2 = grade(avg);
      console.log(`  ${gc2.color}${bar}${C.reset()} ${avg.toString().padStart(3)}  ${cat}`);
    }
  }

  console.log();
  console.log(`  ${dim(`Report: ${abs}`)}`);
  console.log();
  return report;
}

// ── Main ──────────────────────────────────────────────────────────────────────
// ── Remediation agent (cqs remediate) ────────────────────────────────────────
function gitState(dir) {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd: dir, stdio: "pipe" });
  } catch { return { isRepo: false, clean: false }; }
  const out = execSync("git status --porcelain", { cwd: dir, encoding: "utf8", stdio: "pipe" });
  return { isRepo: true, clean: out.trim() === "" };
}

async function runRemediate(args) {
  const aiConfig = resolveAiConfig(args);
  if (!aiConfig) {
    console.error(`  ${C.red()}remediate needs an AI provider.${C.reset()}  e.g. --ai anthropic  (or --provider anthropic)`);
    process.exit(1);
  }

  const inputPaths = args.paths.length ? args.paths : ["."];
  const root = resolve(inputPaths[0]);

  // Writing to source files is only safe if the user can undo it.
  if (!args.dryRun) {
    const git = gitState(existsSync(root) && statSync(root).isFile() ? dirname(root) : root);
    if (!git.isRepo && !args.force) {
      console.error(`  ${C.red()}Not a git repository — fixes could not be undone.${C.reset()}`);
      console.error(`  Re-run with ${b("--dry-run")} to preview, or ${b("--force")} to write anyway.\n`);
      process.exit(1);
    }
    if (git.isRepo && !git.clean && !args.force) {
      console.error(`  ${C.red()}Working tree has uncommitted changes.${C.reset()}`);
      console.error(`  Commit or stash first so the fixes are reviewable, or pass ${b("--force")}.\n`);
      process.exit(1);
    }
  }

  // Collect + audit
  let stackId = args.stack;
  let allFiles = [];
  for (const p of inputPaths) allFiles.push(...collectFiles(p, stackId ?? "playwright"));
  if (!stackId) { stackId = detectStack(allFiles); allFiles = []; for (const p of inputPaths) allFiles.push(...collectFiles(p, stackId)); }
  if (!RUNNERS[stackId]) { console.error(`  Unknown stack: ${stackId}`); process.exit(1); }

  let ruleSet = { rules: [], disabled: [], errors: [], path: null };
  if (!args.noRules) {
    const rp = args.rulesFile ? resolve(args.rulesFile) : discoverRulesFile(root);
    if (rp) ruleSet = loadRulesFile(rp, stackId);
  }
  const disabledRuleIds = new Set(ruleSet.disabled);
  const runner = RUNNERS[stackId];
  const auditFn = (name, content) => {
    const r = runner(name, content, { disabledRuleIds });
    const custom = runFileRules(ruleSet.rules, name, content, { disabledRuleIds });
    return { findings: [...(r.findings ?? []), ...custom], overallScore: r.overallScore ?? 0 };
  };

  const wanted = (f) => args.severity === "all" ? true : f.severity === args.severity;
  const targets = [];
  for (const file of allFiles) {
    let content; try { content = readFileSync(file, "utf8"); } catch { continue; }
    const findings = auditFn(basename(file), content).findings.filter(wanted);
    if (findings.length) targets.push({ file, content, findings });
  }

  const sev = args.severity === "all" ? "all severities" : args.severity;
  console.log(`\n  ${C.cyan()}${C.bold()}🛠  Remediation agent${C.reset()}  ${dim(`· ${AUDIT_STACKS[stackId].name} · ${sev}`)}`);
  if (args.dryRun) console.log(`  ${C.yellow()}DRY RUN — nothing will be written${C.reset()}`);
  console.log(`  ${dim("─".repeat(64))}\n`);

  if (targets.length === 0) { console.log(`  ${C.green()}Nothing to fix.${C.reset()}\n`); return; }

  const batch = targets.slice(0, args.maxFiles);
  if (targets.length > batch.length) {
    console.log(`  ${dim(`${targets.length} files match; fixing the first ${batch.length} (--max-files to change)`)}\n`);
  }

  const applied = [], rejected = [];
  for (const { file, content, findings } of batch) {
    const fname = basename(file);
    process.stdout.write(`  ${dim("⏳")} ${fname.padEnd(46)} `);
    let proposed = null, err = null;
    try {
      const prompt = buildFixPrompt(fname, content, findings);
      const provider = aiConfig.provider;
      let text;
      if      (provider === "anthropic") text = await callAnthropic(prompt, aiConfig.apiKey, aiConfig.model);
      else if (provider === "bedrock")   text = await callBedrock(prompt, aiConfig);
      else if (provider === "vertex")    text = await callVertex(prompt, aiConfig);
      else if (provider === "openai")    text = await callOpenAI(prompt, aiConfig.apiKey, aiConfig.model);
      proposed = extractCode(text);
    } catch (e) { err = e.message; }

    if (err) { console.log(`${C.red()}✗ ${err}${C.reset()}`); rejected.push({ fname, reason: err }); continue; }

    const verdict = evaluateFix({ auditFn, filename: fname, original: content, proposed });
    if (!verdict.accept) {
      console.log(`${C.yellow()}skipped${C.reset()}  ${dim(verdict.reason)}`);
      rejected.push({ fname, reason: verdict.reason });
      continue;
    }

    const d = verdict.diff;
    console.log(`${C.green()}✓${C.reset()}  ${dim(`${d.before.critical}C/${d.before.warning}W → ${d.after.critical}C/${d.after.warning}W`)}`);
    if (args.dryRun) {
      for (const l of lineDiff(content, proposed).slice(0, 24)) {
        const col = l.type === "+" ? C.green() : l.type === "-" ? C.red() : C.gray();
        console.log(`      ${col}${l.type} ${l.text.slice(0, 96)}${C.reset()}`);
      }
      console.log();
    } else {
      writeFileSync(file, proposed, "utf8");
    }
    applied.push({ file, fname, diff: d });
  }

  console.log(`\n  ${dim("─".repeat(64))}`);
  console.log(`  ${C.green()}${C.bold()}${applied.length}${C.reset()} fixed   ${C.yellow()}${rejected.length}${C.reset()} skipped`);
  for (const r of rejected) console.log(`    ${dim(`· ${r.fname}: ${r.reason}`)}`);

  if (!args.dryRun && applied.length && (args.branch || args.commit)) {
    const cwd = existsSync(root) && statSync(root).isFile() ? dirname(root) : root;
    try {
      if (args.branch) { execSync(`git checkout -b ${JSON.stringify(args.branch)}`, { cwd, stdio: "pipe" }); console.log(`  branch: ${args.branch}`); }
      if (args.commit) {
        for (const a of applied) execSync(`git add ${JSON.stringify(a.file)}`, { cwd, stdio: "pipe" });
        const msg = `fix: cqs remediation — ${applied.length} file(s)\n\nApplied by cqs remediate; each fix was re-audited and only kept\nwhen it reduced findings without introducing a new critical.`;
        execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd, stdio: "pipe" });
        console.log(`  committed ${applied.length} file(s)`);
      }
    } catch (e) { console.error(`  ${C.red()}git step failed: ${e.message}${C.reset()}`); }
  }
  console.log();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help)       { printHelp();   process.exit(0); }
  if (args.command === "remediate") { await runRemediate(args); return; }
  if (args.listStacks) { printStacks(); process.exit(0); }
  if (args.readReport) {
    const report = printReportSummary(args.readReport);
    if (args.open && report) openHtmlReport(buildHtmlReport(report));
    process.exit(0);
  }

  const inputPaths = args.paths.length ? args.paths : ["."];

  // Collect all files first (for stack auto-detection)
  let allFiles = inputPaths.flatMap(p => {
    try { return collectFiles(p, args.stack ?? "playwright"); }
    catch { return []; }
  });

  // Determine stack
  let stackId = args.stack;
  if (!stackId) {
    stackId = detectStack(allFiles);
    if (args.output === "pretty") {
      console.log(`${dim(`  Auto-detected stack: ${stackId}`)}`);
    }
  }
  if (!RUNNERS[stackId]) {
    console.error(`Unknown stack: "${stackId}". Run cqs --list-stacks for valid IDs.`);
    process.exit(1);
  }

  // Re-collect with the correct stack file pattern
  allFiles = inputPaths.flatMap(p => {
    try { return collectFiles(p, stackId); }
    catch { return []; }
  });

  if (allFiles.length === 0) {
    const stack = AUDIT_STACKS[stackId];
    console.error(`  No ${stack.fileAccept} files found in: ${inputPaths.join(", ")}`);
    process.exit(1);
  }

  // Project rules from cqs-rules.json (explicit --rules, or discovered by walking up)
  let ruleSet = { rules: [], disabled: [], errors: [], path: null };
  if (!args.noRules) {
    const rulesPath = args.rulesFile
      ? resolve(args.rulesFile)
      : discoverRulesFile(inputPaths[0] ?? process.cwd());
    if (rulesPath) ruleSet = loadRulesFile(rulesPath, stackId);
  }
  if (ruleSet.path) {
    console.error(`  Project rules: ${ruleSet.rules.length} from ${ruleSet.path}`);
  }
  for (const err of ruleSet.errors) console.error(`  ${RULES_FILENAME}: ${err}`);
  const disabledRuleIds = new Set(ruleSet.disabled);

  // Run analysis
  const runner = RUNNERS[stackId];
  const results = [];
  const fileContents = {}; // keep for AI review
  for (const file of allFiles) {
    let content;
    try { content = readFileSync(file, "utf8"); }
    catch { console.error(`  Cannot read: ${file}`); continue; }

    fileContents[file] = content;
    const result = runner(basename(file), content, { disabledRuleIds });
    const custom = runFileRules(ruleSet.rules, basename(file), content, { disabledRuleIds });
    if (custom.length) result.findings = [...(result.findings ?? []), ...custom];
    // Tag each finding with its source file for later grouping
    for (const f of result.findings ?? []) f._file = file;
    results.push({ file, result });
  }

  // Output
  if (args.output === "json") {
    printJson(stackId, results, args);
  } else if (args.output === "summary") {
    printSummary(stackId, results);
  } else {
    printPretty(stackId, results, args);
  }

  // AI Review
  const aiConfig = resolveAiConfig(args);
  let aiResults = [];
  if (aiConfig) {
    aiResults = await runAiReview(results, fileContents, aiConfig);
  }

  // Open HTML report in browser if --open flag set
  if (args.open) {
    const stack = AUDIT_STACKS[stackId];
    const allFindings = results.flatMap(r => r.result.findings ?? []);
    const report = {
      stack: { id: stackId, name: stack.name },
      files: results.length,
      avgScore: results.length
        ? Math.round(results.reduce((s, r) => s + (r.result.overallScore ?? 0), 0) / results.length)
        : 0,
      summary: {
        critical: allFindings.filter(f => f.severity === "critical").length,
        warning:  allFindings.filter(f => f.severity === "warning").length,
        info:     allFindings.filter(f => f.severity === "info").length,
      },
      results: results.map(({ file, result }) => ({
        file,
        overallScore: result.overallScore,
        categoryScores: result.categoryScores,
        findings: result.findings,
      })),
    };
    openHtmlReport(buildHtmlReport(report, aiResults));
  }

  // Exit with non-zero if any criticals found (useful for CI)
  const hasCritical = results.some(r =>
    r.result.findings?.some(f => f.severity === "critical")
  );
  if (hasCritical && args.severity !== "info" && args.severity !== "warning") {
    process.exitCode = 1;
  }
}

main().catch(err => { console.error(err); process.exit(1); });
