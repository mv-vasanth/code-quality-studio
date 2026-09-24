#!/usr/bin/env node
// ─── Polyfill browser globals for the shared rule-engine modules ─────────────
// The core analyzers were written for the browser; these stubs let them run
// in Node.js without any code changes.
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    _store: Object.create(null),
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
    clear() { this._store = Object.create(null); },
  };
}
if (typeof globalThis.sessionStorage === "undefined") {
  globalThis.sessionStorage = globalThis.localStorage;
}

import "../src/cli.js";
