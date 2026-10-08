/**
 * cqz-ai bundler.
 *
 * Unlike the audit CLI this package has a real runtime dependency —
 * @huggingface/transformers pulls onnxruntime-node, which is a native addon and
 * cannot be bundled. So it stays external and is declared in package.json,
 * where npm will install it.
 */
import { build } from "esbuild";
import { readFileSync, chmodSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

mkdirSync(join(__dirname, "dist"), { recursive: true });

const result = await build({
  entryPoints: [join(__dirname, "bin/cqz-ai.entry.js")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: join(__dirname, "dist/cqz-ai.js"),
  define: { __CQZ_AI_VERSION__: JSON.stringify(version) },
  packages: "external",
  metafile: true,
  logLevel: "info",
  banner: { js: `#!/usr/bin/env node\n// cqz-ai v${version} — offline AI layer for Code Quality Zone\n` },
});

chmodSync(join(__dirname, "dist/cqz-ai.js"), 0o755);

// The only non-builtin import allowed to survive is the one we declare.
const declared = new Set(Object.keys(JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")).dependencies ?? {}));
const BUILTINS = new Set(["fs","path","process","url","os","crypto","stream","util","events","child_process","http","https","net","zlib","buffer","assert","module","readline","tty","worker_threads","perf_hooks","fs/promises"]);
const bad = [];
for (const out of Object.values(result.metafile.outputs)) {
  for (const imp of out.imports ?? []) {
    if (!imp.external) continue;
    const spec = imp.path.replace(/^node:/, "");
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    if (BUILTINS.has(spec) || BUILTINS.has(pkg) || declared.has(pkg)) continue;
    bad.push(spec);
  }
}
if (bad.length) {
  console.error("\n  ✘ Bundle imports packages that are not declared dependencies:");
  for (const b of new Set(bad)) console.error(`      ${b}`);
  process.exit(1);
}

for (const [file, info] of Object.entries(result.metafile.outputs)) {
  console.log(`\n  ✓ ${file}  (${(info.bytes / 1024).toFixed(1)} KB)`);
}
console.log("\n  Install:  npm install -g .\n  Run:      cqz-ai ./tests/example.spec.ts\n");
