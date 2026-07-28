import { formatReportDate } from "./reportUtils.js";

function section(title, lines) {
  lines.push("");
  lines.push(`## ${title}`);
  lines.push("");
}

export function buildMarkdownReport(payload) {
  const lines = [];
  const { projectName, generatedAt, analysisMode, verdict, summary, fileScores, findingsBySeverity, topPriorities, auditStack } =
    payload;

  lines.push(`# Playwright Quality Report`);
  lines.push("");
  lines.push(`**Project:** ${projectName}  `);
  lines.push(`**Date:** ${formatReportDate(generatedAt)}  `);
  lines.push(`**Stack:** ${auditStack ?? "Quality audit"}  `);
  lines.push(`**How analysed:** ${analysisMode}`);
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push(`### At a glance: ${verdict.headline}`);
  lines.push("");
  lines.push(verdict.detail);
  lines.push("");
  lines.push(
    `| | Count |`,
    `| --- | ---: |`,
    `| Average score | **${summary.averageScore ?? "—"}**${summary.averageGrade ? ` (${summary.averageGrade})` : ""} |`,
    `| Files analysed | ${summary.filesAnalysed} of ${summary.filesLoaded} |`,
    `| Critical | ${summary.criticalCount} |`,
    `| Warnings | ${summary.warningCount} |`,
    `| Info | ${summary.infoCount} |`,
  );
  lines.push("");

  if (topPriorities.length) {
    section("Start here (top priority per file)", lines);
    topPriorities.forEach((p, i) => {
      lines.push(`${i + 1}. **${p.file}** — ${p.text}`);
    });
    lines.push("");
  }

  const renderFindingList = (items, startIndex = 1) => {
    items.forEach((f, i) => {
      const n = startIndex + i;
      lines.push(`### ${n}. ${f.title}`);
      lines.push("");
      lines.push(`| | |`);
      lines.push(`| --- | --- |`);
      lines.push(`| Severity | **${(f.severity || "info").toUpperCase()}** |`);
      lines.push(`| File | \`${f.fileName || "—"}\`${f.line ? ` (line ${f.line})` : ""} |`);
      lines.push(`| Category | ${f.categoryLabel || f.category || "—"} |`);
      if (f.ruleId) lines.push(`| Rule | \`${f.ruleId}\` |`);
      lines.push("");
      if (f.description) {
        lines.push("**1 — Problem**");
        lines.push("");
        lines.push(f.description);
        lines.push("");
      }
      if (f.whyUse || f.howHelps || f.impact || f.simpleTerms) {
        lines.push("**2 — Why change this**");
        lines.push("");
        if (f.simpleTerms) lines.push(`**In simple terms:** ${f.simpleTerms}`);
        if (f.whyUse) lines.push(`**Why use this:** ${f.whyUse}`);
        if (f.howHelps) lines.push(`**How it helps:** ${f.howHelps}`);
        if (f.impact && f.impact !== f.howHelps) lines.push(`**Risk if ignored:** ${f.impact}`);
        lines.push("");
      }
      if (f.actualCode || f.solutionCode || f.fix) {
        lines.push("**3 — Your code vs recommended fix**");
        lines.push("");
        if (f.section3TieIn) lines.push(`_${f.section3TieIn}_`);
        if (f.section3Guidance) lines.push(f.section3Guidance);
        lines.push("");
        if (f.actualCode && (f.solutionCode || f.fix)) {
          lines.push(`**${f.actualCodeLabel || "Your code (now)"}**`);
          lines.push("```ts");
          lines.push(f.actualCode);
          lines.push("```");
          lines.push("");
          lines.push("**Recommended**");
          lines.push("```ts");
          lines.push(f.solutionCode || f.fix);
          lines.push("```");
        } else {
          lines.push("```ts");
          lines.push(f.solutionCode || f.fix);
          lines.push("```");
        }
        lines.push("");
      }
      if (f.reference) {
        lines.push(`> Docs: ${f.reference}`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    });
  };

  if (findingsBySeverity.critical.length) {
    section(`Fix now — critical (${findingsBySeverity.critical.length})`, lines);
    renderFindingList(findingsBySeverity.critical, 1);
  }

  if (findingsBySeverity.warning.length) {
    section(`Fix soon — warnings (${findingsBySeverity.warning.length})`, lines);
    renderFindingList(findingsBySeverity.warning, 1);
  }

  if (findingsBySeverity.info.length) {
    section(`Suggestions — info (${findingsBySeverity.info.length})`, lines);
    renderFindingList(findingsBySeverity.info, 1);
  }

  if (!payload.findings.length) {
    section("Findings", lines);
    lines.push("No issues were flagged by the automated rules for the analysed files.");
    lines.push("");
  }

  if (fileScores.length) {
    section("File scorecard", lines);
    lines.push("| File | Score | Grade | Priority |");
    lines.push("| --- | ---: | --- | --- |");
    for (const f of fileScores) {
      const pri = (f.topPriority || "—").replace(/\|/g, "/");
      lines.push(`| ${f.fileName} | ${f.overallScore} | ${f.grade} | ${pri} |`);
    }
    lines.push("");
  }

  if (payload.pendingFiles?.length) {
    section("Not analysed yet", lines);
    payload.pendingFiles.forEach((p) => lines.push(`- \`${p}\``));
    lines.push("");
  }

  if (payload.analysisFailures?.length) {
    section("Analysis errors", lines);
    payload.analysisFailures.forEach((e) => lines.push(`- **${e.path}:** ${e.error || "Unknown"}`));
    lines.push("");
  }

  if (payload.bestPracticesNotMarkedPassed?.length) {
    section("Best practices still to confirm", lines);
    lines.push("These were not checked off in the app checklist (team may still need to adopt them):");
    lines.push("");
    payload.bestPracticesNotMarkedPassed.forEach((t) => lines.push(`- [ ] ${t}`));
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Generated by Playwright Quality Studio — standard rule checks; optional AI for deeper review.*");

  return lines.join("\n");
}
