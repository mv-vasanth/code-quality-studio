/**
 * cqs MCP Server bundler
 * Produces dist/cqs-mcp.js — a self-contained MCP server with no runtime deps.
 *
 * Usage:  node build-mcp.mjs
 */
import { build } from "esbuild";
import { readBuiltApp, appDefines } from "./embedApp.mjs";
import { writeFileSync, chmodSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

// Scan the analyzers for their declared rule IDs and inject the map at build time.
// The runtime bundle has no source to introspect, and src/rules/catalog.js is known
// to be incomplete (e.g. no Selenium entries), so deriving it here keeps
// cqs_list_rules honest.
const ANALYZER_BY_STACK = {
  playwright: "src/localAnalyzer.js",          playwright_java: "src/analyzers/playwrightJava.js",
  playwright_python: "src/analyzers/playwrightPython.js", selenium_java: "src/analyzers/seleniumJava.js",
  selenium_csharp: "src/analyzers/seleniumCsharp.js",     cypress: "src/analyzers/cypress.js",
  appium_java: "src/analyzers/appiumJava.js",  tosca_xml: "src/analyzers/toscaXml.js",
  restassured: "src/analyzers/restAssured.js", karate: "src/analyzers/karate.js",
  pytest_api: "src/analyzers/pytestApi.js",    postman: "src/analyzers/postman.js",
  java_api: "src/analyzers/javaApi.js",        java_frontend: "src/analyzers/javaCore.js",
  typescript: "src/analyzers/typescript.js",   ts_frontend: "src/analyzers/tsFrontend.js",
  python_api: "src/analyzers/pythonApi.js",    python_frontend: "src/analyzers/pythonFrontend.js",
};
const builtinRules = {};
for (const [stack, rel] of Object.entries(ANALYZER_BY_STACK)) {
  const src = readFileSync(join(__dirname, "..", rel), "utf8")
    .split(/\r?\n/)
    .filter((l) => !/skippedRules\.push|skipRule\s*\(/.test(l))  // "skipped", not declared
    .join("\n");
  builtinRules[stack] = [...new Set([...src.matchAll(/ruleId:\s*["']([A-Z0-9-]+)["']/g)].map((m) => m[1]))].sort();
}
const totalRules = Object.values(builtinRules).reduce((n, a) => n + a.length, 0);

mkdirSync(join(__dirname, "dist"), { recursive: true });

const result = await build({
  entryPoints: [join(__dirname, "bin/cqs-mcp.entry.js")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: join(__dirname, "dist/cqs-mcp.js"),
  define: {
    ...appDefines(readBuiltApp({ quiet: true })),
    __CQS_VERSION__: JSON.stringify(version),
    __CQS_BUILTIN_RULES__: JSON.stringify(builtinRules),
  },
  external: ["fs", "path", "process", "url", "os", "crypto", "stream", "util", "events"],
  packages: "external",
  minify: false,
  sourcemap: false,
  metafile: true,
  banner: {
    js: `#!/usr/bin/env node\n// cqs-mcp v${version} — Code Quality Studio MCP Server\n`,
  },
  logLevel: "info",
});

const outPath = join(__dirname, "dist/cqs-mcp.js");
chmodSync(outPath, 0o755);

const outputs = Object.entries(result.metafile.outputs);
for (const [file, info] of outputs) {
  const kb = (info.bytes / 1024).toFixed(1);
  console.log(`\n  ✓ ${file}  (${kb} KB)`);
}

console.log(`\n  built-in rules indexed: ${totalRules} across ${Object.keys(builtinRules).length} stacks`);
console.log("\n  Done! Run the MCP server with:\n");
console.log("    node dist/cqs-mcp.js\n");
