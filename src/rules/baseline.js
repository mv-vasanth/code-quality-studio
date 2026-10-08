/**
 * Baseline — accept today's findings, fail only on new ones.
 *
 * A real suite does not start clean. One Playwright project here reports 288
 * criticals in its specs and 835 in its page objects; a gate that fails on all
 * of them fails every build forever and gets switched off within a week. The
 * baseline records current reality so existing debt stays visible but
 * non-blocking, while anything new breaks the build.
 *
 * Findings are keyed by file and rule id, counted — not by line number.
 * Line numbers move whenever anyone edits above a finding, so a line-keyed
 * baseline churns on unrelated changes and quickly gets regenerated out of
 * spite. "This file gained a third hard wait" is both stable and the thing
 * worth alerting on. The cost is that we cannot say *which* occurrence is new,
 * only that there is one more than before.
 */

export const BASELINE_VERSION = 1;

/** Paths are stored relative to the baseline file so CI and laptops agree. */
function relativise(file, rootDir) {
  if (!rootDir) return file;
  const root = rootDir.endsWith("/") ? rootDir : rootDir + "/";
  return file.startsWith(root) ? file.slice(root.length) : file;
}

/**
 * @param results [{ file, result }]
 * @returns { "path/to/file.ts": { "PW-REL-001": 4 } }
 */
export function countFindings(results, rootDir) {
  const counts = {};
  for (const { file, result } of results) {
    const key = relativise(file, rootDir);
    for (const f of result.findings ?? []) {
      counts[key] ??= {};
      counts[key][f.ruleId] = (counts[key][f.ruleId] ?? 0) + 1;
    }
  }
  return counts;
}

/** Merge a stack's counts into an existing baseline, leaving other files alone. */
export function mergeCounts(existing, incoming) {
  return { ...(existing ?? {}), ...incoming };
}

export function buildBaseline(files, { cqsVersion } = {}) {
  return {
    version: BASELINE_VERSION,
    createdAt: new Date().toISOString(),
    cqsVersion: cqsVersion ?? null,
    note: "Counts of accepted findings per file per rule. New findings beyond these counts fail the build.",
    files,
  };
}

/**
 * What is new relative to the baseline.
 *
 * A rule whose count dropped is an improvement and is reported, so the
 * baseline can be re-recorded to lock the gain in. A file absent from the
 * baseline is entirely new, and all of its findings count as new.
 */
export function diffAgainstBaseline(results, baseline, rootDir) {
  const current = countFindings(results, rootDir);
  const accepted = baseline?.files ?? {};

  const newFindings = [];
  let fixed = 0;

  for (const { file, result } of results) {
    const key = relativise(file, rootDir);
    const acceptedForFile = accepted[key] ?? {};
    const seen = {};

    for (const f of result.findings ?? []) {
      seen[f.ruleId] = (seen[f.ruleId] ?? 0) + 1;
      // Report the occurrences beyond the accepted count. Which specific one
      // is "new" is unknowable with counts, so the later ones are reported —
      // arbitrary, but consistent between runs.
      if (seen[f.ruleId] > (acceptedForFile[f.ruleId] ?? 0)) {
        newFindings.push({ ...f, _file: file });
      }
    }
  }

  // Only files that were actually audited can be said to have improved.
  // Without this, auditing a subdirectory — or --changed, which audits a
  // handful of files — reports every untouched file in the baseline as
  // "fixed", which is both wrong and flattering.
  const auditedKeys = new Set(results.map(({ file }) => relativise(file, rootDir)));
  for (const [key, rules] of Object.entries(accepted)) {
    if (!auditedKeys.has(key)) continue;
    for (const [ruleId, count] of Object.entries(rules)) {
      const now = current[key]?.[ruleId] ?? 0;
      if (now < count) fixed += count - now;
    }
  }

  return {
    newFindings,
    fixed,
    acceptedTotal: Object.values(accepted).reduce(
      (n, rules) => n + Object.values(rules).reduce((a, b) => a + b, 0), 0),
    currentTotal: Object.values(current).reduce(
      (n, rules) => n + Object.values(rules).reduce((a, b) => a + b, 0), 0),
  };
}
