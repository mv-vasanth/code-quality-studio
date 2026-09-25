/**
 * Builds a standalone `cqs` executable — no Node.js required on the target machine.
 *
 * Uses Node's Single Executable Application support: bundle to CommonJS, generate a
 * SEA blob, then inject it into a copy of the node binary.
 *
 * SEA cannot cross-compile. This produces a binary for the HOST platform only;
 * .github/workflows/release-binaries.yml runs it on a matrix to cover the rest.
 *
 * Usage:  node build-binary.mjs
 */
import { build } from "esbuild";
import { readBuiltApp, appDefines } from "./embedApp.mjs";
import { execFileSync } from "child_process";
import { mkdirSync, copyFileSync, chmodSync, writeFileSync, readFileSync, statSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const WORK = join(__dirname, "build");
const OUT_DIR = join(__dirname, "dist", "bin");
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

const target = `${process.platform}-${process.arch}`;
const binName = `cqs-${target}${IS_WIN ? ".exe" : ""}`;
const binPath = join(OUT_DIR, binName);

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

// Some Node builds (notably the /usr/local homebrew v22.15.0) ship the SEA fuse
// string twice, and postject refuses to guess which one to patch. Fail early with
// the fix rather than surfacing postject's opaque "Multiple occurences" error.
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
{
  const buf = readFileSync(process.execPath);
  let count = 0, idx = 0;
  while ((idx = buf.indexOf(FUSE, idx)) !== -1) { count++; idx += FUSE.length; }
  if (count !== 1) {
    throw new Error(
      `This node binary (${process.execPath}, ${process.version}) contains the SEA fuse ${count} times; ` +
      `postject needs exactly 1.\nRun the build with a different Node — an nvm-installed one usually works:\n` +
      `  PATH="$HOME/.nvm/versions/node/<version>/bin:$PATH" node build-binary.mjs`,
    );
  }
}

// ── 1. Bundle to CommonJS (SEA does not accept an ESM entry point) ───────────
const entry = join(WORK, "cqs-sea.cjs");
await build({
  entryPoints: [join(__dirname, "bin/cqs.entry.js")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: entry,
  define: {
    __CQS_VERSION__: JSON.stringify(version),
    ...appDefines(readBuiltApp()),
    // Vite-only helper (shouldUseLocalAnalysis) that the CLI never calls, but which
    // esbuild still pulls in. import.meta is illegal in CJS, so stub it out.
    "import.meta.env": "{}",
  },
  external: [],   // bundle everything; the binary must be self-contained
  minify: true,
  logLevel: "warning",
});
console.log(`  ✓ CJS bundle  (${(statSync(entry).size / 1024).toFixed(0)} KB)`);

// ── 2. Generate the SEA blob ─────────────────────────────────────────────────
const cfgPath = join(WORK, "sea-config.json");
const blobPath = join(WORK, "cqs.blob");
writeFileSync(cfgPath, JSON.stringify({
  main: entry,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: true,
}, null, 2));

execFileSync(process.execPath, ["--experimental-sea-config", cfgPath], { stdio: "inherit" });
console.log(`  ✓ SEA blob    (${(statSync(blobPath).size / 1024 / 1024).toFixed(1)} MB)`);

// ── 3. Copy the node binary and inject the blob ──────────────────────────────
copyFileSync(process.execPath, binPath);
chmodSync(binPath, 0o755);

// A signed macOS binary must have its signature removed before it is modified,
// then be re-signed, or the kernel refuses to exec it ("killed: 9").
if (IS_MAC) {
  try { execFileSync("codesign", ["--remove-signature", binPath], { stdio: "pipe" }); } catch { /* unsigned already */ }
}

const postject = join(__dirname, "node_modules", ".bin", IS_WIN ? "postject.cmd" : "postject");
const injectArgs = [binPath, "NODE_SEA_BLOB", blobPath, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
if (IS_MAC) injectArgs.push("--macho-segment-name", "NODE_SEA");
execFileSync(postject, injectArgs, { stdio: "inherit" });

if (IS_MAC) {
  execFileSync("codesign", ["--sign", "-", binPath], { stdio: "pipe" });
}

// ── 4. Verify the binary actually runs ───────────────────────────────────────
// Run with an empty PATH so a stray node on the machine cannot mask a broken binary.
const out = execFileSync(binPath, ["--list-stacks", "--no-color"], {
  encoding: "utf8",
  env: { ...process.env, PATH: "" },
});
const stackCount = (out.match(/^\s+[a-z_]+\s{2,}/gm) || []).length;
if (stackCount < 18) throw new Error(`binary ran but listed ${stackCount} stacks, expected 18`);

rmSync(WORK, { recursive: true, force: true });

const mb = (statSync(binPath).size / 1024 / 1024).toFixed(1);
console.log(`\n  ✓ ${binName}  (${mb} MB)  — ${stackCount} stacks verified`);
console.log(`\n  Run it with no Node installed:\n    ${binPath} ./tests/\n`);
