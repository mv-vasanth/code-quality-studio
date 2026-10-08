/**
 * Merge cross-file duplicate findings into per-file results.
 *
 * The duplicate detector has existed for a while but only the web app called
 * it, so `cqz ./tests/` and the MCP server reported no duplicates at all —
 * the same "shared engine, one entry point benefits" problem as the routing.
 * Both the merge and the rescoring live here so the three callers cannot
 * drift apart again.
 *
 * Note the scope: block extraction looks for `test`, `describe`, `beforeEach`
 * and friends, so it finds duplicates in JavaScript and TypeScript test files
 * and returns nothing for Java, Python or XML. No false findings there, but
 * no coverage either.
 */
import { scoreFromFindings } from "./analyzerUtils.js";
import { runCrossFileAnalysis } from "./crossFileAnalyzer.js";

/**
 * A result with cross-file findings added and its scores recomputed.
 * Previous cross-file findings are dropped first, so re-running is idempotent.
 */
export function withCrossFileFindings(result, extra, categoryIds) {
  if (!extra?.length || !result) return result;

  const base = (result.findings || []).filter((f) => !f._crossFile);
  const findings = [...base, ...extra];

  const categoryScores = Object.fromEntries(
    categoryIds.map((id) => [id, scoreFromFindings(findings, id)]),
  );
  const overallScore = Math.round(
    categoryIds.reduce((sum, id) => sum + categoryScores[id], 0) / categoryIds.length,
  );
  return { ...result, findings, categoryScores, overallScore };
}

/**
 * Run duplicate detection across a set of analysed files and fold the results
 * back in.
 *
 * @param results      [{ file, result }] as the CLI and MCP server build them
 * @param contentFor   (file) => string
 * @param categoryIds  category ids for the stack, for rescoring
 * @returns { results, duplicateCount }
 */
export function applyCrossFileAnalysis(results, contentFor, categoryIds) {
  if (!results || results.length < 2) return { results, duplicateCount: 0 };

  const eligible = results
    .map(({ file }) => ({ name: file, content: contentFor(file) }))
    .filter((f) => f.content);
  if (eligible.length < 2) return { results, duplicateCount: 0 };

  const byFile = runCrossFileAnalysis(eligible);
  const total = Object.values(byFile).reduce((n, list) => n + list.length, 0);
  if (!total) return { results, duplicateCount: 0 };

  return {
    duplicateCount: total,
    results: results.map(({ file, result }) => ({
      file,
      result: withCrossFileFindings(result, byFile[file], categoryIds),
    })),
  };
}
