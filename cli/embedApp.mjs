/**
 * Read the built web app so the CLI can inline it into `cqz --open` reports.
 *
 * Shared by build.mjs and build-binary.mjs — both need the identical defines,
 * and a binary that silently shipped without the app would be hard to spot.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function readBuiltApp({ quiet = false } = {}) {
  const assets = join(__dirname, "..", "dist", "assets");
  const warn = (msg) => { if (!quiet) console.log(msg); };

  if (!existsSync(assets)) {
    warn("\n  ! dist/assets not found — run `npm run build` at the repo root first.");
    warn("    Building without the embedded app; --open will fall back to the flat report.\n");
    return { js: "", css: "" };
  }
  const files = readdirSync(assets);
  const entryJs = files.find((f) => /^index-.*\.js$/.test(f));
  const entryCss = files.find((f) => /^index-.*\.css$/.test(f));
  if (!entryJs) {
    warn("\n  ! No index-*.js in dist/assets; --open will fall back to the flat report.\n");
    return { js: "", css: "" };
  }
  return {
    js: readFileSync(join(assets, entryJs), "utf8"),
    css: entryCss ? readFileSync(join(assets, entryCss), "utf8") : "",
  };
}

/** esbuild `define` entries for the embedded app. */
export function appDefines(app) {
  return {
    __CQZ_APP_JS__: JSON.stringify(app.js),
    __CQZ_APP_CSS__: JSON.stringify(app.css),
  };
}

/**
 * Fail the build if the bundle still imports a package at runtime.
 *
 * esbuild runs with `packages: "external"`, so a stray import of anything
 * outside Node's builtins survives into dist/ and the CLI dies on startup
 * with ERR_MODULE_NOT_FOUND \u2014 on every command, including --help. That is
 * exactly how `react` shipped once, via a pure helper that happened to live
 * beside a React hook.
 *
 * Reads esbuild's metafile rather than grepping the output: the bundle is full
 * of example code in template literals that looks exactly like an import
 * statement, and those are rule guidance, not dependencies.
 */
const NODE_BUILTINS = new Set([
  "fs", "fs/promises", "path", "process", "url", "os", "crypto", "stream",
  "util", "events", "child_process", "readline", "tty", "http", "https",
  "net", "zlib", "buffer", "assert", "module", "worker_threads", "perf_hooks",
]);

export function assertNoRuntimeImports(metafile, { allow = [] } = {}) {
  const allowed = new Set([...NODE_BUILTINS, ...allow]);
  const bad = new Map();
  for (const [outFile, out] of Object.entries(metafile.outputs ?? {})) {
    for (const imp of out.imports ?? []) {
      if (!imp.external) continue;
      const spec = imp.path.replace(/^node:/, "");
      // Subpath imports count as the package: "@scope/pkg/server/index.js"
      // is satisfied by a dependency on "@scope/pkg".
      if ([...allowed].some((a) => spec === a || spec.startsWith(a + "/"))) continue;
      if (!bad.has(spec)) bad.set(spec, outFile);
    }
  }
  if (bad.size) {
    console.error("\n  \u2718 The bundle imports packages that will not exist at runtime:");
    for (const [spec, outFile] of bad) console.error(`      ${spec}   (in ${outFile})`);
    console.error("\n    The CLI ships no node_modules, so this fails on startup with");
    console.error("    ERR_MODULE_NOT_FOUND \u2014 on every command, including --help.");
    console.error("    Move the shared code into a module free of framework imports.\n");
    process.exit(1);
  }
}
