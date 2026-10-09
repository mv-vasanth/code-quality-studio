/**
 * cqz — Code Quality Zone CLI
 * Entry point bundled by build.mjs → dist/cqz.js
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "fs";
import { resolve, extname, basename, relative, join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { execSync } from "child_process";
import process from "process";

/* global __CQZ_VERSION__, __CQZ_RULE_COUNT__, __CQZ_APP_JS__, __CQZ_APP_CSS__ */
const CQZ_VERSION = typeof __CQZ_VERSION__ !== "undefined" ? __CQZ_VERSION__ : "1.0.0";
// The built web app, inlined at bundle time. Empty when the CLI was built
// without `npm run build` having produced dist/assets — see build.mjs.
// Set by runStack in --baseline mode; the exit code must reflect findings
// beyond the baseline, not every finding in the repo.
let baselineNewCriticals = 0;

const CQZ_RULES   = typeof __CQZ_RULE_COUNT__ !== "undefined" ? __CQZ_RULE_COUNT__ : 0;
const CQZ_APP_JS  = typeof __CQZ_APP_JS__  !== "undefined" ? __CQZ_APP_JS__  : "";
const CQZ_APP_CSS = typeof __CQZ_APP_CSS__ !== "undefined" ? __CQZ_APP_CSS__ : "";

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
import { isTestAutomationStack } from "../../src/stacks/definitions.js";
import { AUDIT_STACKS }                from "../../src/stacks/definitions.js";
import { RULES_FILENAME, discoverRulesFile, loadRulesFile, runFileRules } from "../../src/rules/fileRules.js";
import { buildFixPrompt, extractCode, evaluateFix, lineDiff } from "../../src/rules/remediate.js";
import { formatVerification } from "../../src/rules/verifyFix.js";
import { buildReview, reviewSummary } from "../../src/rules/prReview.js";
import { buildFindingsReportPayload } from "../../src/report/buildPayload.js";
import { buildCompleteHtmlReport } from "../../src/report/buildCompleteReport.js";
import { buildAppHtmlReport, buildAppShellHtml, workspaceFromResults } from "../../src/report/buildAppReport.js";
import { withEvidence } from "../../src/shared/findingEvidence.js";
import { applyCrossFileAnalysis } from "../../src/analyzers/applyCrossFile.js";
import { startLocalServer } from "./localServer.js";
import {
  allAddonStatus, installAddon, removeAddon, startAddon, stopAddon,
  stopAllAddons, callAddon,
} from "./addons.js";
import { classifyFile, routeFileList, routeFilesByStack as routeByStack, detectDominantStack }
  from "../../src/analyzers/routeFiles.js";
import { countFindings, mergeCounts, buildBaseline, diffAgainstBaseline } from "../../src/rules/baseline.js";

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
    help: false, version: false, listStacks: false,
    baseline: null, baselineWrite: null, changed: false, since: null,
    app: false, appOnly: false, port: null, allowWrite: false, readReport: null, open: false, noReport: false,
    rulesFile: null, noRules: false,
    command: null, dryRun: false, commit: false, branch: null, maxFiles: 10, force: false,
    repo: null, pr: null, token: null, threshold: null, maxComments: 30, onlyAdded: false,
    // AI flags
    ai: null, apiKey: null, model: null,
    awsRegion: null, awsAccessKey: null, awsSecretKey: null,
    vertexProject: null, vertexLocation: null, vertexKeyFile: null,
  };
  let i = 0;
  if (argv[0] === "remediate") { args.command = "remediate"; args.severity = "critical"; i = 1; }
  if (argv[0] === "pr-review") { args.command = "pr-review"; i = 1; }
  if (argv[0] === "mcp-config") { args.command = "mcp-config"; i = 1; }
  if (argv[0] === "serve") { args.command = "serve"; i = 1; }
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--help" || a === "-h")        { args.help = true; }
    else if (a === "--version" || a === "-v" || a === "-V") { args.version = true; }
    else if (a === "--list-stacks")          { args.listStacks = true; }
    else if (a === "--no-color")             { useColor = false; }
    else if ((a === "--stack" || a === "-s") && argv[i+1])  { args.stack = argv[++i]; }
    else if ((a === "--severity" || a === "-S") && argv[i+1]) { args.severity = argv[++i]; }
    else if ((a === "--category" || a === "-c") && argv[i+1]) { args.category = argv[++i]; }
    else if ((a === "--output" || a === "-o") && argv[i+1])   { args.output = argv[++i]; }
    else if ((a === "--read-report" || a === "-r") && argv[i+1]) { args.readReport = argv[++i]; }
    else if (a === "--open")                                      { args.open = true; }
    else if (a === "--no-report" || a === "--no-open")            { args.noReport = true; }
    else if (a === "--port" && argv[i+1])                         { args.port = parseInt(argv[++i], 10); }
    else if (a === "--allow-write")                               { args.allowWrite = true; }
    else if (a === "--app" || a === "--include-app")              { args.app = true; }
    else if (a === "--app-only")                                  { args.appOnly = true; }
    else if (a === "--changed")                                   { args.changed = true; }
    else if (a === "--since" && argv[i+1])                        { args.since = argv[++i]; }
    else if (a === "--baseline" && argv[i+1])                     { args.baseline = argv[++i]; }
    else if (a === "--baseline-write" && argv[i+1])               { args.baselineWrite = argv[++i]; }
    else if (a === "--rules")                                     { args.rulesFile = argv[++i]; }
    else if (a === "--no-rules")                                  { args.noRules = true; }
    else if (a === "--dry-run")                                   { args.dryRun = true; }
    else if (a === "--commit")                                    { args.commit = true; }
    else if (a === "--branch" && argv[i+1])                       { args.branch = argv[++i]; }
    else if (a === "--max-files" && argv[i+1])                    { args.maxFiles = parseInt(argv[++i], 10) || 10; }
    else if (a === "--force")                                     { args.force = true; }
    else if (a === "--repo" && argv[i+1])                         { args.repo = argv[++i]; }
    else if (a === "--pr" && argv[i+1])                           { args.pr = argv[++i]; }
    else if (a === "--token" && argv[i+1])                        { args.token = argv[++i]; }
    else if (a === "--threshold" && argv[i+1])                    { args.threshold = parseInt(argv[++i], 10); }
    else if (a === "--max-comments" && argv[i+1])                 { args.maxComments = parseInt(argv[++i], 10) || 30; }
    else if (a === "--only-added")                                { args.onlyAdded = true; }
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
  if (!existsSync(abs)) {
    console.error(`  Path not found: ${abs}`);
    // A bare word that is not a path is usually a mistyped or unsupported
    // subcommand — on an older build "remediate" lands here as a path.
    if (!inputPath.includes("/") && !inputPath.includes(".")) {
      const known = ["remediate", "pr-review"];
      const near = known.find((k) => k.startsWith(inputPath.slice(0, 4)) || inputPath.startsWith(k.slice(0, 4)));
      if (near) {
        console.error(`  Did you mean \`cqz ${near} ...\`? This build is ${CQZ_VERSION} — run \`cqz --help\` to see its commands.`);
      }
    }
    process.exit(1);
  }
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


/**
 * Extensions present under the given paths that no stack claims.
 *
 * Silently ignoring a file is the same failure as silently ignoring a stack:
 * the report looks complete and isn't. A Go service or a Ruby deploy script
 * sitting beside the audited code gets no rules, and the user should be told
 * that rather than left to assume 0 findings means 0 problems.
 */
function unsupportedExtensions(inputPaths, analysedFiles) {
  const analysed = new Set(analysedFiles);
  const counts = new Map();
  const seen = new Set();

  function walk(dir) {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") walk(full);
      } else if (entry.isFile() && !analysed.has(full) && !seen.has(full)) {
        seen.add(full);
        const ext = extname(entry.name).toLowerCase();
        // Only count things that look like source; skip lockfiles, images, docs.
        if (!ext || IGNORED_EXTS.has(ext)) continue;
        counts.set(ext, (counts.get(ext) ?? 0) + 1);
      }
    }
  }
  for (const p of inputPaths) {
    const abs = resolve(p);
    try { if (statSync(abs).isDirectory()) walk(abs); } catch { /* not a dir */ }
  }
  return counts;
}

// Not source, or not something a quality rule would have an opinion on.
const IGNORED_EXTS = new Set([
  ".md", ".txt", ".log", ".lock", ".map", ".snap", ".png", ".jpg", ".jpeg",
  ".gif", ".svg", ".ico", ".webp", ".pdf", ".zip", ".gz", ".tgz", ".woff",
  ".woff2", ".ttf", ".eot", ".mp4", ".mov", ".csv", ".env", ".gitignore",
  ".editorconfig", ".npmrc", ".nvmrc", ".prettierrc", ".DS_Store",
]);

// ── Auto-detect stack ─────────────────────────────────────────────────────────

/**
 * Which stack owns each file, when the user did not name one.
 *
 * detectStack picks a single winner for the whole run, which quietly discards
 * everything else: a repo with Playwright specs, React components and a Java
 * service reported one file of three, and missed a SQL injection. Route per
 * file instead.
 *
 * Extensions overlap, so order matters. Test-framework stacks are checked
 * first because their patterns are the narrow ones (`*.spec.ts` is a
 * Playwright spec before it is a TypeScript file). Where an extension alone
 * cannot decide — .java and .py are used by several stacks — sniff the file
 * for the framework's own imports.
 */
// Reading the head of a file is Node-specific; the router stays portable.
const readHead = (f) => {
  try { return readFileSync(f, "utf8").slice(0, 4000); } catch { return ""; }
};
const routeFilesByStack = (paths) => routeByStack(paths, { collectFiles, readHead });


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
${b("cqz")} — Code Quality Zone CLI  ${dim(`v${CQZ_VERSION}`)}

${b("USAGE")}
  cqz [path...]                   Analyse files/folders (defaults to current directory)
  cqz --list-stacks               List all available stacks
  cqz --read-report <file>        Print summary of a saved JSON report
  cqz remediate [path...]         AI-fix findings, verifying each fix before keeping it
  cqz pr-review                   Review a pull request with inline GitHub comments
  cqz serve --open                Open the full studio in your browser
  cqz serve [--port 4000]         ...or just the local API, for scripts
                                  (add --allow-write to let it edit files)
  cqz mcp-config [client]         Print MCP client config with correct paths
                                  (client: cursor | claude)

${b("OPTIONS")}
  -s, --stack  <id>               Force a stack (see --list-stacks for IDs)
  -S, --severity <level>          Filter findings: all | critical | warning | info
  -c, --category <id>             Filter by category id
  -o, --output  <fmt>             Output format: pretty | json | summary
  -r, --read-report <file>        Read a saved JSON report and print summary
      --open                      Force the report even when piped or in CI
      --no-report                 Skip the report for this run (alias: --no-open)
      --app                       Also audit application code (off by default)
      --app-only                  Audit only application code, not tests
      --changed                   Audit only files changed on this branch
      --since <ref>               Base ref for --changed (default: origin/main)
      --baseline-write <file>     Record current findings as accepted
      --baseline <file>           Fail only on findings beyond the baseline
      --rules <file>              Use this cqz-rules.json (default: discovered by walking up)
      --no-rules                  Ignore any cqz-rules.json found
      --no-color                  Disable ANSI colours
  -h, --help                      Show this help
  -v, --version                   Print the version and exit

${b("EXAMPLES")}
  cqz ./tests/
  cqz ./tests/ --stack cypress --severity critical
  cqz ./tests/ --output json > report.json
  cqz ./tests/                                           # report opens automatically
  cqz ./tests/ --no-report                               # terminal output only
  cqz --read-report report.json --open                   # open saved report in browser
  cqz ./e2e/ -s selenium_java -S warning
  cqz . --list-stacks

${b("AI REVIEW")}  ${dim(`(adds second-eye review on top of ${CQZ_RULES} rules)`)}
  cqz ./tests/ --ai anthropic --api-key sk-ant-xxx
  cqz ./tests/ --ai bedrock --aws-region us-east-1 --aws-access-key KEY --aws-secret-key SECRET
  cqz ./tests/ --ai vertex --vertex-project my-proj --vertex-location us-central1 --vertex-key-file sa.json

  ${dim("Or set via environment variables (recommended for CI):")}
  ANTHROPIC_API_KEY=sk-ant-xxx cqz ./tests/ --ai anthropic
  AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=K AWS_SECRET_ACCESS_KEY=S cqz ./tests/ --ai bedrock
  VERTEX_PROJECT=p VERTEX_LOCATION=us-central1 GOOGLE_APPLICATION_CREDENTIALS=sa.json cqz ./tests/ --ai vertex

${b("REMEDIATE")}  ${dim("(AI writes the fix; every fix is re-audited before it is kept)")}
  cqz remediate ./tests/ --ai anthropic --dry-run      ${dim("preview the diff, write nothing")}
  cqz remediate ./tests/ --ai anthropic                ${dim("apply fixes in place")}
  cqz remediate ./tests/ --ai anthropic --branch fix/cqz --commit

      --dry-run                   Show the diff without writing
      --branch <name>             Create a branch before committing
      --commit                    git commit the applied fixes
      --severity <level>          Which findings to fix (default: critical)
      --max-files <n>             Cap files per run (default: 10)
      --force                     Write even if the git tree is dirty

  ${dim("A fix is rejected if it introduces a new critical, changes nothing, or")}
  ${dim("drops half the file. Writing is refused unless the git tree is clean.")}

${b("PR REVIEW")}  ${dim("(inline GitHub comments on the changed files)")}
  cqz pr-review --repo owner/name --pr 42 --token ghp_xxx --dry-run
  cqz pr-review --stack playwright --threshold 80      ${dim("in GitHub Actions")}

      --repo <owner/name>         Defaults to GITHUB_REPOSITORY
      --pr <number>               Auto-detected from the Actions event
      --token <ghp_...>           Defaults to GITHUB_TOKEN
      --threshold <n>             Exit non-zero when the score is below n
      --dry-run                   Print the review instead of posting it
      --only-added                Comment only on lines the PR added
      --max-comments <n>          Cap inline comments (default: 30)

  ${dim("Findings on lines outside the diff cannot be commented inline, so they")}
  ${dim("are collected into the review summary instead of being dropped.")}
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

/** The --severity / --category filter. One definition, used by every output mode. */
function matchesFilters(f, args) {
  return (args.severity === "all" || f.severity === args.severity)
      && (!args.category || f.category === args.category);
}


/**
 * One document covering several stacks.
 *
 * `stacks` carries the per-stack detail; the top level aggregates so a CI
 * script can read a single score and finding count without knowing how many
 * languages the repo happens to contain.
 */
function printJsonMulti(perStack, args) {
  const stacks = perStack.map(([stackId, results]) => {
    const stack = AUDIT_STACKS[stackId];
    const shown = results.flatMap((r) => r.result.findings ?? []).filter((f) => matchesFilters(f, args));
    return {
      stack: { id: stackId, name: stack.name },
      files: results.length,
      avgScore: results.length
        ? Math.round(results.reduce((s, r) => s + (r.result.overallScore ?? 0), 0) / results.length)
        : 0,
      summary: {
        critical: shown.filter((f) => f.severity === "critical").length,
        warning: shown.filter((f) => f.severity === "warning").length,
        info: shown.filter((f) => f.severity === "info").length,
      },
      results: results.map(({ file, result }) => ({
        file,
        overallScore: result.overallScore,
        categoryScores: result.categoryScores,
        findings: (result.findings ?? []).filter((f) => matchesFilters(f, args)),
      })),
    };
  });

  const allFiles = stacks.reduce((n, s) => n + s.files, 0);
  console.log(JSON.stringify({
    stacks,
    files: allFiles,
    avgScore: allFiles
      ? Math.round(stacks.reduce((sum, s) => sum + s.avgScore * s.files, 0) / allFiles)
      : 0,
    summary: {
      critical: stacks.reduce((n, s) => n + s.summary.critical, 0),
      warning: stacks.reduce((n, s) => n + s.summary.warning, 0),
      info: stacks.reduce((n, s) => n + s.summary.info, 0),
    },
  }, null, 2));
}

// ── Pretty output ─────────────────────────────────────────────────────────────
function printPretty(stackId, results, args) {
  const stack = AUDIT_STACKS[stackId];
  const allFindings = results.flatMap(r => r.result.findings ?? []);
  const shown = allFindings.filter(f =>
    matchesFilters(f, args)
  );

  const crit = allFindings.filter(f => f.severity === "critical").length;
  const warn = allFindings.filter(f => f.severity === "warning").length;
  const info = allFindings.filter(f => f.severity === "info").length;
  const avgScore = results.length
    ? Math.round(results.reduce((s, r) => s + (r.result.overallScore ?? 0), 0) / results.length)
    : 0;
  const { letter, color: gc } = grade(avgScore);

  console.log();
  console.log(`${C.cyan()}${C.bold()}  Code Quality Zone${C.reset()}  ${dim("─")} ${stack.icon} ${b(stack.name)}`);
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
function printSummary(stackId, results, args) {
  const stack = AUDIT_STACKS[stackId];
  const allFindings = results.flatMap(r => r.result.findings ?? []);
  const shown = allFindings.filter(f => matchesFilters(f, args));
  const crit = shown.filter(f => f.severity === "critical").length;
  const warn = shown.filter(f => f.severity === "warning").length;
  const avgScore = results.length
    ? Math.round(results.reduce((s, r) => s + (r.result.overallScore ?? 0), 0) / results.length)
    : 0;
  console.log(`cqz ${stack.icon} ${stack.name} · ${results.length} files · score ${avgScore} · ${crit} critical · ${warn} warning`);
  // Filtering the display must not hide a failing build: count criticals across
  // everything, matching printPretty's convention.
  if (allFindings.some(f => f.severity === "critical")
      && args.severity !== "info" && args.severity !== "warning") {
    process.exitCode = 1;
  }
}

// ── JSON output ───────────────────────────────────────────────────────────────
function printJson(stackId, results, args) {
  const stack = AUDIT_STACKS[stackId];
  const allFindings = results.flatMap(r => r.result.findings ?? []).filter(f =>
    matchesFilters(f, args)
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
      findings: result.findings.filter(f => matchesFilters(f, args)),
    })),
  }, null, 2));
}

/**
 * Print a ready-to-paste MCP client config.
 *
 * Every MCP client needs an absolute path to the server, because GUI-launched
 * apps on macOS inherit a minimal PATH that contains neither nvm's node nor
 * anything installed through it. Making each user work that out by hand is
 * how people end up pointing at a stale copy in another Node version's tree.
 * The tool knows both paths exactly — process.execPath is the node currently
 * running it, and the server sits beside this bundle — so it emits them.
 */
function printMcpConfig(which) {
  const here = dirname(fileURLToPath(import.meta.url));
  const server = join(here, "cqz-mcp.js");
  const entry = { command: process.execPath, args: [server] };

  if (!existsSync(server)) {
    console.error(`\n  Cannot find the MCP server next to this CLI:\n    ${server}`);
    console.error("  Reinstall with: npm install -g cqz-audit@latest\n");
    process.exit(1);
  }

  const block = JSON.stringify({ mcpServers: { cqz: entry } }, null, 2);
  const targets = {
    cursor: "~/.cursor/mcp.json",
    claude: "~/Library/Application Support/Claude/claude_desktop_config.json",
  };
  const file = targets[which] ?? "your MCP client's config file";

  console.log(`\n  ${b("Add this to")} ${file}\n`);
  console.log(block.split("\n").map((l) => "    " + l).join("\n"));
  console.log(`\n  ${dim("If the file already has other servers, add only the \"cqs\" entry")}`);
  console.log(`  ${dim("inside the existing \"mcpServers\" block \u2014 keep the commas valid.")}`);
  console.log(`\n  ${dim("Then quit the app completely and reopen it.")}\n`);

  if (which === "claude") {
    console.log(`  ${dim("Claude Code users can skip the file entirely:")}`);
    console.log(`    claude mcp add cqz ${process.execPath} ${server}\n`);
  }
}

/**
 * Run the local companion API.
 *
 * Audit is read-only and always available. Remediate dry-runs by default and
 * refuses to write unless the server was started with --allow-write, because
 * a long-lived local process that can edit your working tree deserves more
 * than one gate.
 */
async function runServe(args) {
  const handlers = {
    async audit({ path, stack, app, appOnly }) {
      const paths = [path ?? "."];
      const byStack = stack
        ? new Map([[stack, collectFiles(paths[0], stack)]])
        : routeFilesByStack(paths);
      const wanted = (id) => appOnly ? !isTestAutomationStack(id)
                            : app     ? true
                            :           isTestAutomationStack(id);
      const out = [];
      for (const [id, files] of byStack) {
        if (!stack && !wanted(id)) continue;
        const runner = RUNNERS[id];
        if (!runner) continue;
        const results = files.map((file) => {
          const content = readFileSync(file, "utf8");
          return { file, result: runner(basename(file), content, { disabledRuleIds: new Set() }) };
        });
        const findings = results.flatMap((r) => r.result.findings ?? []);
        out.push({
          stack: { id, name: AUDIT_STACKS[id].name, icon: AUDIT_STACKS[id].icon },
          files: results.length,
          summary: {
            critical: findings.filter((f) => f.severity === "critical").length,
            warning:  findings.filter((f) => f.severity === "warning").length,
            info:     findings.filter((f) => f.severity === "info").length,
          },
          results: results.map(({ file, result }) => ({
            file, overallScore: result.overallScore,
            categoryScores: result.categoryScores, findings: result.findings,
          })),
        });
      }
      return { stacks: out };
    },

    // Optional extras — today just cqz-ai. The audit engine never imports
    // any of them; it installs them into ~/.cqs/addons, runs them as child
    // processes and proxies HTTP. An add-on that is broken, missing or
    // uninstallable leaves everything else working.
    addons: {
      list: () => allAddonStatus(),

      // Drop the model but keep the add-on listening. It reloads on the next
      // request, so this is "give the RAM back now", not "turn the feature off".
      async unload(id) {
        const out = await callAddon(id, "/unload", {});
        return out.ok === false ? out : { ok: true, ...out.body };
      },

      async install(id) {
        const log = [];
        const out = await installAddon(id, { onLine: (l) => log.push(l) });
        if (!out.ok) return out;
        // Installing and then not being able to use it until you find the
        // right button is a pointless extra step.
        const started = await startAddon(id).catch((e) => ({ ok: false, error: e.message }));
        return { ...out, started, log: log.slice(-20) };
      },

      async remove(id, body) {
        return removeAddon(id, { purgeModels: Boolean(body?.purgeModels) });
      },

      async enable(id) {
        try { return await startAddon(id); }
        catch (e) { return { ok: false, error: e.message }; }
      },

      async disable(id) {
        return stopAddon(id);
      },

      proxy: callAddon,
    },

    async remediate({ path, dryRun }) {
      // Deliberately not implemented yet: the fix loop needs an AI provider
      // and a verified-edit cycle, and shipping a half-wired write path to a
      // browser is how working trees get mangled.
      return {
        error: "Not implemented yet",
        detail: dryRun
          ? "Use `cqz remediate <path> --ai <provider> --dry-run` from a terminal for now."
          : "Writing from the browser is not wired up. Use the CLI.",
      };
    },
  };

  // The app is already inside this bundle, so serve it rather than asking the
  // user to run a second thing on a second port and paste a token between the
  // two. Served from the same origin as the API, it needs neither.
  const renderApp = CQZ_APP_JS
    ? (token) => buildAppShellHtml({
        appJs: CQZ_APP_JS,
        appCss: CQZ_APP_CSS,
        title: "Code Quality Zone",
        globals: {
          __CQZ_SERVER__: {
            token,
            version: CQZ_VERSION,
            cwd: process.cwd(),
            allowWrite: Boolean(args.allowWrite),
            // Same-origin, the app trusts this instead of calling /health —
            // so anything /health advertises has to be advertised here too,
            // or the UI silently decides the feature does not exist.
            addons: true,
          },
        },
      })
    : null;

  const { port, token } = await startLocalServer(handlers, {
    port: args.port ?? undefined,
    allowWrite: args.allowWrite,
    version: CQZ_VERSION,
    cwd: process.cwd(),
    renderApp,
    // Add-ons run as our children; they must not outlive us.
    onClose: stopAllAddons,
  });

  const url = `http://127.0.0.1:${port}`;

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, () => {
      stopAllAddons().finally(() => process.exit(0));
    });
  }

  // Auto-start all installed add-ons so the studio has them ready on load.
  allAddonStatus().then((addons) => {
    for (const a of addons) {
      if (a.installed && !a.running) {
        startAddon(a.id).catch(() => {});
      }
    }
  }).catch(() => {});

  console.log(`\n  ${b("cqz serve")} ${dim(`v${CQZ_VERSION}`)}`);
  if (renderApp) {
    console.log(`\n  ${C.cyan()}${C.bold()}Open${C.reset()}  ${url}`);
    console.log(`  ${dim("The page signs itself in \u2014 no token to copy.")}`);
  } else {
    console.log(`  ${dim("listening on")} ${url} ${dim("(this machine only)")}`);
    console.log(`  ${dim("no app embedded in this build \u2014 API only")}`);
  }
  console.log(`  ${dim("writes:")} ${args.allowWrite ? C.yellow() + "enabled" + C.reset() : "disabled " + dim("(--allow-write to enable)")}`);

  if (args.open) {
    const cmd = process.platform === "win32" ? `start "" "${url}"` :
                process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    try { execSync(cmd); } catch { /* the URL is printed above either way */ }
  }

  // Still printed, because the API is usable on its own \u2014 from curl, from a
  // script, or from an app you are running on another port yourself.
  console.log(`\n  ${dim("Token for this run, if you call the API directly:")}`);
  console.log(`    ${dim(token)}`);
  console.log(`    ${dim(`curl -s ${url}/health`)}\n`);
  console.log(dim("  Ctrl-C to stop.\n"));
}

// ── HTML Report Generator ─────────────────────────────────────────────────────
/**
 * Render the same HTML report the web app produces.
 *
 * The CLI used to carry its own cut-down builder, so `--open` looked nothing
 * like the app. buildCompleteHtmlReport is a pure string builder, so it works
 * here as-is; only the payload shape needs adapting.
 */
/**
 * Render the full app as a single offline file.
 *
 * Returns "" when the app wasn't embedded at build time, so callers fall back
 * to the flat report rather than writing a blank page.
 */
function renderAppReport(stackId, fileResults, { projectName } = {}) {
  if (!CQZ_APP_JS) return "";
  const stack = AUDIT_STACKS[stackId] ?? AUDIT_STACKS.playwright;
  const workspace = workspaceFromResults({
    stackId,
    projectName: projectName || stack.defaultProjectName || `cqz audit — ${stack.name}`,
    results: fileResults,
  });
  return buildAppHtmlReport({
    appJs: CQZ_APP_JS,
    appCss: CQZ_APP_CSS,
    workspace,
    title: `${workspace.projectName} — Code Quality Zone`,
  });
}

function renderWebReport(stackId, fileResults, { projectName, aiResults = [] } = {}) {
  const stack = AUDIT_STACKS[stackId] ?? AUDIT_STACKS.playwright;
  const payload = buildFindingsReportPayload({
    projectName: projectName || `cqz audit — ${stack.name}`,
    // filesWithViewResults reads resultLocal for the "local" view and copies it
    // onto .result — passing only .result yields an empty report.
    files: fileResults.map(({ file, result }) => ({
      name: typeof file === "string" ? file : String(file),
      status: "done",
      resultLocal: result,
      result,
    })),
    categories: stack.categories,
    analysisModeLabel: aiResults.length ? "Standard rules + AI review" : "Standard rules",
    auditStack: stack,
  });
  let html = buildCompleteHtmlReport(payload);
  if (aiResults.length) {
    const section = aiResults.filter((a) => a.text).map((a) =>
      `<section style="margin:24px 0;padding:16px;border:1px solid #e2e8f0;border-radius:8px">
         <h3 style="margin:0 0 8px">${a.fname}</h3>
         <pre style="white-space:pre-wrap;font-size:13px;line-height:1.6;margin:0">${
           String(a.text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
         }</pre>
       </section>`).join("\n");
    if (section) {
      html = html.replace(/<\/body>/i,
        `<div style="max-width:1100px;margin:32px auto;padding:0 24px">
           <h2>AI second-eye review</h2>${section}
         </div></body>`);
    }
  }
  return html;
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

/**
 * Write the report, and open it unless the caller only wants the path.
 *
 * A polyglot repo produces one report per stack — the embedded app carries a
 * single stackId, so its category rows, radar and roadmap all belong to one
 * stack and several cannot be merged into one file yet (see docs/PLANNED.md).
 * Opening six browser tabs because a repo has six stacks is worse than
 * printing six paths, so only the largest stack opens.
 *
 * Named by stack rather than by timestamp: six files called
 * cqz-report-1791475576139.html are indistinguishable.
 */
function openHtmlReport(htmlContent, { stackId = null, open = true } = {}) {
  const label = stackId ? `-${stackId}` : "";
  const tmp = join(tmpdir(), `cqz-report${label}-${Date.now()}.html`);
  writeFileSync(tmp, htmlContent, "utf8");
  if (open) {
    const cmd = process.platform === "win32" ? `start "" "${tmp}"` :
                 process.platform === "darwin" ? `open "${tmp}"` : `xdg-open "${tmp}"`;
    try { execSync(cmd); } catch { /* ignore */ }
  }
  const stack = stackId ? AUDIT_STACKS[stackId] : null;
  const who = stack ? `${stack.icon} ${stack.name}` : "";
  console.log(`  ${dim(open ? "HTML report:" : "also written:")} ${tmp}${who ? dim("  " + who) : ""}`);
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
  console.log(`${C.cyan()}${C.bold()}  Code Quality Zone${C.reset()}  ${dim("─")}  ${b("Report Summary")}`);
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
// ── Remediation agent (cqz remediate) ────────────────────────────────────────
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
  if (stackId) {
    for (const p of inputPaths) allFiles.push(...collectFiles(p, stackId));
  } else {
    // Route by content, not filename. Page objects are not named *.spec.ts,
    // so the old filename scorer judged them as plain TypeScript — and this
    // agent edits files, so the wrong rule set does real damage.
    const byStack = routeFilesByStack(inputPaths);
    if (byStack.size === 0) {
      console.error(`  No supported files found in: ${inputPaths.join(", ")}`);
      process.exit(1);
    }
    const [best] = [...byStack.entries()].sort((a, b) => b[1].length - a[1].length);
    stackId = best[0];
    allFiles = best[1];
    if (byStack.size > 1) {
      const others = [...byStack.keys()].filter((id) => id !== stackId);
      console.error(`  ${dim(`Fixing ${AUDIT_STACKS[stackId].name} only; also found: ${others.map((id) => AUDIT_STACKS[id].name).join(", ")}. Use --stack to choose another.`)}`);
    }
  }
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
        const msg = `fix: cqz remediation — ${applied.length} file(s)\n\nApplied by cqz remediate; each fix was re-audited and only kept\nwhen it reduced findings without introducing a new critical.\n`;
        execSync("git commit -F -", { cwd, input: msg, stdio: ["pipe", "pipe", "pipe"] });
        console.log(`  committed ${applied.length} file(s)`);
      }
    } catch (e) { console.error(`  ${C.red()}git step failed: ${e.message}${C.reset()}`); }
  }
  console.log();
}

// ── PR review bot (cqz pr-review) ────────────────────────────────────────────
const GH_API = process.env.GITHUB_API_URL || "https://api.github.com";

async function gh(path, token, init = {}) {
  const res = await fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try { detail = JSON.parse(text).message || detail; } catch { /* keep raw */ }
    throw new Error(`GitHub ${res.status} on ${path}: ${detail}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Fill in repo / pr / token from the GitHub Actions environment when not passed. */
function resolvePrContext(args) {
  const token = args.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  let repo = args.repo || process.env.GITHUB_REPOSITORY;
  let pr = args.pr;

  if (!pr && process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      pr = ev.pull_request?.number ?? ev.number;
    } catch { /* fall through to GITHUB_REF */ }
  }
  if (!pr && process.env.GITHUB_REF) {
    const m = /refs\/pull\/(\d+)\//.exec(process.env.GITHUB_REF);
    if (m) pr = m[1];
  }
  return { token, repo, pr: pr ? String(pr) : null };
}

async function runPrReview(args) {
  const { token, repo, pr } = resolvePrContext(args);
  const missing = [];
  if (!repo) missing.push("--repo owner/name (or GITHUB_REPOSITORY)");
  if (!pr) missing.push("--pr <number> (auto-detected in GitHub Actions)");
  if (!token && !args.dryRun) missing.push("--token <ghp_…> (or GITHUB_TOKEN)");
  if (missing.length) {
    console.error(`  ${C.red()}pr-review is missing:${C.reset()}`);
    for (const m of missing) console.error(`    ${m}`);
    process.exit(1);
  }
  const [owner, name] = repo.split("/");

  console.log(`\n  ${C.cyan()}${C.bold()}🔍 PR review${C.reset()}  ${dim(`· ${repo} #${pr}`)}`);
  if (args.dryRun) console.log(`  ${C.yellow()}DRY RUN — nothing will be posted${C.reset()}`);
  console.log(`  ${dim("─".repeat(64))}\n`);

  // 1. changed files
  let prFiles = [];
  if (token) {
    for (let page = 1; page <= 10; page++) {
      const batch = await gh(`/repos/${owner}/${name}/pulls/${pr}/files?per_page=100&page=${page}`, token);
      prFiles.push(...batch);
      if (batch.length < 100) break;
    }
  } else {
    console.error(`  ${C.red()}--dry-run still needs a token to read the PR diff.${C.reset()}\n`);
    process.exit(1);
  }
  const live = prFiles.filter((f) => f.status !== "removed");
  console.log(`  ${live.length} changed file(s) in the PR`);

  // 2. audit each, preferring the local checkout
  let stackId = args.stack;
  if (!stackId) {
    // Changed files may exist only in the PR, so read from the local checkout
    // where present and fall back to the filename alone where not.
    stackId = detectDominantStack(
      live.map((f) => f.filename),
      (f) => { try { return readFileSync(f, "utf8").slice(0, 4000); } catch { return ""; } },
    );
  }
  const runner = RUNNERS[stackId];
  if (!runner) { console.error(`  Unknown stack: ${stackId}`); process.exit(1); }

  let ruleSet = { rules: [], disabled: [], errors: [], path: null };
  if (!args.noRules) {
    const rp = args.rulesFile ? resolve(args.rulesFile) : discoverRulesFile(process.cwd());
    if (rp) ruleSet = loadRulesFile(rp, stackId);
  }
  const disabledRuleIds = new Set(ruleSet.disabled);
  const pattern = AUDIT_STACKS[stackId]?.filePattern;

  const analysed = [];
  const scores = [];
  for (const f of live) {
    if (pattern && !pattern.test(basename(f.filename))) continue;
    let content = null;
    const localPath = resolve(process.cwd(), f.filename);
    if (existsSync(localPath)) {
      content = readFileSync(localPath, "utf8");
    } else if (f.raw_url) {
      try {
        const r = await fetch(f.raw_url, { headers: { authorization: `Bearer ${token}` } });
        if (r.ok) content = await r.text();
      } catch { /* skipped below */ }
    }
    if (content == null) { console.log(`  ${dim(`skipped (no content): ${f.filename}`)}`); continue; }

    const result = runner(basename(f.filename), content, { disabledRuleIds });
    const findings = [
      ...(result.findings ?? []),
      ...runFileRules(ruleSet.rules, basename(f.filename), content, { disabledRuleIds }),
    ];
    scores.push(result.overallScore ?? 0);
    analysed.push({ filename: f.filename, patch: f.patch, findings });
  }

  if (analysed.length === 0) {
    console.log(`  ${C.green()}No ${AUDIT_STACKS[stackId].fileAccept} files changed — nothing to review.${C.reset()}\n`);
    return;
  }

  const all = analysed.flatMap((a) => a.findings);
  const counts = {
    critical: all.filter((f) => f.severity === "critical").length,
    warning: all.filter((f) => f.severity === "warning").length,
    info: all.filter((f) => f.severity === "info").length,
  };
  const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  const review = buildReview(analysed, { onlyAdded: args.onlyAdded, maxComments: args.maxComments });
  const body = reviewSummary({
    files: analysed.length, counts, score,
    threshold: args.threshold, comments: review.comments.length,
    outside: review.outside, dropped: review.dropped,
  });

  console.log(`  ${AUDIT_STACKS[stackId].icon} ${AUDIT_STACKS[stackId].name} · score ${score}/100`);
  console.log(`  ${counts.critical} critical · ${counts.warning} warning · ${counts.info} info`);
  console.log(`  ${review.comments.length} inline comment(s), ${review.outside.length} outside the diff\n`);

  if (args.dryRun) {
    console.log(dim("  ── review body ──"));
    for (const l of body.split("\n")) console.log(`  ${dim(l)}`);
    console.log(dim("\n  ── inline comments ──"));
    for (const c of review.comments) {
      console.log(`  ${C.cyan()}${c.path}:${c.line}${C.reset()}`);
      console.log(`    ${c.body.split("\n")[0]}`);
    }
    console.log();
  } else {
    const prInfo = await gh(`/repos/${owner}/${name}/pulls/${pr}`, token);
    await gh(`/repos/${owner}/${name}/pulls/${pr}/reviews`, token, {
      method: "POST",
      body: JSON.stringify({
        commit_id: prInfo.head.sha,
        event: "COMMENT",
        body,
        comments: review.comments,
      }),
    });
    console.log(`  ${C.green()}Posted review with ${review.comments.length} inline comment(s).${C.reset()}\n`);
  }

  if (args.threshold != null && score < args.threshold) {
    console.error(`  ${C.red()}Quality gate failed: ${score} < ${args.threshold}${C.reset()}\n`);
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Before anything that touches the filesystem: `cqz --version` used to
  // fall through as a path and start auditing the current directory.
  if (args.version)    { console.log(CQZ_VERSION); process.exit(0); }
  if (args.help)       { printHelp();   process.exit(0); }
  if (args.command === "remediate") { await runRemediate(args); return; }
  if (args.command === "pr-review") { await runPrReview(args); return; }
  if (args.listStacks) { printStacks(); process.exit(0); }
  if (args.command === "mcp-config") { printMcpConfig(args.paths[0]); process.exit(0); }
  if (args.command === "serve")      { await runServe(args); return; }
  if (args.readReport) {
    const report = printReportSummary(args.readReport);
    if (args.open && report) {
      const restored = (report.results || []).map((r) => ({
        file: r.file,
        result: { overallScore: r.overallScore, categoryScores: r.categoryScores, findings: r.findings || [] },
      }));
      const sid = report.stack?.id || "playwright";
      openHtmlReport(renderAppReport(sid, restored, { projectName: report.stack?.name })
                     || renderWebReport(sid, restored, { projectName: report.stack?.name }));
    }
    process.exit(0);
  }

  const inputPaths = args.paths.length ? args.paths : ["."];

  // Route every file to the stack that owns it. A repo with specs, frontend
  // code and a Java service is three stacks, not one.
  if (!args.stack) {
    let byStack;
    if (args.changed) {
      const { base, files } = gitChangedFiles(args.since);
      if (files.length === 0) {
        console.log(dim(`  No changed files vs ${base} — nothing to audit.`));
        return;
      }
      if (args.output === "pretty") {
        console.log(dim(`  ${files.length} changed file(s) vs ${base}`));
      }
      byStack = routeFileList(files, readHead);
      if (byStack.size === 0) {
        console.log(dim(`  ${files.length} file(s) changed, none in a supported stack.`));
        return;
      }
    } else {
      byStack = routeFilesByStack(inputPaths);
    }
    if (byStack.size === 0) {
      console.error(`  No supported files found in: ${inputPaths.join(", ")}`);
      process.exit(1);
    }
    // Application code is opt-in. On a real monorepo it outnumbers the tests
    // several times over, so auditing it by default buries the test findings
    // people came for. --app adds it back, --app-only inverts the filter.
    const wantsStack = (id) =>
      args.appOnly ? !isTestAutomationStack(id)
      : args.app    ? true
      :               isTestAutomationStack(id);

    const excluded = [...byStack.entries()].filter(([id]) => !wantsStack(id));
    for (const [id] of excluded) byStack.delete(id);

    const ordered = [...byStack.entries()].sort((a, b) => b[1].length - a[1].length);

    if (ordered.length === 0 && excluded.length) {
      const n = excluded.reduce((t, [, f]) => t + f.length, 0);
      console.log(dim(`  No test automation found. ${n} file(s) of application code were skipped — add --app to audit them.`));
      return;
    }
    if (ordered.length > 1 && args.output === "pretty") {
      console.log(dim(`  Detected ${ordered.length} stacks: ${ordered.map(([id, f]) => `${id} (${f.length})`).join(", ")}`));
    } else if (args.output === "pretty") {
      console.log(dim(`  Auto-detected stack: ${ordered[0][0]}`));
    }
    let anyCritical = false;
    // Files excluded by --app are reported separately; they must not also be
    // counted as "no matching stack", which they plainly have.
    const analysed = excluded.flatMap(([, files]) => files);
    // json must stay one parseable document however many stacks were found,
    // so aggregate instead of letting each stack print its own.
    const aggregate = args.output === "json" && ordered.length > 1;
    const perStack = [];

    for (const [id, files] of ordered) {
      analysed.push(...files);
      const res = await runStack(id, files, args, inputPaths,
        { label: ordered.length > 1, emit: !aggregate, openReport: id === ordered[0][0] });
      if (res.some((r) => r.result.findings?.some((f) => f.severity === "critical"))) anyCritical = true;
      if (aggregate) perStack.push([id, res]);
    }

    if (aggregate) printJsonMulti(perStack, args);

    // Say what was not looked at. A clean report over half a repo is worse
    // than no report, because it reads as a clean bill of health.
    if (args.output === "pretty" && excluded.length) {
      const n = excluded.reduce((t, [, f]) => t + f.length, 0);
      const names = excluded.map(([id]) => AUDIT_STACKS[id]?.name ?? id).join(", ");
      console.log(dim(`\n  ${n} application file(s) not audited (${names}) — add ${b("--app")}${dim(" to include them.")}`));
    }

    if (args.output === "pretty" && !args.changed) {
      const skipped = unsupportedExtensions(inputPaths, analysed);
      if (skipped.size) {
        const total = [...skipped.values()].reduce((a, b) => a + b, 0);
        const kinds = [...skipped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
          .map(([ext, n]) => `${ext} (${n})`).join(", ");
        console.log(`\n${dim(`  Not audited: ${total} file${total === 1 ? "" : "s"} with no matching stack \u2014 ${kinds}`)}`);
        console.log(dim("  Run cqz --list-stacks to see what is supported."));
      }
    }
    if (args.baselineWrite) return;              // recording, never a failure
    const failed = args.baseline ? baselineNewCriticals > 0 : anyCritical;
    if (failed && args.severity !== "info" && args.severity !== "warning") process.exitCode = 1;
    return;
  }

  if (!RUNNERS[args.stack]) {
    console.error(`Unknown stack: "${args.stack}". Run cqz --list-stacks for valid IDs.`);
    process.exit(1);
  }
  const forcedFiles = inputPaths.flatMap((p) => { try { return collectFiles(p, args.stack); } catch { return []; } });
  if (forcedFiles.length === 0) {
    console.error(`  No ${AUDIT_STACKS[args.stack].fileAccept} files found in: ${inputPaths.join(", ")}`);
    process.exit(1);
  }
  const res = await runStack(args.stack, forcedFiles, args, inputPaths);
  if (args.baselineWrite) return;
  const failed = args.baseline
    ? baselineNewCriticals > 0
    : res.some((r) => r.result.findings?.some((f) => f.severity === "critical"));
  if (failed && args.severity !== "info" && args.severity !== "warning") {
    process.exitCode = 1;
  }
}

/**
 * Analyse one stack's files and emit its output.
 *
 * Extracted from main so a polyglot repo can run it once per detected stack
 * instead of silently reporting only the winner.
 */
async function runStack(stackId, allFiles, args, inputPaths, { label = false, emit = true, openReport = true } = {}) {
  if (label && args.output === "pretty") {
    const st = AUDIT_STACKS[stackId];
    console.log(`\n${b(`\u2500\u2500 ${st.icon} ${st.name}`)} ${dim(`(${allFiles.length} file${allFiles.length === 1 ? "" : "s"})`)}`);
  }
  // Project rules from cqz-rules.json (explicit --rules, or discovered by walking up)
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
  // The discovered file, which may still be the legacy cqs-rules.json.
  const rulesLabel = ruleSet.path ? basename(ruleSet.path) : RULES_FILENAME;
  for (const err of ruleSet.errors) console.error(`  ${rulesLabel}: ${err}`);
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
    // The exported report has no source to look things up in later, so the
    // few lines each finding is about are captured now, while we hold the
    // file. Without this a report can only show the fix, never what was wrong.
    result.findings = withEvidence(result.findings ?? [], content);
    // Tag each finding with its source file for later grouping
    for (const f of result.findings ?? []) f._file = file;
    results.push({ file, result });
  }

  // Duplicate detection across the files just analysed. Needs the whole set,
  // so it runs after the per-file loop rather than inside it.
  {
    const categoryIds = (AUDIT_STACKS[stackId]?.categories ?? []).map((c) => c.id);
    const { results: merged, duplicateCount } =
      applyCrossFileAnalysis(results, (f) => fileContents[f], categoryIds);
    if (duplicateCount) {
      results.length = 0;
      results.push(...merged);
      if (args.output === "pretty") {
        console.log(dim(`  ${duplicateCount} cross-file duplicate finding(s)`));
      }
    }
  }

  // Baseline. Handled per stack so a polyglot repo accumulates into one file;
  // each stack merges its own files in rather than overwriting the others.
  if (args.baselineWrite) {
    const root = resolve(inputPaths[0] ?? ".");
    const file = resolve(args.baselineWrite);
    let existing = {};
    try { existing = JSON.parse(readFileSync(file, "utf8")).files ?? {}; } catch { /* first stack */ }
    const merged = mergeCounts(existing, countFindings(results, root));
    writeFileSync(file, JSON.stringify(buildBaseline(merged, { cqsVersion: CQZ_VERSION }), null, 2) + "\n");
    const total = Object.values(merged).reduce((n, r) => n + Object.values(r).reduce((a, b) => a + b, 0), 0);
    console.log(`  ${C.green()}Baseline written${C.reset()} ${dim(`${total} accepted finding(s) across ${Object.keys(merged).length} file(s) -> ${file}`)}`);
    return results;
  }

  if (args.baseline) {
    const root = resolve(inputPaths[0] ?? ".");
    let base;
    try { base = JSON.parse(readFileSync(resolve(args.baseline), "utf8")); }
    catch { console.error(`  Cannot read baseline: ${resolve(args.baseline)}`); process.exit(1); }

    const { newFindings, fixed, acceptedTotal } = diffAgainstBaseline(results, base, root);
    baselineNewCriticals += newFindings.filter((f) => f.severity === "critical").length;
    const stack = AUDIT_STACKS[stackId];
    if (newFindings.length === 0) {
      console.log(`  ${C.green()}No new findings${C.reset()} ${dim(`${stack.icon} ${stack.name} — ${acceptedTotal} accepted in baseline`)}` +
        (fixed ? ` ${C.green()}${fixed} fixed since${C.reset()}` : ""));
    } else {
      console.log(`\n  ${C.bold()}${C.red()}${newFindings.length} new finding(s)${C.reset()} ${dim(`beyond the baseline — ${stack.icon} ${stack.name}`)}` +
        (fixed ? dim(`  (${fixed} fixed since)`) : ""));
      for (const f of newFindings.slice(0, 30)) {
        console.log(`    ${sevBadge(f.severity)} ${f.title} ${dim(`[${f.ruleId}]`)} ${C.cyan()}${relative(process.cwd(), f._file)}${f.line ? ":" + f.line : ""}${C.reset()}`);
      }
      if (newFindings.length > 30) console.log(dim(`    …and ${newFindings.length - 30} more`));
      console.log(dim(`\n    Accept these too:  cqz ${inputPaths.join(" ")} --baseline-write ${args.baseline}\n`));
    }
    return results;
  }

  // Output. Suppressed when the caller is aggregating several stacks into one
  // document — printing per stack there produced concatenated JSON that no
  // parser accepts.
  if (emit) {
    if (args.output === "json") {
      printJson(stackId, results, args);
    } else if (args.output === "summary") {
      printSummary(stackId, results, args);
    } else {
      printPretty(stackId, results, args);
    }
  }

  // AI Review
  const aiConfig = resolveAiConfig(args);
  let aiResults = [];
  if (aiConfig) {
    aiResults = await runAiReview(results, fileContents, aiConfig);
  }

  // The report is the point of the tool, so produce it by default. Suppress it
  // for machine-readable output and when stdout is not a terminal (CI, pipes),
  // where popping a browser is wrong — unless --open asked for it explicitly.
  const wantsReport = args.open || (
    !args.noReport && args.output === "pretty" && process.stdout.isTTY
  );
  if (wantsReport) {
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
    // The app carries every view; the flat report is the fallback when it
    // was not embedded, and is still what --report html produces.
    openHtmlReport(
      aiResults.length ? renderWebReport(stackId, results, { aiResults })
                       : (renderAppReport(stackId, results) || renderWebReport(stackId, results)),
      { stackId, open: openReport });
  }

  // Exit with non-zero if any criticals found (useful for CI)
  const hasCritical = results.some(r =>
    r.result.findings?.some(f => f.severity === "critical")
  );
  if (hasCritical && args.severity !== "info" && args.severity !== "warning") {
    process.exitCode = 1;
  }
  return results;
}

main().catch(err => { console.error(err); process.exit(1); });
