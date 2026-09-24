/**
 * cqs MCP Server — exposes cqs as Model Context Protocol tools
 * Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client.
 *
 * Tools:
 *   cqs_audit        — run quality analysis on a path
 *   cqs_list_stacks  — list all 18 supported stacks
 *   cqs_read_report  — summarise a saved JSON report
 */
import { Server }               from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, basename, join } from "path";

// ── Analyzers (same direct imports as the CLI) ────────────────────────────────
import { analysePlaywright }            from "../../src/analyzers/playwright.js";
import { analyseJavaApiLocally }        from "../../src/analyzers/javaApi.js";
import { analyseTypeScriptLocally }     from "../../src/analyzers/typescript.js";
import { analysePlaywrightJavaLocally } from "../../src/analyzers/playwrightJava.js";
import { analysePlaywrightPythonLocally }from "../../src/analyzers/playwrightPython.js";
import { analyseTsFrontendLocally }     from "../../src/analyzers/tsFrontend.js";
import { analysePythonApiLocally }      from "../../src/analyzers/pythonApi.js";
import { analysePythonFrontendLocally } from "../../src/analyzers/pythonFrontend.js";
import { analyseJavaCoreLocally }       from "../../src/analyzers/javaCore.js";
import { analyseRestAssuredLocally }    from "../../src/analyzers/restAssured.js";
import { analyseKarateLocally }         from "../../src/analyzers/karate.js";
import { analysePytestApiLocally }      from "../../src/analyzers/pytestApi.js";
import { analysePostmanLocally }        from "../../src/analyzers/postman.js";
import { analyseSeleniumJavaLocally }   from "../../src/analyzers/seleniumJava.js";
import { analyseSeleniumCsharpLocally } from "../../src/analyzers/seleniumCsharp.js";
import { analyseCypressLocally }        from "../../src/analyzers/cypress.js";
import { analyseAppiumJavaLocally }     from "../../src/analyzers/appiumJava.js";
import { analyseToscaXmlLocally }       from "../../src/analyzers/toscaXml.js";
import { AUDIT_STACKS }                 from "../../src/stacks/definitions.js";

/* global __CQS_VERSION__ */
const VERSION = typeof __CQS_VERSION__ !== "undefined" ? __CQS_VERSION__ : "1.2.0";

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

// ── Helpers ───────────────────────────────────────────────────────────────────
function collectFiles(inputPath, stackId) {
  const pattern = AUDIT_STACKS[stackId]?.filePattern;
  const abs = resolve(inputPath);
  if (!existsSync(abs)) throw new Error(`Path not found: ${abs}`);
  if (statSync(abs).isFile()) return [abs];
  const out = [];
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") walk(full);
      else if (e.isFile() && (!pattern || pattern.test(e.name))) out.push(full);
    }
  }
  walk(abs);
  return out;
}

function detectStack(files) {
  const scores = {};
  for (const [id, stack] of Object.entries(AUDIT_STACKS)) {
    if (!stack.filePattern) continue;
    scores[id] = files.filter(f => stack.filePattern.test(basename(f))).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : "playwright";
}

function grade(score) {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
}

function runAudit(inputPath, stackId, severity = "all", category = null) {
  let files = collectFiles(inputPath, stackId ?? "playwright");
  if (!stackId) stackId = detectStack(files);
  if (!RUNNERS[stackId]) throw new Error(`Unknown stack: "${stackId}". Run cqs_list_stacks to see valid IDs.`);

  files = collectFiles(inputPath, stackId);
  if (files.length === 0) throw new Error(`No ${AUDIT_STACKS[stackId].fileAccept} files found in: ${inputPath}`);

  const runner = RUNNERS[stackId];
  const results = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const result = runner(basename(file), content, { disabledRuleIds: new Set() });
    for (const f of result.findings ?? []) f._file = file;
    results.push({ file, result });
  }

  const allFindings = results.flatMap(r => r.result.findings ?? []).filter(f =>
    (severity === "all" || f.severity === severity) &&
    (!category || f.category === category)
  );

  const crit = allFindings.filter(f => f.severity === "critical").length;
  const warn = allFindings.filter(f => f.severity === "warning").length;
  const info = allFindings.filter(f => f.severity === "info").length;
  const avgScore = results.length
    ? Math.round(results.reduce((s, r) => s + (r.result.overallScore ?? 0), 0) / results.length) : 0;

  // Format as readable text for the AI
  const lines = [
    `## cqs Audit — ${AUDIT_STACKS[stackId].icon} ${AUDIT_STACKS[stackId].name}`,
    `**Path:** ${inputPath}`,
    `**Files analysed:** ${results.length}  |  **Score:** ${avgScore}/100 (Grade ${grade(avgScore)})`,
    `**Findings:** ${crit} critical  ${warn} warning  ${info} info`,
    "",
    "### Per-file scores",
    ...results.map(({ file, result }) => {
      const fc = (result.findings ?? []).filter(f => f.severity === "critical").length;
      const fw = (result.findings ?? []).filter(f => f.severity === "warning").length;
      return `- **${result.overallScore ?? 0}/100** \`${basename(file)}\` — ${fc} critical, ${fw} warning`;
    }),
    "",
    `### Findings (${allFindings.length} shown)`,
    ...allFindings.slice(0, 50).map(f =>
      `- **[${f.severity.toUpperCase()}]** ${f.title} \`[${f.ruleId}]${f.line ? `:${f.line}` : ""}\`\n  ${f.description}${f.fix ? `\n  💡 Fix: ${f.fix}` : ""}`
    ),
    allFindings.length > 50 ? `\n_...and ${allFindings.length - 50} more findings. Use --severity critical to focus._` : "",
  ];

  return {
    stackId, stackName: AUDIT_STACKS[stackId].name,
    files: results.length, avgScore, grade: grade(avgScore),
    summary: { critical: crit, warning: warn, info },
    hasCritical: crit > 0,
    text: lines.join("\n"),
  };
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "cqs-mcp", version: VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "cqs_audit",
      description: "Audit test/code files for quality issues using 300+ built-in rules across 18 frameworks (Playwright, Cypress, Selenium, Appium, TOSCA, REST Assured, Karate, pytest, Postman, TypeScript, Java, Python). Returns findings grouped by severity with fix suggestions.",
      inputSchema: {
        type: "object",
        properties: {
          path:     { type: "string",  description: "Absolute or relative path to a file or folder to audit" },
          stack:    { type: "string",  description: "Stack ID to use (e.g. playwright, cypress, selenium_java, tosca_xml). Auto-detected from file extensions if omitted." },
          severity: { type: "string",  description: "Filter findings by severity", enum: ["all", "critical", "warning", "info"], default: "all" },
          category: { type: "string",  description: "Filter findings by category ID (e.g. reliability, selectors, assertions)" },
        },
        required: ["path"],
      },
    },
    {
      name: "cqs_list_stacks",
      description: "List all 18 available cqs stacks with their stack IDs, file patterns, and groups. Use this to find the correct --stack value before calling cqs_audit.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "cqs_read_report",
      description: "Read and summarise a previously saved cqs JSON report file (generated with cqs --output json > report.json). Returns a structured summary with top violations and category scores.",
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string", description: "Absolute or relative path to the JSON report file" },
        },
        required: ["file"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "cqs_audit") {
      const result = runAudit(
        resolve(args.path ?? "."),
        args.stack ?? null,
        args.severity ?? "all",
        args.category ?? null
      );
      return { content: [{ type: "text", text: result.text }] };
    }

    if (name === "cqs_list_stacks") {
      const groups = {};
      for (const [id, s] of Object.entries(AUDIT_STACKS)) {
        if (!groups[s.group]) groups[s.group] = [];
        groups[s.group].push({ id, name: s.name, icon: s.icon, accept: s.fileAccept });
      }
      const lines = ["## Available cqs Stacks\n"];
      for (const [group, items] of Object.entries(groups)) {
        lines.push(`### ${group}`);
        for (const { id, name: n, icon, accept } of items) {
          lines.push(`- \`${id}\` — ${icon} ${n}  _(${accept})_`);
        }
        lines.push("");
      }
      lines.push("Use the `id` value as the `stack` parameter in `cqs_audit`.");
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (name === "cqs_read_report") {
      const abs = resolve(args.file);
      if (!existsSync(abs)) throw new Error(`Report file not found: ${abs}`);
      const report = JSON.parse(readFileSync(abs, "utf8"));
      const { stack, files, avgScore, summary, results = [] } = report;

      const ruleCounts = {};
      for (const r of results) {
        for (const f of (r.findings ?? [])) {
          if (!ruleCounts[f.ruleId]) ruleCounts[f.ruleId] = { count: 0, title: f.title, sev: f.severity };
          ruleCounts[f.ruleId].count++;
        }
      }
      const topRules = Object.entries(ruleCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
      const topFiles = [...results].sort((a, b) => {
        const ac = (a.findings ?? []).filter(f => f.severity === "critical").length;
        const bc = (b.findings ?? []).filter(f => f.severity === "critical").length;
        return bc - ac;
      }).slice(0, 10);

      const lines = [
        `## cqs Report Summary — ${stack?.name ?? ""}`,
        `**Files:** ${files}  |  **Score:** ${avgScore}/100 (Grade ${grade(avgScore)})`,
        `**Findings:** ${summary.critical} critical  ${summary.warning} warning  ${summary.info} info`,
        "",
        "### Top files by critical findings",
        ...topFiles.filter(r => (r.findings ?? []).some(f => f.severity === "critical")).map(r => {
          const fc = (r.findings ?? []).filter(f => f.severity === "critical").length;
          return `- **${r.overallScore ?? 0}/100** \`${basename(r.file ?? "")}\` — ${fc} critical`;
        }),
        "",
        "### Top rule violations",
        ...topRules.map(([id, i]) => `- **${i.count}x** \`${id}\` [${i.sev}] — ${i.title}`),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
