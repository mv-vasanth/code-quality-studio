/**
 * fixAllCritical.js — Batch AI fix agent for all critical findings.
 *
 * Iterates through files that have critical findings, calls generateAiFix
 * for each one, and returns a progress-streamed result.
 *
 * @param {object} opts
 * @param {Array}  opts.files         — all loaded files [{name, content, result}]
 * @param {object} opts.settings      — AI settings from context
 * @param {Function} opts.onProgress  — callback(current, total, fileName) for progress updates
 * @returns {Promise<Array<{fileName, ruleId, title, line, fix, error}>>}
 */
import { generateAiFix } from "./generateFix.js";

export async function fixAllCritical({ files, settings, onProgress }) {
  // Collect all critical findings across all files
  const workItems = [];
  for (const file of files) {
    const findings = (file.result?.findings || []).filter((f) => f.severity === "critical");
    for (const finding of findings) {
      workItems.push({ file, finding });
    }
  }

  if (workItems.length === 0) return [];

  const results = [];
  for (let i = 0; i < workItems.length; i++) {
    const { file, finding } = workItems[i];
    onProgress?.(i + 1, workItems.length, file.name);
    try {
      const fix = await generateAiFix({
        settings,
        fileContent: file.content || "",
        fileName: file.name,
        finding,
      });
      results.push({
        fileName: file.name,
        ruleId: finding.ruleId,
        title: finding.title,
        line: finding.line,
        severity: finding.severity,
        fix,
        error: null,
      });
    } catch (err) {
      results.push({
        fileName: file.name,
        ruleId: finding.ruleId,
        title: finding.title,
        line: finding.line,
        severity: finding.severity,
        fix: null,
        error: err.message || "AI fix failed",
      });
    }
  }
  return results;
}
