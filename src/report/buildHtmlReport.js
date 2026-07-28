import { escapeHtml, formatReportDate } from "./reportUtils.js";
import { verdictTone, severity } from "./reportTheme.js";

function severityStyle(sev) {
  const s = severity[sev] || severity.info;
  return { bg: s.bg, badge: s.color, label: s.label };
}


function findingSection2Block(f) {
  if (!f.whyUse && !f.howHelps && !f.impact && !f.simpleTerms) return "";
  const simple = f.simpleTerms
    ? `<p class="simple-terms"><strong>In simple terms:</strong> ${escapeHtml(f.simpleTerms)}</p>`
    : "";
  return `<p><strong>2 — Why change this</strong>${simple}
      ${f.whyUse ? `<br><strong>Why use this:</strong> ${escapeHtml(f.whyUse)}` : ""}
      ${f.howHelps ? `<br><strong>How it helps:</strong> ${escapeHtml(f.howHelps)}` : ""}
      ${f.impact && f.impact !== f.howHelps ? `<br><strong>Risk if ignored:</strong> ${escapeHtml(f.impact)}` : ""}
    </p>`;
}

function findingSection3Block(f) {
  const solution = f.solutionCode || f.fix;
  if (!f.actualCode && !solution) return "";
  const tie = f.section3TieIn || "Applying the recommended fix below addresses the risks described in Why change this above.";
  const guidance = f.section3Guidance || "";
  let code = "";
  if (f.actualCode && solution) {
    code = `<div class="fix-cols">
      <div><div class="col-label actual-label">${escapeHtml(f.actualCodeLabel || "Your code (now)")}</div><pre class="actual"><code>${escapeHtml(f.actualCode)}</code></pre></div>
      <div><div class="col-label">Recommended</div><pre><code>${escapeHtml(solution)}</code></pre></div>
    </div>`;
  } else if (solution) {
    code = `<pre><code>${escapeHtml(solution)}</code></pre>`;
  }
  return `<p><strong>3 — Your code vs recommended fix</strong><br><em>${escapeHtml(tie)}</em>${guidance ? `<br>${escapeHtml(guidance)}` : ""}</p>${code}`;
}

function findingCard(f, index) {
  const s = severityStyle(f.severity);
  return `
  <article class="finding" style="background:${s.bg};border-left:4px solid ${s.badge}">
    <div class="finding-head">
      <span class="badge" style="background:${s.badge}">${escapeHtml(s.label)}</span>
      <h3>${index}. ${escapeHtml(f.title)}</h3>
    </div>
    <table class="meta">
      <tr><th>File</th><td><code>${escapeHtml(f.fileName || "—")}</code>${f.line ? ` · line ${f.line}` : ""}</td></tr>
      <tr><th>Category</th><td>${escapeHtml(f.categoryLabel || f.category || "—")}</td></tr>
      ${f.ruleId ? `<tr><th>Rule</th><td><code>${escapeHtml(f.ruleId)}</code></td></tr>` : ""}
    </table>
    ${f.description ? `<p><strong>1 — Problem</strong><br>${escapeHtml(f.description)}</p>` : ""}
    ${findingSection2Block(f)}
    ${findingSection3Block(f)}
    ${f.reference ? `<p class="ref">📖 ${escapeHtml(f.reference)}</p>` : ""}
  </article>`;
}

function sectionBlock(title, inner) {
  return `<section class="block"><h2>${escapeHtml(title)}</h2>${inner}</section>`;
}

export function buildHtmlReport(payload) {
  const tone = verdictTone[payload.verdict.tone] || verdictTone.neutral;
  const { summary, verdict, fileScores, findingsBySeverity, topPriorities, projectName, analysisMode, generatedAt } =
    payload;

  const scorecard =
    fileScores.length === 0
      ? "<p>No analysed files.</p>"
      : `<table class="scorecard">
      <thead><tr><th>File</th><th>Score</th><th>Grade</th><th>Top priority</th></tr></thead>
      <tbody>
      ${fileScores
        .map(
          (f) =>
            `<tr><td><code>${escapeHtml(f.fileName)}</code></td><td><strong>${f.overallScore}</strong></td><td>${escapeHtml(f.grade)}</td><td>${escapeHtml(f.topPriority || "—")}</td></tr>`,
        )
        .join("")}
      </tbody></table>`;

  const priorities =
    topPriorities.length === 0
      ? ""
      : `<ol>${topPriorities.map((p) => `<li><strong>${escapeHtml(p.file)}</strong> — ${escapeHtml(p.text)}</li>`).join("")}</ol>`;

  const renderGroup = (title, items) => {
    if (!items.length) return "";
    return sectionBlock(
      title,
      items.map((f, i) => findingCard(f, i + 1)).join(""),
    );
  };

  const gaps =
    payload.bestPracticesNotMarkedPassed?.length > 0
      ? sectionBlock(
          "Best practices still to confirm",
          `<p>Not checked off in the app checklist:</p><ul>${payload.bestPracticesNotMarkedPassed.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`,
        )
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(projectName)} — ${escapeHtml(payload.auditStack || "Quality")} Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; background: #f1f5f9; color: #1e293b; line-height: 1.5; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 24px 20px 48px; }
    header { background: #1e1b4b; color: #fff; padding: 28px 20px; border-radius: 12px; margin-bottom: 20px; }
    header h1 { margin: 0 0 8px; font-size: 1.5rem; }
    header .sub { color: #99f6e4; font-size: 0.9rem; }
    .verdict { padding: 16px 18px; border-radius: 10px; border: 1px solid ${tone.border}; background: ${tone.bg}; color: ${tone.color}; margin-bottom: 20px; }
    .verdict h2 { margin: 0 0 6px; font-size: 1.15rem; }
    .verdict p { margin: 0; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 24px; }
    .stat { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center; }
    .stat .n { font-size: 1.6rem; font-weight: 800; color: #0d9488; }
    .stat .l { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .block { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; }
    .block h2 { margin: 0 0 14px; font-size: 1.1rem; color: #0f172a; }
    table.scorecard { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    table.scorecard th, table.scorecard td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
    table.scorecard th { color: #64748b; font-size: 0.75rem; text-transform: uppercase; }
    .finding { padding: 14px 16px; border-radius: 8px; margin-bottom: 12px; }
    .finding-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 8px; }
    .finding h3 { margin: 0; font-size: 1rem; flex: 1; }
    .badge { color: #fff; font-size: 0.65rem; font-weight: 800; padding: 4px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.05em; }
    table.meta { width: 100%; font-size: 0.85rem; margin-bottom: 10px; }
    table.meta th { text-align: left; width: 90px; color: #64748b; font-weight: 600; vertical-align: top; padding: 2px 8px 2px 0; }
    table.meta td { padding: 2px 0; }
    .fix-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
    @media (max-width: 640px) { .fix-cols { grid-template-columns: 1fr; } }
    .col-label { font-size: 0.7rem; font-weight: 700; margin-bottom: 4px; }
    .actual-label { color: #b91c1c; }
    pre.actual { background: #1c1917; color: #fecaca; border: 1px solid #fca5a5; }
    .simple-terms { background: #eff6ff; padding: 8px 10px; border-radius: 8px; margin: 8px 0; color: #1e3a8a; }
    pre { background: #0f172a; color: #99f6e4; padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-size: 0.8rem; white-space: pre-wrap; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
    .ref { font-size: 0.85rem; color: #0d9488; }
    footer { text-align: center; color: #94a3b8; font-size: 0.8rem; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(projectName)}</h1>
      <div class="sub">${escapeHtml(payload.auditStack || "Quality")} Report · ${escapeHtml(formatReportDate(generatedAt))} · ${escapeHtml(analysisMode)}</div>
    </header>

    <div class="verdict">
      <h2>${escapeHtml(verdict.headline)}</h2>
      <p>${escapeHtml(verdict.detail)}</p>
    </div>

    <div class="stats">
      <div class="stat"><div class="n">${summary.averageScore ?? "—"}</div><div class="l">Avg score</div></div>
      <div class="stat"><div class="n" style="color:#dc2626">${summary.criticalCount}</div><div class="l">Critical</div></div>
      <div class="stat"><div class="n" style="color:#d97706">${summary.warningCount}</div><div class="l">Warnings</div></div>
      <div class="stat"><div class="n" style="color:#2563eb">${summary.infoCount}</div><div class="l">Info</div></div>
      <div class="stat"><div class="n">${summary.filesAnalysed}</div><div class="l">Files OK</div></div>
    </div>

    ${topPriorities.length ? sectionBlock("Start here", priorities) : ""}
    ${renderGroup(`Fix now — critical (${findingsBySeverity.critical.length})`, findingsBySeverity.critical)}
    ${renderGroup(`Fix soon — warnings (${findingsBySeverity.warning.length})`, findingsBySeverity.warning)}
    ${renderGroup(`Suggestions — info (${findingsBySeverity.info.length})`, findingsBySeverity.info)}
    ${!payload.findings.length ? sectionBlock("Findings", "<p>No issues flagged by automated rules.</p>") : ""}
    ${sectionBlock("File scorecard", scorecard)}
    ${gaps}
    <footer>Code Quality Studio — share this file with your team or attach to a ticket.</footer>
  </div>
</body>
</html>`;
}
