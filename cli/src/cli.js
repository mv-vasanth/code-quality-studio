/**
 * cli.js — Main entry point for the qcBot CLI tool.
 *
 * Usage:
 *   qcbot check ./tests --stack playwright --threshold 80 --report
 */

import { program } from "commander";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, join, relative, basename } from "path";
import { glob } from "glob";
import { runLocalAnalysis } from "../../src/analyzers/index.js";
import { runCrossFileAnalysis } from "../../src/analyzers/crossFileAnalyzer.js";
import { AUDIT_STACKS } from "../../src/stacks/definitions.js";
import { buildHtmlReport } from "./reportBuilder.js";
import { runRemediation } from "./remediation.js";
import { registerPrReviewCommand } from "./prBot.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const TEAL   = "\x1b[36m";
const GRAY   = "\x1b[90m";
const DIM    = "\x1b[2m";

function gradeColor(score) {
  if (score >= 90) return GREEN;
  if (score >= 75) return TEAL;
  if (score >= 60) return YELLOW;
  return RED;
}
function gradeLabel(score) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Needs work";
}

function sevColor(sev) {
  if (sev === "critical") return RED;
  if (sev === "warning")  return YELLOW;
  return TEAL;
}

function bar(score, width = 20) {
  const filled = Math.round((score / 100) * width);
  const c = gradeColor(score);
  return c + "█".repeat(filled) + GRAY + "░".repeat(width - filled) + RESET;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function spinner(text) {
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${TEAL}${frames[i++ % frames.length]}${RESET} ${text}`);
  }, 80);
  return { stop: () => { clearInterval(id); process.stdout.write("\r\x1b[K"); } };
}

// ─── Core analysis ───────────────────────────────────────────────────────────

async function analyseFiles(filePaths, stackId, { parallel = 4 } = {}) {
  const results = new Array(filePaths.length).fill(null);
  const queue   = filePaths.map((fp, idx) => ({ fp, idx }));
  const workers = Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    while (queue.length) {
      const { fp, idx } = queue.shift();
      try {
        const content = await readFile(fp, "utf8");
        const name    = basename(fp);
        results[idx]  = { name, path: fp, content, result: runLocalAnalysis(stackId, name, content) };
      } catch (err) {
        results[idx] = { name: basename(fp), path: fp, content: "", error: err.message };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Command: check ──────────────────────────────────────────────────────────

async function runCheck(inputPath, opts) {
  const stackId = opts.stack;
  const threshold = Number(opts.threshold);
  const outputDir = opts.output || "./qcbot-report";
  const withReport = opts.report || opts.output;
  const withJson   = opts.json;
  const withCross  = opts.crossFile !== false;

  // Validate stack
  if (!AUDIT_STACKS[stackId]) {
    console.error(`${RED}✗ Unknown stack "${stackId}". Valid values: ${Object.keys(AUDIT_STACKS).join(", ")}${RESET}`);
    process.exit(1);
  }

  const stackDef = AUDIT_STACKS[stackId];
  const pattern  = stackDef.filePattern;

  // Resolve input path
  const absInput = resolve(process.cwd(), inputPath);
  if (!existsSync(absInput)) {
    console.error(`${RED}✗ Path not found: ${absInput}${RESET}`);
    process.exit(1);
  }

  // Discover files
  const spin1 = spinner(`Discovering ${stackDef.dropHint} files in ${TEAL}${relative(process.cwd(), absInput)}${RESET}…`);
  const allFiles = await glob("**/*", { cwd: absInput, absolute: true, nodir: true });
  const specFiles = allFiles.filter((f) => pattern.test(basename(f)));
  spin1.stop();

  if (specFiles.length === 0) {
    console.error(`${YELLOW}⚠  No ${stackDef.dropHint} files found in ${absInput}${RESET}`);
    process.exit(0);
  }

  console.log(`\n${BOLD}⚡ Code Quality Studio${RESET} ${GRAY}— ${stackDef.name}${RESET}`);
  console.log(`${GRAY}   ${specFiles.length} files · threshold ${threshold} · ${new Date().toLocaleString()}${RESET}\n`);

  // Analyse files
  const spin2 = spinner(`Analysing ${specFiles.length} files (up to ${opts.parallel || 4} in parallel)…`);
  const fileResults = await analyseFiles(specFiles, stackId, { parallel: Number(opts.parallel) || 4 });
  spin2.stop();

  // Cross-file pass
  if (withCross && fileResults.length >= 2) {
    const spin3 = spinner("Running cross-file duplicate detection…");
    const eligible = fileResults.filter((f) => f.result && f.content);
    const crossMap  = runCrossFileAnalysis(eligible);
    for (const fr of fileResults) {
      if (!fr.result || !crossMap[fr.name]) continue;
      fr.result = {
        ...fr.result,
        findings: [...(fr.result.findings || []), ...crossMap[fr.name]],
      };
    }
    spin3.stop();
  }

  // Aggregate
  const analysed   = fileResults.filter((f) => f.result);
  const scores     = analysed.map((f) => f.result.overallScore ?? 0);
  const avgScore   = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const allFindings = analysed.flatMap((f) => (f.result.findings || []).map((fi) => ({ ...fi, _file: f.name })));
  const critical   = allFindings.filter((f) => f.severity === "critical").length;
  const warnings   = allFindings.filter((f) => f.severity === "warning").length;
  const passed     = avgScore >= threshold;
  const gc         = gradeColor(avgScore);

  // ── Print summary ─────────────────────────────────────────────────────────
  console.log(`${BOLD}Results${RESET}`);
  console.log("─".repeat(52));
  console.log(`  Score    ${bar(avgScore)}  ${gc}${BOLD}${avgScore}${RESET} ${gc}${gradeLabel(avgScore)}${RESET}`);
  console.log(`  Files    ${BOLD}${analysed.length}${RESET} of ${fileResults.length} analysed`);
  console.log(`  Critical ${critical > 0 ? RED + BOLD : GREEN}${critical}${RESET}  Warnings ${warnings > 0 ? YELLOW : GREEN}${warnings}${RESET}  Total ${allFindings.length}`);
  console.log(`  Status   ${passed ? GREEN + BOLD + "✓ PASSED" : RED + BOLD + "✗ FAILED"} (threshold ${threshold})${RESET}`);
  console.log("─".repeat(52));

  // ── Per-file table ────────────────────────────────────────────────────────
  if (!opts.summary) {
    console.log(`\n${BOLD}File breakdown${RESET}`);
    for (const fr of analysed) {
      const s  = fr.result.overallScore ?? 0;
      const c  = gradeColor(s);
      const fc = (fr.result.findings || []).filter((f) => f.severity === "critical").length;
      console.log(
        `  ${c}${String(s).padStart(3)}${RESET}  ${bar(s, 14)}  ${
          fc > 0 ? RED + fc + " crit  " + RESET : GREEN + "✓      " + RESET
        }${GRAY}${fr.name}${RESET}`
      );
    }
  }

  // ── Top findings ──────────────────────────────────────────────────────────
  if (!opts.summary) {
    const top = allFindings
      .filter((f) => f.severity === "critical" || f.severity === "warning")
      .slice(0, opts.maxFindings ? Number(opts.maxFindings) : 10);

    if (top.length > 0) {
      console.log(`\n${BOLD}Top findings${RESET}`);
      for (const f of top) {
        const sc = sevColor(f.severity);
        console.log(`  ${sc}${f.severity.toUpperCase().padEnd(8)}${RESET} ${BOLD}${f.title}${RESET}`);
        console.log(`  ${GRAY}${f._file}${f.line != null ? ":" + f.line : ""}  ${f.ruleId ?? ""}${RESET}`);
      }
    }
  }

  // ── JSON output ───────────────────────────────────────────────────────────
  if (withJson) {
    const jsonPayload = {
      projectName: opts.project || basename(absInput),
      stackId,
      runAt: new Date().toISOString(),
      score: avgScore,
      grade: gradeLabel(avgScore),
      passed,
      threshold,
      summary: { critical, warnings, total: allFindings.length, files: analysed.length },
      files: analysed.map((f) => ({
        name: f.name,
        path: relative(process.cwd(), f.path),
        score: f.result.overallScore,
        findings: f.result.findings,
      })),
    };
    const jsonFile = typeof withJson === "string" ? withJson : join(outputDir, "report.json");
    await mkdir(outputDir, { recursive: true });
    await writeFile(jsonFile, JSON.stringify(jsonPayload, null, 2), "utf8");
    console.log(`\n${GREEN}✓${RESET} JSON report → ${TEAL}${jsonFile}${RESET}`);
  }

  // ── HTML report ───────────────────────────────────────────────────────────
  if (withReport) {
    const html = buildHtmlReport({
      projectName: opts.project || basename(absInput),
      stackId,
      runAt: new Date().toLocaleString(),
      files: analysed.map((f) => ({ name: relative(absInput, f.path), result: f.result })),
      threshold,
      passed,
    });
    await mkdir(outputDir, { recursive: true });
    const htmlFile = join(outputDir, "report.html");
    await writeFile(htmlFile, html, "utf8");
    console.log(`\n${GREEN}✓${RESET} HTML report → ${TEAL}${resolve(htmlFile)}${RESET}`);
    console.log(`  ${DIM}Open in browser: open ${resolve(htmlFile)}${RESET}`);
  }

  console.log();

  // ── Exit code ─────────────────────────────────────────────────────────────
  process.exit(passed ? 0 : 1);
}

// ─── CLI definition ──────────────────────────────────────────────────────────

program
  .name("qcbot")
  .description("Playwright & multi-stack test quality analyser — rules + AI + shareable HTML reports")
  .version("1.0.0");

program
  .command("check <path>")
  .description("Analyse test files in <path> and report quality findings")
  .option("-s, --stack <id>",      "Stack to analyse (playwright, typescript, java_api, …)", "playwright")
  .option("-t, --threshold <n>",   "Minimum passing score 0-100 — exit code 1 if below",    "80")
  .option("-p, --parallel <n>",    "Max files to analyse simultaneously",                    "4")
  .option("--report",              "Generate self-contained HTML report in ./qcbot-report/")
  .option("--json [file]",         "Write findings JSON (default: ./qcbot-report/report.json)")
  .option("--output <dir>",        "Custom output directory for report files",               "./qcbot-report")
  .option("--no-cross-file",       "Skip cross-file duplicate detection")
  .option("--summary",             "Print summary only (no per-file breakdown or top findings)")
  .option("--max-findings <n>",    "Max top findings to show in terminal output",            "10")
  .option("--project <name>",      "Project name for the report header")
  .action(runCheck);

program
  .command("stacks")
  .description("List all supported stacks and their file patterns")
  .action(() => {
    console.log(`\n${BOLD}Supported stacks${RESET}\n`);
    for (const [id, s] of Object.entries(AUDIT_STACKS)) {
      console.log(`  ${TEAL}${BOLD}${id.padEnd(20)}${RESET} ${s.name.padEnd(30)} ${GRAY}${s.dropHint}${RESET}`);
    }
    console.log();
  });

registerPrReviewCommand(program);

program
  .command("remediate <path>")
  .description("Agentic AI remediation — analyses files and auto-fixes critical/warning findings")
  .option("-s, --stack <id>",       "Stack to analyse",                                    "playwright")
  .option("--severity <level>",     "Which findings to fix: critical | warning | all",     "critical")
  .option("--provider <name>",      "AI provider: anthropic | google",                     "anthropic")
  .option("--api-key <key>",        "API key (or set ANTHROPIC_API_KEY / GOOGLE_AI_API_KEY)")
  .option("--model <id>",           "Override model ID")
  .option("--dry-run",              "Show what would be changed without writing any files")
  .option("--commit",               "Create a git commit after applying fixes")
  .option("--branch <name>",        "Create and switch to a new git branch before fixing")
  .option("--test-files-only",      "Safety flag: restrict fixes to recognised test files only (*.spec.*, *.test.*, test_*.py, *Test.java …). Default: on. Pass --no-test-files-only to disable.", true)
  .action(runRemediation);

program.parse(process.argv);
