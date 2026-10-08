/**
 * Optional add-ons, installed on request.
 *
 * `cqz-ai` is a separate package on purpose: the audit CLI is live, and a
 * 100 MB classifier with a native ONNX dependency should not be able to break
 * an install that only wanted 530 deterministic rules. But "separate package"
 * should not mean "go and read a README" — the studio can offer it as a
 * checkbox and do the work.
 *
 * ── What this deliberately does not do ────────────────────────────────────
 *
 * It never takes a package name from the request. The endpoint is
 * `POST /addons/cqz-ai/install`, not `POST /addons/install {name}` — a local
 * server that installs whatever a web page names is a remote code execution
 * hole wearing a friendly label, and no amount of token checking makes that
 * design safe. The set below is the entire set.
 *
 * Nothing is installed globally either. Everything lands in ~/.cqz/addons,
 * which needs no sudo, cannot collide with the user's own global packages,
 * and can be removed by deleting a directory.
 */
import { spawn } from "child_process";
import { existsSync, rmSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

/**
 * The complete set. Adding to it is a code change, by design.
 *
 * Empty on purpose. `cqz-ai` lived here until its classifier was measured:
 * on a clear contrast it rated robust `getByRole` selectors as *more* fragile
 * than `div:nth-child(3) > button.btn-x7f`, and on real test names it called
 * single identifiers "several behaviours". It is a natural-language entailment
 * model and source code is out of distribution for it. Offering a 104 MB
 * download that produces confident, wrong numbers is worse than offering
 * nothing, so the studio no longer offers it.
 *
 * The machinery below is kept: installing, starting, proxying and killing a
 * child process is general, it is tested, and the next add-on will need it.
 */
export const ADDONS = {};

export function addonsRoot() {
  return process.env.CQZ_ADDONS_DIR || join(homedir(), ".cqz", "addons");
}

function addonDir(id) {
  return join(addonsRoot(), "node_modules", id);
}

/** Installed? Which version? */
export function addonStatus(id) {
  const spec = ADDONS[id];
  if (!spec) return null;
  const dir = addonDir(id);
  const pkgJson = join(dir, "package.json");

  if (!existsSync(pkgJson)) {
    return { id, ...spec, installed: false, version: null, running: false };
  }
  let version = null;
  try { version = JSON.parse(readFileSync(pkgJson, "utf8")).version ?? null; } catch { /* unreadable */ }
  return {
    id, ...spec,
    installed: true,
    version,
    binPath: join(dir, spec.bin),
    running: isRunning(id),
  };
}

/**
 * Ask a running add-on how it is doing.
 *
 * Separate from addonStatus because it costs a round trip and only means
 * anything while the sidecar is up. /health needs no token on purpose, so
 * this works without carrying one around.
 */
export async function addonHealth(id) {
  const entry = running.get(id);
  if (!entry) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const res = await fetch(`http://127.0.0.1:${entry.port}/health`, { signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;        // starting up, or wedged — either way, nothing to report
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Status for every add-on, including whether a running one is currently
 * holding a model in memory — which is what the "free memory" control in the
 * UI keys off.
 */
export async function allAddonStatus() {
  return Promise.all(Object.keys(ADDONS).map(async (id) => {
    const base = addonStatus(id);
    if (!base.running) return base;
    const health = await addonHealth(id);
    return {
      ...base,
      modelLoaded: Boolean(health?.loaded),
      modelPid: health?.workerPid ?? null,
      model: health?.model ?? null,
      cacheDir: health?.cacheDir ?? null,
    };
  }));
}

/**
 * Run npm in the add-on root.
 *
 * Streams progress lines back through `onLine` so the UI can show something
 * other than a spinner for ninety seconds.
 */
function npm(args, { onLine } = {}) {
  return new Promise((resolve) => {
    const root = addonsRoot();
    mkdirSync(root, { recursive: true });

    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
      cwd: root,
      env: { ...process.env, npm_config_yes: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const lines = [];
    const take = (buf) => {
      for (const l of String(buf).split(/\r?\n/)) {
        if (!l.trim()) continue;
        lines.push(l);
        onLine?.(l);
      }
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (e) => resolve({ ok: false, code: -1, output: [...lines, e.message] }));
    child.on("close", (code) => resolve({ ok: code === 0, code, output: lines }));
  });
}

/**
 * Install the add-on.
 *
 * CQZ_AI_PACKAGE lets this point at a tarball or directory instead of the
 * registry, which is how it gets tested before the package is published.
 */
export async function installAddon(id, { onLine } = {}) {
  const spec = ADDONS[id];
  if (!spec) return { ok: false, error: `Unknown add-on: ${id}` };

  const source = (id === "cqz-ai" && process.env.CQZ_AI_PACKAGE) || id;
  const res = await npm(["install", "--no-fund", "--no-audit", "--prefix", ".", source], { onLine });

  if (!res.ok) {
    return {
      ok: false,
      error: `npm install failed (exit ${res.code}). Last output:\n  ` +
             res.output.slice(-4).join("\n  "),
      output: res.output,
    };
  }
  return { ok: true, status: addonStatus(id), output: res.output };
}

/** Remove it. The model cache is separate and only deleted when asked. */
export async function removeAddon(id, { purgeModels = false } = {}) {
  const spec = ADDONS[id];
  if (!spec) return { ok: false, error: `Unknown add-on: ${id}` };

  await stopAddon(id);
  const dir = addonDir(id);
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    return { ok: false, error: `Could not remove ${dir}: ${e.message}` };
  }

  let purged = false;
  if (purgeModels && id === "cqz-ai") {
    // Weights are expensive to re-fetch, so this is opt-in: removing the
    // package and re-adding it later should not cost another 104 MB unless
    // the user actually wanted the disk space back.
    const cache = process.env.CQZ_MODEL_CACHE || join(homedir(), ".cache", "cqz-models");
    try { if (existsSync(cache)) { rmSync(cache, { recursive: true, force: true }); purged = true; } }
    catch { /* leave it */ }
  }

  return { ok: true, status: addonStatus(id), modelsPurged: purged };
}

// ── Sidecar lifecycle ────────────────────────────────────────────────────────
//
// An installed add-on is not a running one. `cqz serve` starts it on request,
// captures the token it prints, proxies to it, and kills it on shutdown — so
// from the browser's point of view there is one origin and one token, and from
// the machine's point of view there is nothing left behind.

const running = new Map();   // id -> { child, port, token, startedAt }

export function isRunning(id) {
  return running.has(id);
}

/** Start the add-on's own server and learn its token. */
export async function startAddon(id, { onLine } = {}) {
  if (running.has(id)) return { ok: true, ...publicInfo(id) };

  const status = addonStatus(id);
  if (!status?.installed) return { ok: false, error: `${id} is not installed` };

  const port = status.port;
  const child = spawn(process.execPath, [status.binPath, "serve", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    detached: false,          // must die with us, never become a stray
  });

  const token = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error(`${id} did not start within 20s`)), 20_000);

    const scan = (chunk) => {
      // Strip ANSI first. The token is printed dimmed, so the bytes are
      // "\x1b[2m" immediately followed by hex — and \b finds no boundary
      // between the "m" of the escape and the first hex digit, both being
      // word characters. Matching the raw stream silently never fired.
      const text = String(chunk).replace(/\x1b\[[0-9;]*m/g, "");
      buf += text;
      onLine?.(text.trim());
      const m = buf.match(/(?:^|[^0-9a-f])([0-9a-f]{48})(?![0-9a-f])/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    };
    child.stdout.on("data", scan);
    child.stderr.on("data", scan);
    child.once("error", (e) => { clearTimeout(timer); reject(e); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${id} exited before it was ready (code ${code})`));
    });
  }).catch((e) => { try { child.kill("SIGKILL"); } catch { /* gone */ } throw e; });

  child.once("exit", () => running.delete(id));
  running.set(id, { child, port, token, startedAt: Date.now() });
  return { ok: true, ...publicInfo(id) };
}

export async function stopAddon(id) {
  const entry = running.get(id);
  if (!entry) return { ok: true, stopped: false };
  running.delete(id);

  const exited = new Promise((r) => entry.child.once("exit", r));
  entry.child.kill("SIGTERM");
  // It holds a ~500 MB model process of its own; if it will not go down
  // politely, insist rather than leak both.
  const forced = setTimeout(() => { try { entry.child.kill("SIGKILL"); } catch { /* gone */ } }, 4000);
  forced.unref?.();
  await exited;
  clearTimeout(forced);
  return { ok: true, stopped: true };
}

/** Stop everything. Called when `cqz serve` shuts down. */
export async function stopAllAddons() {
  await Promise.all([...running.keys()].map(stopAddon));
}

function publicInfo(id) {
  const e = running.get(id);
  // The add-on's token is deliberately not included: the browser talks to us,
  // we talk to the add-on. One token for the user to not have to think about.
  return e ? { id, running: true, port: e.port, startedAt: e.startedAt } : { id, running: false };
}

/**
 * Forward a call to a running add-on.
 *
 * A proxy rather than a redirect, so the page never needs the add-on's token
 * or its origin in an allowlist — and so an add-on that is not running cannot
 * be reached at all.
 */
export async function callAddon(id, path, body, { timeoutMs = 180_000 } = {}) {
  const entry = running.get(id);
  if (!entry) return { ok: false, status: 409, error: `${id} is not running` };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${entry.port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cqz-token": entry.token },
      body: JSON.stringify(body ?? {}),
      signal: ctl.signal,
    });
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
  } catch (e) {
    return { ok: false, status: 502, error: `${id} did not answer: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}
