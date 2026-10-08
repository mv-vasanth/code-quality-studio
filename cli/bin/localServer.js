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
 *
 * ── Why the app is served from here ───────────────────────────────────────
 *
 * The CLI already carries the built web app (it inlines it into `--open`
 * reports), so serving it at `/` costs nothing and removes two sharp edges:
 * the page is then *same-origin* with the API, so CORS stops mattering, and
 * the token can be injected into the HTML instead of being copied out of a
 * terminal by hand. The token is only readable by something that can already
 * reach 127.0.0.1 — the same trust boundary as printing it.
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
  "http://localhost:4001", "http://127.0.0.1:4001",   // vite dev server
  "http://localhost:4002", "http://127.0.0.1:4002",   // vite preview
  // Vite's defaults, kept so an older checkout still works against a new CLI.
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:4173", "http://127.0.0.1:4173",
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

function sendHtml(res, html) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    // The page carries the session token, so keep it out of other origins:
    // nosniff stops it being loaded as a script, and the frame/resource
    // policies stop a remote page embedding it to probe for a live server.
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": "no-store",
  });
  res.end(html);
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
 * @param opts     { port, allowWrite, version, cwd, renderApp }
 *                 renderApp(token) => html, optional. When absent the server
 *                 is API-only and `/` reports that rather than 404ing.
 */
export function startLocalServer(handlers, opts = {}) {
  const port = opts.port ?? DEFAULT_PORT;
  const token = randomBytes(24).toString("hex");
  const allowWrite = Boolean(opts.allowWrite);

  // Our own origin, whichever port we ended up on. Browsers send Origin on
  // every non-GET request including same-origin ones, so without this the app
  // we serve is refused by the API we serve it from — and the default port
  // being in the static list above hides it until someone passes --port.
  const allowedOrigins = new Set([
    ...ALLOWED_ORIGINS,
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const originOk = !origin || allowedOrigins.has(origin);
    const corsOrigin = originOk && origin ? origin : null;

    if (!originOk) return send(res, 403, { error: `Origin not allowed: ${origin}` });
    if (req.method === "OPTIONS") return send(res, 204, {}, corsOrigin);

    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    // The app itself. Served before the token check — it *carries* the token,
    // so requiring one here would be circular. Same-origin from this point on,
    // which is why the app never has to ask the user for anything.
    if ((url.pathname === "/" || url.pathname === "/index.html") && req.method === "GET") {
      if (!opts.renderApp) {
        return send(res, 404, {
          error: "This build has no embedded app. Use the API, or run `cqs --open`.",
        }, corsOrigin);
      }
      return sendHtml(res, opts.renderApp(token));
    }

    // /health carries no data and needs no token, so the app can discover
    // whether a server is running before it has been handed one.
    if (url.pathname === "/health" && req.method === "GET") {
      return send(res, 200, {
        ok: true, version: opts.version ?? null, cwd: opts.cwd ?? process.cwd(),
        allowWrite,
        // So the studio renders the add-ons panel only when the server it is
        // talking to actually has one.
        addons: Boolean(handlers.addons),
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
      // Add-ons. The route carries the id, so there is no package name to
      // supply — a server that installs whatever a page names would be a
      // remote code execution hole with a friendly label.
      if (url.pathname.startsWith("/addons") && handlers.addons) {
        const [, , id, action] = url.pathname.split("/");

        if (!id && req.method === "GET") {
          // Awaited: list() queries each running add-on's health, so it is a
          // promise — serialising it unawaited produced a cheerful `{}` and a
          // UI that decided there were no add-ons.
          return send(res, 200, { addons: await handlers.addons.list() }, corsOrigin);
        }
        if (id && !action && req.method === "GET") {
          const one = (await handlers.addons.list()).find((a) => a.id === id);
          return one
            ? send(res, 200, one, corsOrigin)
            : send(res, 404, { error: `Unknown add-on: ${id}` }, corsOrigin);
        }
        if (action && req.method === "POST") {
          const fn = handlers.addons[action];
          if (!fn) return send(res, 404, { error: `Unknown action: ${action}` }, corsOrigin);
          const out = await fn(id, body);
          return send(res, out.ok === false ? 400 : 200, out, corsOrigin);
        }
        return send(res, 405, { error: `${req.method} not allowed here` }, corsOrigin);
      }

      // Proxied to whichever add-on provides it, so the page needs one origin
      // and one token no matter how many add-ons are running.
      if (url.pathname === "/ai-audit" && req.method === "POST") {
        if (!handlers.addons) return send(res, 404, { error: "Add-ons are not available in this build." }, corsOrigin);
        const out = await handlers.addons.proxy("cqs-ai", "/ai-audit", body);
        if (out.ok === false && out.error) return send(res, out.status ?? 500, { error: out.error }, corsOrigin);
        return send(res, out.status ?? 200, out.body, corsOrigin);
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

  // Anything the handlers loaded lazily (the local model is ~200 MB resident)
  // is released when the server closes, not left to the garbage collector.
  const close = async () => {
    await new Promise((done) => server.close(done));
    await opts.onClose?.();
  };

  return new Promise((ok, fail) => {
    server.once("error", fail);
    // 127.0.0.1, not 0.0.0.0 — this must not be reachable from the network.
    server.listen(port, "127.0.0.1", () => ok({ server, port, token, close }));
  });
}
