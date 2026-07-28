import { escapeHtml, formatReportDate } from "./reportUtils.js";

const TONE = {
  critical: { bg: "#fef2f2", border: "#fca5a5", color: "#b91c1c" },
  warning: { bg: "#fffbeb", border: "#fcd34d", color: "#b45309" },
  ok: { bg: "#f0fdf4", border: "#86efac", color: "#15803d" },
  neutral: { bg: "#f8fafc", border: "#e2e8f0", color: "#475569" },
};

function topActions(payload, limit = 6) {
  const items = [];
  for (const f of payload.findingsBySeverity.critical) {
    if (items.length >= limit) break;
    items.push({ level: "critical", text: f.title, file: f.fileName });
  }
  for (const p of payload.topPriorities) {
    if (items.length >= limit) break;
    if (!items.some((i) => i.text === p.text)) {
      items.push({ level: "priority", text: p.text, file: p.file });
    }
  }
  for (const f of payload.findingsBySeverity.warning) {
    if (items.length >= limit) break;
    items.push({ level: "warning", text: f.title, file: f.fileName });
  }
  return items.slice(0, limit);
}

function weakestFiles(fileScores, limit = 5) {
  return [...fileScores].sort((a, b) => a.overallScore - b.overallScore).slice(0, limit);
}

export function buildExecutiveMarkdown(payload) {
  const { projectName, auditStack, analysisMode, verdict, summary } = payload;
  const actions = topActions(payload);
  const files = weakestFiles(payload.fileScores);
  const gaps = payload.bestPracticesNotMarkedPassed?.slice(0, 3) ?? [];

  const lines = [
    `# Executive summary — ${projectName}`,
    "",
    `**Date:** ${formatReportDate(payload.generatedAt)}  `,
    `**Stack:** ${auditStack}  `,
    `**Analysis:** ${analysisMode}`,
    "",
    `## ${verdict.headline}`,
    "",
    verdict.detail,
    "",
    "| Avg score | Grade | Critical | Warnings | Files analysed |",
    "| ---: | --- | ---: | ---: | ---: |",
    `| ${summary.averageScore ?? "—"} | ${summary.averageGrade ?? "—"} | ${summary.criticalCount} | ${summary.warningCount} | ${summary.filesAnalysed} |`,
    "",
    "## Recommended actions",
    "",
  ];

  if (!actions.length) lines.push("- No open actions from automated scan.");
  else actions.forEach((a, i) => lines.push(`${i + 1}. **${a.text}**${a.file ? ` _(${a.file})_` : ""}`));

  if (files.length) {
    lines.push("", "## Lowest-scoring files", "");
    files.forEach((f) => lines.push(`- **${f.fileName}** — ${f.overallScore}/100 (${f.grade})`));
  }

  if (gaps.length) {
    lines.push("", "## Practices to confirm", "");
    gaps.forEach((g) => lines.push(`- [ ] ${g}`));
    if (payload.bestPracticesNotMarkedPassed.length > 3) {
      lines.push(`- _+${payload.bestPracticesNotMarkedPassed.length - 3} more in app checklist_`);
    }
  }

  lines.push("", "---", "_One-page summary. Use full HTML report for detailed findings and fixes._");
  return lines.join("\n");
}

export function buildExecutiveHtml(payload) {
  const tone = TONE[payload.verdict.tone] || TONE.neutral;
  const { projectName, auditStack, analysisMode, verdict, summary } = payload;
  const actions = topActions(payload);
  const files = weakestFiles(payload.fileScores);
  const gaps = payload.bestPracticesNotMarkedPassed?.slice(0, 4) ?? [];

  const actionRows = actions.length
    ? actions
        .map(
          (a, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><span class="pill ${a.level}">${a.level === "priority" ? "priority" : a.level}</span></td>
        <td>${escapeHtml(a.text)}${a.file ? ` <span class="muted">(${escapeHtml(a.file)})</span>` : ""}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No critical items from this scan.</td></tr>`;

  const fileRows = files.length
    ? files
        .map(
          (f) =>
            `<tr><td>${escapeHtml(f.fileName)}</td><td><strong>${f.overallScore}</strong></td><td>${escapeHtml(f.grade)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No analysed files.</td></tr>`;

  const gapList = gaps.length
    ? `<ul>${gaps.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>`
    : `<p class="muted">All checklist items marked in app (or none loaded).</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(projectName)} — Executive summary</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; padding: 16px 18px; font-size: 11px; line-height: 1.45; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 10px; margin-bottom: 12px; }
    .verdict { padding: 10px 12px; border-radius: 8px; border: 1px solid ${tone.border}; background: ${tone.bg}; color: ${tone.color}; margin-bottom: 12px; }
    .verdict h2 { margin: 0 0 4px; font-size: 13px; }
    .verdict p { margin: 0; font-size: 11px; }
    .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px; }
    .metric { text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 4px; }
    .metric .n { font-size: 20px; font-weight: 800; color: #0d9488; }
    .metric .l { font-size: 8px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    section { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
    section h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    th { color: #64748b; font-weight: 700; font-size: 8px; text-transform: uppercase; }
    .pill { font-size: 8px; font-weight: 800; padding: 2px 6px; border-radius: 99px; text-transform: uppercase; }
    .pill.critical { background: #fee2e2; color: #b91c1c; }
    .pill.warning { background: #fef3c7; color: #b45309; }
    .pill.priority { background: #ccfbf1; color: #0f766e; }
    .muted { color: #94a3b8; }
    ul { margin: 0; padding-left: 16px; }
    li { margin-bottom: 3px; }
    footer { margin-top: 12px; text-align: center; color: #94a3b8; font-size: 9px; }
    @media print {
      body { padding: 0; }
      section, .verdict { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(projectName)}</h1>
  <div class="meta">${escapeHtml(auditStack)} · ${escapeHtml(formatReportDate(payload.generatedAt))} · ${escapeHtml(analysisMode)}</div>

  <div class="verdict">
    <h2>${escapeHtml(verdict.headline)}</h2>
    <p>${escapeHtml(verdict.detail)}</p>
  </div>

  <div class="metrics">
    <div class="metric"><div class="n">${summary.averageScore ?? "—"}</div><div class="l">Avg score</div></div>
    <div class="metric"><div class="n" style="color:#dc2626">${summary.criticalCount}</div><div class="l">Critical</div></div>
    <div class="metric"><div class="n" style="color:#d97706">${summary.warningCount}</div><div class="l">Warnings</div></div>
    <div class="metric"><div class="n">${summary.infoCount}</div><div class="l">Info</div></div>
    <div class="metric"><div class="n">${summary.filesAnalysed}</div><div class="l">Files OK</div></div>
  </div>

  <div class="grid">
    <section>
      <h3>Recommended actions</h3>
      <table>
        <thead><tr><th>#</th><th></th><th>Action</th></tr></thead>
        <tbody>${actionRows}</tbody>
      </table>
    </section>
    <section>
      <h3>Focus files (lowest scores)</h3>
      <table>
        <thead><tr><th>File</th><th>Score</th><th>Grade</th></tr></thead>
        <tbody>${fileRows}</tbody>
      </table>
    </section>
  </div>

  <section style="margin-top:12px">
    <h3>Best practices still to confirm</h3>
    ${gapList}
  </section>

  <footer>Executive summary — Code Quality Studio. Download the full HTML report for detailed findings and fixes.</footer>
</body>
</html>`;
}
