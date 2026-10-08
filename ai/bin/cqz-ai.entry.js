/**
 * cqz-ai — the offline AI layer, as its own process.
 *
 * Deliberately a separate package from cqz-audit. The audit CLI is live and
 * installed by people who want 530 deterministic rules and a 2 MB download;
 * nothing about adding a classifier should be able to break that. So this does
 * not patch, wrap or re-export the audit CLI — it runs beside it, on its own
 * port, and the studio finds it the same way it finds `cqz serve`.
 *
 * If this package fails to install, fails to load its model, or is simply not
 * there, `cqs` behaves exactly as it does today.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createServer } from "http";
import { randomBytes } from "crypto";
import { execSync } from "child_process";
import { auditTestCode } from "../src/auditTestCode.js";
import { shutdownIsolated, isRunning, workerPid } from "../src/isolated.js";
import { warmIsolated } from "../src/isolated.js";
import { DEFAULT_MODEL, TINY_MODEL, defaultCacheDir } from "../src/backend.js";

/* global __CQZ_AI_VERSION__ */   // injected by build.mjs at bundle time

const VERSION = typeof __CQZ_AI_VERSION__ !== "undefined" ? __CQZ_AI_VERSION__ : "0.0.0-dev";

/** Its own port. 4000 is `cqz serve`; these are meant to run side by side. */
const DEFAULT_PORT = 4100;

const ALLOWED_ORIGINS = new Set([
  "http://localhost:4000", "http://127.0.0.1:4000",   // cqz serve, serving the studio
  "http://localhost:4001", "http://127.0.0.1:4001",   // vite dev
  "http://localhost:4002", "http://127.0.0.1:4002",   // vite preview
]);

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

/** Only these are subcommands. Anything else that is not a flag is a path —
 *  treating the first bare argument as a command silently ate the first file. */
const COMMANDS = new Set(["serve", "warm", "where"]);

function parseArgs(argv) {
  const args = { command: COMMANDS.has(argv[0]) ? argv[0] : null, paths: [] };
  for (let i = args.command ? 1 : 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" && argv[i + 1]) args.port = parseInt(argv[++i], 10);
    else if (a === "--model" && argv[i + 1]) args.model = argv[++i];
    else if (a === "--tiny") args.model = TINY_MODEL;
    else if (a === "--threshold" && argv[i + 1]) args.threshold = parseFloat(argv[++i]);
    else if (a === "--json") args.json = true;
    else if (a === "--version" || a === "-v") args.version = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!a.startsWith("-")) args.paths.push(a);
  }
  return args;
}

const HELP = `
  ${C.b("cqz-ai")} ${C.dim(`v${VERSION}`)} — offline AI layer for Code Quality Zone

  ${C.b("Usage")}
    cqz-ai <file...>              Audit files (static rules, then the model)
    cqz-ai serve [--port 4100]    Run beside \`cqz serve\` for the studio
    cqz-ai warm                   Download the model now instead of on first use
    cqz-ai where                  Print the model cache directory

  ${C.b("Options")}
    --model <id>                  Hugging Face model (default ${DEFAULT_MODEL})
    --tiny                        ~28 MB model instead of ~104 MB
    --threshold <0..1>            Confidence needed to report (default 0.65)
    --json                        Machine-readable output
    --version, --help

  ${C.dim("No API key. The model downloads once to")} ${C.dim(defaultCacheDir())}
  ${C.dim("and runs in a child process that is killed when this one stops.")}
`;

async function auditPaths(args) {
  const out = [];
  for (const p of args.paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) { console.error(`  Not found: ${abs}`); process.exitCode = 1; continue; }
    const code = readFileSync(abs, "utf8");
    const r = await auditTestCode(code, { model: args.model, threshold: args.threshold });
    out.push({ file: abs, ...r });

    if (!args.json) {
      console.log(`\n  ${C.b(p)} ${C.dim(`${r.ms}ms${r.model.ran ? "" : " · model skipped"}`)}`);
      if (!r.findings.length) console.log(C.dim("    no findings"));
      for (const f of r.findings) {
        const conf = f.confidence != null ? C.dim(` ${Math.round(f.confidence * 100)}%`) : "";
        const where = f.line ? C.dim(`:${f.line}`) : "";
        const tag = f.source === "static" ? C.dim("rules") : C.cyan("ai");
        console.log(`    ${sev(f.severity)} ${f.title}${where}${conf}  ${tag}`);
        console.log(C.dim(`           ${f.description}`));
      }
    }
  }
  if (args.json) console.log(JSON.stringify({ files: out }, null, 2));
  await shutdownIsolated("audit complete");
  if (out.some((r) => r.findings.some((f) => f.severity === "critical"))) process.exitCode = 1;
}

function sev(s) {
  if (s === "critical") return C.red("CRIT ");
  if (s === "warning") return "\x1b[33mWARN \x1b[0m";
  return C.dim("INFO ");
}

function readBody(req, limit = 2_000_000) {
  return new Promise((ok, fail) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) { fail(new Error("request body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { fail(new Error("body is not valid JSON")); }
    });
    req.on("error", fail);
  });
}

async function runServe(args) {
  const port = args.port ?? DEFAULT_PORT;
  const token = randomBytes(24).toString("hex");

  const send = (res, status, body, origin) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
      ...(origin ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "content-type, x-cqz-token",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "vary": "Origin",
      } : {}),
      "x-content-type-options": "nosniff",
    });
    res.end(payload);
  };

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const allowed = new Set([...ALLOWED_ORIGINS, `http://127.0.0.1:${port}`, `http://localhost:${port}`]);
    const originOk = !origin || allowed.has(origin);
    const corsOrigin = originOk && origin ? origin : null;
    if (!originOk) return send(res, 403, { error: `Origin not allowed: ${origin}` });
    if (req.method === "OPTIONS") return send(res, 204, {}, corsOrigin);

    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (url.pathname === "/health" && req.method === "GET") {
      return send(res, 200, {
        ok: true, service: "cqz-ai", version: VERSION,
        model: args.model ?? DEFAULT_MODEL,
        loaded: isRunning(), workerPid: workerPid(),
        cacheDir: defaultCacheDir(),
      }, corsOrigin);
    }

    if (req.headers["x-cqz-token"] !== token) {
      return send(res, 401, { error: "Missing or invalid x-cqz-token" }, corsOrigin);
    }

    let body;
    try { body = await readBody(req); }
    catch (e) { return send(res, 400, { error: e.message }, corsOrigin); }

    try {
      if (url.pathname === "/ai-audit" && req.method === "POST") {
        const code = body.code ?? (body.path ? readFileSync(resolve(body.path), "utf8") : "");
        return send(res, 200, await auditTestCode(code, {
          model: args.model,
          threshold: body.threshold ?? args.threshold,
          only: body.only,
          // Lets a caller see the model's opinion on a file the static rules
          // already condemned — useful when tuning, and the only way to get
          // any model output on a suite where every file trips a rule.
          alwaysRunModel: Boolean(body.alwaysRunModel),
        }), corsOrigin);
      }
      if (url.pathname === "/unload" && req.method === "POST") {
        return send(res, 200, await shutdownIsolated("asked over HTTP"), corsOrigin);
      }
      return send(res, 404, { error: `No such endpoint: ${req.method} ${url.pathname}` }, corsOrigin);
    } catch (e) {
      return send(res, 500, { error: e?.message ?? String(e) }, corsOrigin);
    }
  });

  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", ok);   // this machine only, like cqz serve
  });

  console.log(`\n  ${C.b("cqz-ai serve")} ${C.dim(`v${VERSION}`)}`);
  console.log(`  ${C.dim("listening on")} http://127.0.0.1:${port} ${C.dim("(this machine only)")}`);
  console.log(`  ${C.dim("model:")} ${args.model ?? DEFAULT_MODEL} ${C.dim("— downloads on first request")}`);
  console.log(`  ${C.dim("cache:")} ${defaultCacheDir()}`);
  console.log(`\n  ${C.dim("Token:")} ${C.dim(token)}`);
  console.log(`  ${C.dim(`curl -s http://127.0.0.1:${port}/health`)}\n`);
  console.log(C.dim("  Ctrl-C to stop. The model process stops with it.\n"));

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, async () => {
      await shutdownIsolated(sig);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500).unref();
    });
  }
}

async function main() {
  // Worker mode: this binary re-executes itself as the model's child process,
  // because the published bundle is one file with no worker.mjs beside it.
  if (process.env.CQZ_AI_WORKER === "1") {
    await import("../src/worker.mjs");
    return;
  }

  // Bundled, there is no worker.mjs on disk — so the worker is this binary,
  // re-executed. Harmless when running from source, where the default entry
  // resolves to the real file.
  process.env.CQZ_AI_WORKER_ENTRY ??= process.argv[1];

  const args = parseArgs(process.argv.slice(2));
  if (args.version) { console.log(VERSION); return; }
  if (args.help || (!args.command && !args.paths.length)) { console.log(HELP); return; }

  if (args.command === "serve") return runServe(args);
  if (args.command === "where") { console.log(defaultCacheDir()); return; }
  if (args.command === "warm") {
    process.stdout.write("  downloading model… ");
    await warmIsolated({ model: args.model });
    console.log("done");
    try { console.log(`  ${execSync(`du -sh ${defaultCacheDir()}`).toString().trim()}`); } catch { /* not posix */ }
    await shutdownIsolated("warm complete");
    return;
  }
  return auditPaths(args);
}

main().catch((err) => {
  console.error(`\n  ${C.red(err?.message ?? String(err))}\n`);
  process.exit(1);
});
