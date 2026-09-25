/**
 * Is this the offline copy emitted by `cqs --open`?
 *
 * The self-contained report inlines the app and injects results, but not the
 * source files — so anything that re-reads or re-analyses code cannot work
 * there. Controls gated on this aren't merely redundant offline; they would
 * fail if clicked. See report/buildAppReport.js.
 */
export function isOfflineReport() {
  return typeof globalThis !== "undefined" && globalThis.__CQS_OFFLINE__ === true;
}
