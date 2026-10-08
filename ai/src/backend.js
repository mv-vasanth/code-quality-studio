/**
 * The local model: loading it, using it, and — the part that usually gets
 * forgotten — giving the memory back.
 *
 * ── Why this shape ────────────────────────────────────────────────────────
 *
 * `@huggingface/transformers` is an *optional* dependency. The CLI is bundled
 * by esbuild with `packages: "external"` and a build guard that fails on any
 * import which will not exist at runtime, because a stray package import once
 * shipped in three consecutive releases and killed every command including
 * --help. So the import here is built at runtime from parts: esbuild cannot
 * resolve it statically, nothing is bundled, and a user who never enables the
 * feature never installs a 100 MB model or an ONNX runtime.
 *
 * The session is a singleton behind a promise, so ten concurrent requests load
 * one model rather than ten. It unloads itself after an idle period and on
 * process exit — a classifier holding ~200 MB resident is fine while you are
 * auditing and rude an hour later.
 */

import { homedir } from "os";
import { join } from "path";

/** Zero-shot NLI. 96 MB quantised + 8 MB tokenizer = 104 MB on disk, measured. */
export const DEFAULT_MODEL = "Xenova/nli-deberta-v3-xsmall";

/** Roughly a quarter of the size, noticeably blunter. For constrained boxes. */
export const TINY_MODEL = "Xenova/mobilebert-uncased-mnli";

/** Release the model after this long with no work. */
const IDLE_UNLOAD_MS = 5 * 60 * 1000;

/** Code longer than this is truncated — these models see 512 tokens anyway. */
const MAX_CHARS = 4000;

/**
 * Where weights live.
 *
 * transformers.js defaults to a .cache inside its own node_modules directory,
 * which npm deletes on the next install — so the 104 MB is re-downloaded for
 * no reason. Keeping it beside the user's other caches means it survives
 * reinstalls and can be found and deleted deliberately.
 */
export function defaultCacheDir() {
  return process.env.CQS_MODEL_CACHE || join(homedir(), ".cache", "cqs-models");
}

let state = null;   // { promise, pipe, model, idleTimer, loadedAt }
let exitHooked = false;

/**
 * Import the optional dependency without esbuild noticing.
 *
 * Assembled at runtime on purpose. A plain `import("@huggingface/transformers")`
 * is statically analysable, so the bundler records it as an external import and
 * the build guard rejects it.
 */
async function loadLibrary() {
  const specifier = ["@huggingface", "transformers"].join("/");
  try {
    return await import(/* @vite-ignore */ specifier);
  } catch (cause) {
    const err = new Error(
      "Local AI is enabled but @huggingface/transformers is not installed.\n" +
      "  Install it where cqs runs:  npm install @huggingface/transformers\n" +
      "  It is optional on purpose — without it nothing is downloaded and the\n" +
      "  static rules are unaffected.",
    );
    err.cause = cause;
    err.code = "CQS_LOCAL_AI_MISSING";
    throw err;
  }
}

/**
 * Load (or reuse) the classifier.
 *
 * @param {{ model?: string, cacheDir?: string, onProgress?: (p: any) => void }} [opts]
 */
export async function getClassifier(opts = {}) {
  if (state?.promise) {
    touch();
    return state.promise;
  }

  const model = opts.model || process.env.CQS_LOCAL_MODEL || DEFAULT_MODEL;

  const promise = (async () => {
    const { pipeline, env } = await loadLibrary();

    // Set before the pipeline is built, or the first download lands somewhere
    // else and the second run re-fetches 104 MB.
    env.cacheDir = opts.cacheDir || defaultCacheDir();

    // Node has a filesystem; let it cache. (Defaults differ between the
    // browser and Node builds, and the browser default is "do not".)
    env.useBrowserCache = false;
    env.allowLocalModels = true;

    const pipe = await pipeline("zero-shot-classification", model, {
      // Quantised is the whole point: 87 MB instead of 284 MB, and the
      // accuracy difference on short classification prompts is small.
      dtype: "q8",
      progress_callback: opts.onProgress,
    });

    return pipe;
  })();

  state = { promise, pipe: null, model, idleTimer: null, loadedAt: Date.now() };

  try {
    state.pipe = await promise;
  } catch (e) {
    state = null;           // a failed load must not be cached
    throw e;
  }

  hookExit();
  touch();
  return state.pipe;
}

/** Is a model currently resident? */
export function isLoaded() {
  return Boolean(state?.pipe);
}

export function currentModel() {
  return state?.model ?? null;
}

/** Reset the idle countdown. */
function touch() {
  if (!state) return;
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => { void shutdown("idle"); }, IDLE_UNLOAD_MS);
  // Do not hold the event loop open just to time an unload.
  state.idleTimer.unref?.();
}

/**
 * Release the model and its memory.
 *
 * Safe to call when nothing is loaded, and safe to call twice — shutdown paths
 * fire more than once more often than anyone expects.
 */
export async function shutdown(reason = "requested") {
  const current = state;
  state = null;
  if (!current) return { unloaded: false, reason };

  clearTimeout(current.idleTimer);
  try {
    const pipe = current.pipe ?? await current.promise.catch(() => null);
    // dispose() frees the ONNX session; without it the weights stay resident
    // for the life of the process even with no references left.
    await pipe?.dispose?.();
  } catch { /* already gone */ }

  return { unloaded: true, reason, model: current.model };
}

/** Tie the model's life to the process's, once. */
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, () => {
      void shutdown(sig).finally(() => process.exit(0));
    });
  }
  // 'exit' is synchronous, so dispose() cannot be awaited here — but the
  // process is going away, which frees it anyway. This is for the ordinary
  // path where someone forgot to call shutdown().
  process.once("beforeExit", () => { void shutdown("beforeExit"); });
}

/** Trim code to something the model can actually read. */
export function clip(code) {
  const text = String(code ?? "");
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}
