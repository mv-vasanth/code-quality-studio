/**
 * `cqs serve` — a local companion for the web app.
 *
 * The browser can read files you pick but cannot write them back, so the
 * agents (remediate, pr-review) have only ever worked from the CLI. This runs
 * them behind a small HTTP API on localhost, letting the app stay the
 * interface while the work happens in a process that has real file access.
 *
 * ── Why the security here is not theatre ──────────────────────────────────
 *
 * This process can edit files on disk. Any page you visit can issue requests
 * to 127.0.0.1 — same-origin policy stops the page *reading* the response
 * without CORS, but it does not stop the request arriving. A naive local
 * server is therefore a remote-code-execution hole that any site could poke.
 *
 * Three defences, all required:
 *
 *   1. Bind to 127.0.0.1 only, never 0.0.0.0, so nothing off this machine
 *      can reach it.
 *   2. A random token minted per run, required on every request. It is
 *      printed once; a page that has not been given it cannot guess it.
 *   3. An Origin allowlist. Requests carrying an Origin we do not recognise
 *      are refused outright, so a browser tab on evil.example cannot drive
 *      it even if the token leaked into a log.
 *
 * Writes additionally require an explicit --allow-write at startup. Running
 * `cqs serve` with no flags can audit and nothing else.
 */
import { createServer } from "http";
import { randomBytes } from "crypto";
import { resolve } from "path";
import { existsSync } from "fs";

// 4000 by default: away from the app's own 5173 and from the usual 3000/8080
// a project's dev server tends to occupy. The server is opt-in anyway —
// nothing starts it unless you run `cqs serve`.
const DEFAULT_PORT = 4000;
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173", "http://127.0.0.1:5173",   // vite dev server
  "http://localhost:4173", "http://127.0.0.1:4173",   // vite preview
]);

function send(res, status, body, origin) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    ...(origin ? {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "content-type, x-cqs-token",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "vary": "Origin",
    } : {}),
    // This API is never a document; stop a browser guessing otherwise.
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

function readBody(req, limitBytes = 1_000_000) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) { fail(new Error("request body too large")); req.destroy(); return; }
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

/**
 * @param handlers { audit, remediate }  async ({...}) => result
 * @param opts     { port, allowWrite, version, cwd }
 */
export function startLocalServer(handlers, opts = {}) {
  const port = opts.port ?? DEFAULT_PORT;
  const token = randomBytes(24).toString("hex");
  const allowWrite = Boolean(opts.allowWrite);

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const originOk = !origin || ALLOWED_ORIGINS.has(origin);
    const corsOrigin = originOk && origin ? origin : null;

    if (!originOk) return send(res, 403, { error: `Origin not allowed: ${origin}` });
    if (req.method === "OPTIONS") return send(res, 204, {}, corsOrigin);

    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    // /health carries no data and needs no token, so the app can discover
    // whether a server is running before it has been handed one.
    if (url.pathname === "/health" && req.method === "GET") {
      return send(res, 200, {
        ok: true, version: opts.version ?? null, cwd: opts.cwd ?? process.cwd(),
        allowWrite,
      }, corsOrigin);
    }

    if (req.headers["x-cqs-token"] !== token) {
      return send(res, 401, { error: "Missing or invalid x-cqs-token" }, corsOrigin);
    }

    let body;
    try { body = await readBody(req); }
    catch (e) { return send(res, 400, { error: e.message }, corsOrigin); }

    const target = body.path ? resolve(body.path) : null;
    if (target && !existsSync(target)) {
      return send(res, 400, { error: `Path not found: ${target}` }, corsOrigin);
    }

    try {
      if (url.pathname === "/audit" && req.method === "POST") {
        return send(res, 200, await handlers.audit({ ...body, path: target }), corsOrigin);
      }
      if (url.pathname === "/remediate" && req.method === "POST") {
        // Writing is opt-in at startup, and a dry run is the default even then.
        const dryRun = body.dryRun !== false;
        if (!dryRun && !allowWrite) {
          return send(res, 403, {
            error: "This server was started without --allow-write, so it can only dry-run.",
          }, corsOrigin);
        }
        return send(res, 200, await handlers.remediate({ ...body, path: target, dryRun }), corsOrigin);
      }
      return send(res, 404, { error: `No such endpoint: ${req.method} ${url.pathname}` }, corsOrigin);
    } catch (e) {
      return send(res, 500, { error: e?.message ?? String(e) }, corsOrigin);
    }
  });

  return new Promise((ok, fail) => {
    server.once("error", fail);
    // 127.0.0.1, not 0.0.0.0 — this must not be reachable from the network.
    server.listen(port, "127.0.0.1", () => ok({ server, port, token }));
  });
}
