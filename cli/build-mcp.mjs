/**
 * cqs MCP Server bundler
 * Produces dist/cqs-mcp.js — a self-contained MCP server with no runtime deps.
 *
 * Usage:  node build-mcp.mjs
 */
import { build } from "esbuild";
import { writeFileSync, chmodSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

mkdirSync(join(__dirname, "dist"), { recursive: true });

const result = await build({
  entryPoints: [join(__dirname, "bin/cqs-mcp.entry.js")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: join(__dirname, "dist/cqs-mcp.js"),
  define: { __CQS_VERSION__: JSON.stringify(version) },
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

console.log("\n  Done! Run the MCP server with:\n");
console.log("    node dist/cqs-mcp.js\n");
