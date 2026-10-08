/**
 * Run the classifier in a child process and kill it to reclaim the memory.
 *
 * The public surface matches the in-process path exactly, so callers choose
 * isolation with a flag rather than a different API.
 */
import { fork } from "child_process";
import { fileURLToPath } from "url";

const IDLE_KILL_MS = 5 * 60 * 1000;

let child = null;
let ready = null;
let seq = 0;
const pending = new Map();
let idleTimer = null;
let exitHooked = false;

/**
 * Where the child's entry point lives.
 *
 * Importable standalone, the worker is the file next to this one. Inside the
 * bundled CLI that file does not exist on disk — there is only the single
 * bundle — so the CLI re-executes itself with CQZ_AI_WORKER=1 instead and the
 * bundle's own entry hands control to the worker loop.
 */
function defaultEntry() {
  // Set by the bundled CLI to its own path: the child is this binary again,
  // and CQZ_AI_WORKER is what tells it to run the worker loop instead of
  // parsing arguments.
  if (process.env.CQZ_AI_WORKER_ENTRY) {
    return { path: process.env.CQZ_AI_WORKER_ENTRY, env: { CQZ_AI_WORKER: "1" } };
  }
  // Imported from source, the worker really is the file next to this one.
  return { path: fileURLToPath(new URL("./worker.mjs", import.meta.url)), env: {} };
}

async function ensureChild(entry) {
  if (ready) { touch(); return ready; }

  const { path, env } = entry ?? defaultEntry();

  ready = new Promise((resolve, reject) => {
    const proc = fork(path, [], {
      // 'ipc' is what makes process.send work; the rest is inherited so the
      // child's download progress and errors land in the same terminal.
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      env: { ...process.env, ...env },
      // Never detached: the child must belong to this process group so it
      // cannot outlive the server as a stray.
      detached: false,
    });

    const onFirst = (msg) => {
      if (!msg?.ready) return;
      proc.off("message", onFirst);
      proc.on("message", onReply);
      child = proc;
      resolve(proc);
    };

    proc.on("message", onFirst);
    proc.once("error", reject);
    proc.once("exit", (code, signal) => {
      // Fail everything still waiting, rather than leaving callers hanging on
      // a process that is gone.
      for (const [, { reject: rj }] of pending) {
        rj(new Error(`local AI worker exited (code ${code}, signal ${signal})`));
      }
      pending.clear();
      child = null;
      ready = null;
      clearTimeout(idleTimer);
    });
  });

  hookExit();
  touch();
  return ready;
}

function onReply(msg) {
  if (!msg || msg.id == null) return;
  const waiter = pending.get(msg.id);
  if (!waiter) return;
  pending.delete(msg.id);
  if (msg.ok) waiter.resolve(msg.result);
  else {
    const e = new Error(msg.error || "local AI worker failed");
    if (msg.code) e.code = msg.code;
    waiter.reject(e);
  }
}

function call(cmd, payload, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`local AI worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();

    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    child.send({ id, cmd, payload });
  });
}

/** Audit in the child. Spawns it on first use. */
export async function auditIsolated(code, opts = {}) {
  await ensureChild(opts.workerEntry);
  touch();
  // workerEntry is about *where* this runs; the worker must not receive it
  // and try to fork again.
  const rest = { ...opts };
  delete rest.workerEntry;
  return call("audit", { code, opts: rest });
}

/** Load the model ahead of the first request. */
export async function warmIsolated(opts = {}) {
  await ensureChild(opts.workerEntry);
  touch();
  return call("warm", { model: opts.model, cacheDir: opts.cacheDir });
}

export function isRunning() {
  return Boolean(child);
}

export function workerPid() {
  return child?.pid ?? null;
}

/**
 * Stop the child and reclaim everything it held.
 *
 * Asks politely first so the model gets a clean dispose, then insists. The
 * SIGKILL path matters: a native addon wedged mid-inference will not act on a
 * message, and leaving 400 MB behind because we were too courteous to kill it
 * is exactly the failure this module exists to avoid.
 */
export async function shutdownIsolated(reason = "requested") {
  const proc = child;
  clearTimeout(idleTimer);
  if (!proc) return { stopped: false, reason };

  const exited = new Promise((r) => proc.once("exit", r));
  try { await call("stop", null, 4000); } catch { /* going anyway */ }

  const forced = setTimeout(() => proc.kill("SIGKILL"), 2000);
  forced.unref?.();
  await exited;
  clearTimeout(forced);

  child = null;
  ready = null;
  return { stopped: true, reason };
}

function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { void shutdownIsolated("idle"); }, IDLE_KILL_MS);
  idleTimer.unref?.();
}

function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, () => {
      void shutdownIsolated(sig).finally(() => process.exit(0));
    });
  }
  // Synchronous last resort: 'exit' cannot await, but a direct kill still
  // reaches the child before this process is gone.
  process.once("exit", () => { try { child?.kill("SIGKILL"); } catch { /* gone */ } });
}
