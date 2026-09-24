/**
 * cqs CLI bundler
 * Produces a single self-contained dist/cqs.js with no external dependencies.
 *
 * Usage:  node build.mjs
 */
import { build } from "esbuild";
import { writeFileSync, chmodSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json — injected into the bundle at build time
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

mkdirSync(join(__dirname, "dist"), { recursive: true });

const result = await build({
  entryPoints: [join(__dirname, "bin/cqs.entry.js")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: join(__dirname, "dist/cqs.js"),
  // Inject version from package.json at build time
  define: { __CQS_VERSION__: JSON.stringify(version) },
  // Exclude Node.js built-ins (they're always available)
  external: ["fs", "path", "process", "url", "os", "crypto", "stream", "util", "events"],
  // Mark AWS/Google SDKs as external — CLI doesn't need AI providers
  packages: "external",
  minify: false,
  sourcemap: false,
  metafile: true,
  banner: {
    js: `#!/usr/bin/env node\n// cqs v${version} — Code Quality Studio CLI\n`,
  },
  logLevel: "info",
});

// Make the output executable
const outPath = join(__dirname, "dist/cqs.js");
chmodSync(outPath, 0o755);

// Print bundle stats
const outputs = Object.entries(result.metafile.outputs);
for (const [file, info] of outputs) {
  const kb = (info.bytes / 1024).toFixed(1);
  console.log(`\n  ✓ ${file}  (${kb} KB)`);
}

console.log("\n  Done! Install globally with:\n");
console.log("    npm install -g .\n");
console.log("  Then run:\n");
console.log("    cqs ./your-tests/ --stack playwright\n");
