import { grade } from "../shared/grade.js";
import { getGuideForStack } from "../guides/index.js";
import { loadUncheckedPracticeTitles } from "../practiceChecklistState.js";
import { severityRank, categoryLabel } from "./reportUtils.js";
import { filesWithViewResults } from "../shared/fileResults.js";
import { enrichFindingForReport } from "../shared/findingPresentation.js";

function enrichFindingRow(f, stackIdForFix, categories, files) {
  return enrichFindingForReport(f, stackIdForFix, files, categories);
}

export function buildVerdict(summary) {
  if (summary.criticalCount > 0) {
    return {
      headline: "Needs immediate attention",
      detail: `${summary.criticalCount} critical issue(s) should be fixed before relying on this code in production or CI.`,
      tone: "critical",
    };
  }
  if (summary.warningCount > 0) {
    return {
      headline: "Good enough to ship, but improve soon",
      detail: `${summary.warningCount} warning(s) may cause bugs, flakiness, or maintenance cost.`,
      tone: "warning",
    };
  }
  if (summary.totalFindings === 0 && summary.filesAnalysed > 0) {
    return {
      headline: "No standard-rule violations found",
      detail: "Automated checks did not flag issues. Manual review and the best-practice checklist still apply.",
      tone: "ok",
    };
  }
  return {
    headline: "Review in progress",
    detail: "Load source files and run analysis to populate this report.",
    tone: "neutral",
  };
}

export function buildFindingsReportPayload({
  projectName,
  files,
  categories,
  analysisModeLabel,
  auditStack,
  resultsView = "local",
}) {
  const view = resultsView === "compare-all" || resultsView === "compare" ? "local" : resultsView;
  files = filesWithViewResults(files, view);
  const analysed = files.filter((f) => f.result);
  const failed = files.filter((f) => f.status === "error");
  const pending = files.filter((f) => !f.result && f.status !== "error");

  const allFindings = analysed.flatMap((f) =>
    (f.result.findings || []).map((fi) => ({
      ...fi,
      sourceFile: f.name,
      fileName: f.name.split("/").pop(),
    })),
  );

  const sortedFindings = [...allFindings].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      (a.sourceFile || "").localeCompare(b.sourceFile || "") ||
      (a.line || 0) - (b.line || 0),
  );

  const avgScore = analysed.length
    ? Math.round(analysed.reduce((s, f) => s + f.result.overallScore, 0) / analysed.length)
    : null;

  const summary = {
    filesLoaded: files.length,
    filesAnalysed: analysed.length,
    filesFailed: failed.length,
    filesPending: pending.length,
    averageScore: avgScore,
    averageGrade: avgScore != null ? grade(avgScore).label : null,
    criticalCount: allFindings.filter((f) => f.severity === "critical").length,
    warningCount: allFindings.filter((f) => f.severity === "warning").length,
    infoCount: allFindings.filter((f) => f.severity === "info").length,
    totalFindings: allFindings.length,
  };

  const topPriorities = analysed
    .map((f) => ({ file: f.name.split("/").pop(), text: f.result.topPriority }))
    .filter((p) => p.text);

  const stackId = auditStack?.id ?? "playwright";
  const guide = getGuideForStack(stackId);
  const stackIdForFix = auditStack?.id ?? "playwright";
  const checklistKey = auditStack?.checklistStorageKey ?? "pqs-playwright-practices";

  return {
    generatedAt: new Date().toISOString(),
    projectName: projectName || auditStack?.defaultProjectName || "Quality audit",
    auditStack: auditStack?.name ?? "Playwright E2E",
    analysisMode: analysisModeLabel || "unknown",
    verdict: buildVerdict(summary),
    summary,
    topPriorities,
    fileScores: analysed.map((f) => ({
      path: f.name,
      fileName: f.name.split("/").pop(),
      overallScore: f.result.overallScore,
      grade: grade(f.result.overallScore).label,
      summary: f.result.summary,
      topPriority: f.result.topPriority,
      categoryScores: f.result.categoryScores,
      metrics: f.result.metrics,
      positives: f.result.positives,
      roadmap: f.result.roadmap,
    })),
    findings: (() => {
      return sortedFindings.map((f) => enrichFindingRow(f, stackIdForFix, categories, files));
    })(),
    findingsBySeverity: (() => {
      const enriched = sortedFindings.map((f) => enrichFindingRow(f, stackIdForFix, categories, files));
      return {
        critical: enriched.filter((f) => f.severity === "critical"),
        warning: enriched.filter((f) => f.severity === "warning"),
        info: enriched.filter((f) => f.severity === "info"),
      };
    })(),
    analysisFailures: failed.map((f) => ({ path: f.name, error: f.error })),
    pendingFiles: pending.map((f) => f.name),
    bestPracticesNotMarkedPassed: loadUncheckedPracticeTitles(checklistKey, guide.practices),
    categories: categories.map((c) => ({ id: c.id, label: c.label })),
  };
}
