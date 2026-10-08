/**
 * Client for `cqz serve` — the optional local companion.
 *
 * The browser can only see files you hand it through a picker, which means
 * the app audits what you selected rather than what is on disk. When the
 * companion is running it can scan a real directory instead, including the
 * files you would not think to pick.
 *
 * Entirely optional. Nothing here runs unless a server is actually up, and
 * `detect()` is cheap enough to call on load and forget about.
 *
 * Two ways in. When the page was served *by* `cqz serve`, the token is already
 * on `window` and the origin is the server's own — nothing to configure, and
 * no CORS involved. When the app is running somewhere else (vite, a static
 * host) it falls back to probing 127.0.0.1 and asking for the token.
 */

const DEFAULT_PORT = 4000;
const STORAGE_KEY = "cqz-local-server";

/**
 * Details injected by `cqz serve` into the page it serves.
 * Absent whenever the app is running anywhere else.
 */
export function injectedServer() {
  if (typeof window === "undefined") return null;
  const s = window.__CQZ_SERVER__;
  return s && typeof s.token === "string" ? s : null;
}

/** Where to reach the API: our own origin when served by it, else localhost. */
function baseUrl(port) {
  if (injectedServer() && typeof window !== "undefined") return window.location.origin;
  return `http://127.0.0.1:${port ?? DEFAULT_PORT}`;
}

/** Where the token lives between reloads. Per-origin, and only ever localhost. */
function remember(state) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}
export function recall() {
  // An injected token always wins: it is this run's, where a stored one may
  // be from a previous `cqz serve` that has since exited.
  const injected = injectedServer();
  if (injected) return { port: currentPort(), token: injected.token, injected: true };
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}

/** The port we are actually talking to — our own when served by the companion. */
function currentPort() {
  if (typeof window === "undefined") return DEFAULT_PORT;
  if (!injectedServer()) return DEFAULT_PORT;
  return Number(window.location.port) || DEFAULT_PORT;
}
export function forget() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Is a companion running? Resolves to its details or null.
 *
 * /health needs no token, so this works before the user has pasted one —
 * which is what lets the UI offer the feature only when it is usable.
 */
export async function detect(port = DEFAULT_PORT, timeoutMs = 800) {
  // Served by the companion: the token came with the page, so there is no
  // handshake to do. /health is still consulted — cheaply, same origin — so a
  // capability the page's injected blob does not mention is still discovered
  // rather than silently treated as absent.
  const injected = injectedServer();
  if (injected) {
    const base = { port: currentPort(), ok: true, injected: true, ...injected };
    try {
      const res = await fetch(`${window.location.origin}/health`);
      if (res.ok) {
        const health = await res.json();
        return { ...health, ...base, addons: health?.addons ?? base.addons };
      }
    } catch { /* same-origin fetch failed; the injected details are enough */ }
    return base;
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl(port)}/health`, { signal: ctl.signal });
    if (!res.ok) return null;
    const health = await res.json();
    return health?.ok ? { port, ...health } : null;
  } catch {
    return null;   // not running, wrong port, or blocked — all mean "no"
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Audit a directory through the companion.
 *
 * @param path   absolute or relative to wherever `cqz serve` was started
 * @param token  printed once by `cqz serve`
 * @param opts   { stack, app, appOnly, port }
 */
export async function auditPath(path, token, opts = {}) {
  const port = opts.port ?? currentPort();
  const res = await fetch(`${baseUrl(port)}/audit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cqz-token": token },
    body: JSON.stringify({
      path,
      stack: opts.stack ?? undefined,
      app: Boolean(opts.app),
      appOnly: Boolean(opts.appOnly),
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("That token was rejected. Copy the one printed by `cqz serve`.");
  if (res.status === 403) throw new Error(body.error || "The server refused this request.");
  if (!res.ok) throw new Error(body.error || `Audit failed (HTTP ${res.status})`);

  remember({ port, token });
  return body;   // { stacks: [{ stack, files, summary, results }] }
}

/**
 * Reshape a server response into the `files` the app already knows how to
 * render, so nothing downstream needs to care where results came from.
 */
export function toWorkspaceFiles(response) {
  const files = [];
  for (const entry of response?.stacks ?? []) {
    for (const r of entry.results ?? []) {
      files.push({
        name: r.file,
        status: "done",
        // No content: the server read the file, the browser never saw it.
        // Anything needing the source — re-running, AI review — stays
        // disabled for these, which is honest rather than silently broken.
        content: null,
        fromServer: true,
        resultLocal: {
          overallScore: r.overallScore,
          categoryScores: r.categoryScores,
          findings: r.findings ?? [],
        },
        resultsAi: {},
        errorsAi: {},
      });
    }
  }
  return files;
}

// ── Add-ons ──────────────────────────────────────────────────────────────────
//
// Optional extras the companion can install for you. The API takes no package
// name — the add-on id is part of the path — so this cannot be talked into
// installing something else.

async function addonCall(path, { token, port, method = "POST", body } = {}) {
  const res = await fetch(`${baseUrl(port)}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-cqz-token": token ?? recall()?.token ?? "",
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const payload = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("That token was rejected.");
  if (!res.ok) throw new Error(payload.error || `Request failed (HTTP ${res.status})`);
  return payload;
}

/** Everything the server can install, with its current state. */
export async function listAddons(opts = {}) {
  const { addons } = await addonCall("/addons", { ...opts, method: "GET" });
  return addons ?? [];
}

/**
 * Install and start one. Slow — tens of seconds — because it is really
 * running npm; callers should show that rather than block on it silently.
 */
export function installAddon(id, opts = {}) {
  return addonCall(`/addons/${id}/install`, opts);
}

/** Uninstall. `purgeModels` also deletes downloaded weights. */
export function removeAddon(id, { purgeModels = false, ...opts } = {}) {
  return addonCall(`/addons/${id}/remove`, { ...opts, body: { purgeModels } });
}

export function enableAddon(id, opts = {}) {
  return addonCall(`/addons/${id}/enable`, opts);
}

export function disableAddon(id, opts = {}) {
  return addonCall(`/addons/${id}/disable`, opts);
}

/** Ask the local AI add-on about a file. Proxied through the companion. */
export function aiAudit({ code, path, threshold, only }, opts = {}) {
  return addonCall("/ai-audit", {
    ...opts,
    body: { code, path, threshold, only, alwaysRunModel: opts.alwaysRunModel },
  });
}

/**
 * Drop the model but leave the add-on listening.
 *
 * Stopping the add-on frees this too — the model runs in a child of a child,
 * and killing the sidecar takes both down. This exists for the case where you
 * want the ~500 MB back mid-session without losing the add-on: the next
 * request reloads the model by itself.
 */
export function unloadAddonModel(id, opts = {}) {
  return addonCall(`/addons/${id}/unload`, opts);
}
