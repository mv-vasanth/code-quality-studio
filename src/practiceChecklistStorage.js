/**
 * Checklist persistence — no React, deliberately.
 *
 * buildPayload needs loadUncheckedPracticeTitles, and buildPayload is used by
 * the CLI and the MCP server as well as the app. While this lived beside the
 * usePracticeChecklist hook, importing it dragged `react` into those bundles,
 * where it does not exist at runtime. Keep anything the report builders touch
 * free of React imports.
 */

export function loadChecked(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveChecked(storageKey, set) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function loadUncheckedPracticeTitles(storageKey, practices) {
  try {
    const raw = localStorage.getItem(storageKey);
    const passedIds = new Set(raw ? JSON.parse(raw) : []);
    return practices.filter((p) => !passedIds.has(p.id)).map((p) => p.title);
  } catch {
    return practices.map((p) => p.title);
  }
}
