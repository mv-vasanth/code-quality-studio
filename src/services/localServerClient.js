/**
 * Client for `cqs serve` — the optional local companion.
 *
 * The browser can only see files you hand it through a picker, which means
 * the app audits what you selected rather than what is on disk. When the
 * companion is running it can scan a real directory instead, including the
 * files you would not think to pick.
 *
 * Entirely optional. Nothing here runs unless a server is actually up, and
 * `detect()` is cheap enough to call on load and forget about.
 */

const DEFAULT_PORT = 4000;
const STORAGE_KEY = "cqs-local-server";

/** Where the token lives between reloads. Per-origin, and only ever localhost. */
function remember(state) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}
export function recall() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
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
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: ctl.signal });
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
 * @param path   absolute or relative to wherever `cqs serve` was started
 * @param token  printed once by `cqs serve`
 * @param opts   { stack, app, appOnly, port }
 */
export async function auditPath(path, token, opts = {}) {
  const port = opts.port ?? DEFAULT_PORT;
  const res = await fetch(`http://127.0.0.1:${port}/audit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cqs-token": token },
    body: JSON.stringify({
      path,
      stack: opts.stack ?? undefined,
      app: Boolean(opts.app),
      appOnly: Boolean(opts.appOnly),
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("That token was rejected. Copy the one printed by `cqs serve`.");
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
