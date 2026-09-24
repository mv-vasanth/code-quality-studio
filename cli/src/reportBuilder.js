/**
 * reportBuilder.js
 * Generates a self-contained HTML quality report from analysis results.
 * No external dependencies — everything is inline.
 */

const SEV_COLOR = { critical: "#dc2626", warning: "#d97706", info: "#2563eb" };
const SEV_BG    = { critical: "#fef2f2", warning: "#fff7ed", info: "#eff6ff" };
const SEV_BORDER= { critical: "#fecaca", warning: "#fed7aa", info: "#bfdbfe" };

function gradeLabel(score) {
  if (score >= 90) return { label: "Excellent", color: "#059669" };
  if (score >= 75) return { label: "Good",      color: "#0d9488" };
  if (score >= 60) return { label: "Fair",       color: "#d97706" };
  return               { label: "Needs work",   color: "#dc2626" };
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Build a self-contained HTML report.
 *
 * @param {{
 *   projectName: string,
 *   stackId: string,
 *   runAt: string,
 *   files: Array<{ name: string, result: object }>,
 *   threshold: number,
 *   passed: boolean,
 * }} opts
 * @returns {string} complete HTML string
 */
export function buildHtmlReport({ projectName, stackId, runAt, files, threshold, passed }) {
  const allFindings = files.flatMap((f) =>
    (f.result?.findings ?? []).map((fi) => ({ ...fi, _file: f.name }))
  );
  const scores = files.map((f) => f.result?.overallScore ?? 0);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  const grade = gradeLabel(avgScore);
  const critical = allFindings.filter((f) => f.severity === "critical").length;
  const warnings = allFindings.filter((f) => f.severity === "warning").length;

  const findingRows = allFindings.map((f) => `
    <tr>
      <td style="padding:8px 10px;font-size:11.5px;color:#374151;font-family:monospace;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(f._file)}">${escHtml(f._file.split("/").pop())}</td>
      <td style="padding:8px 10px;text-align:center">
        <span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${SEV_BG[f.severity]||"#f1f5f9"};color:${SEV_COLOR[f.severity]||"#374151"};border:1px solid ${SEV_BORDER[f.severity]||"#e2e8f0"}">${escHtml(f.severity?.toUpperCase())}</span>
      </td>
      <td style="padding:8px 10px;font-size:12px;font-weight:600;color:#0f172a">${escHtml(f.title)}</td>
      <td style="padding:8px 10px;font-size:11px;color:#64748b;font-family:monospace">${escHtml(f.ruleId)}</td>
      <td style="padding:8px 10px;font-size:11.5px;color:#374151">${f.line != null ? `Line ${f.line}` : "—"}</td>
      <td style="padding:8px 10px;font-size:11px;color:#64748b;max-width:260px">${escHtml(f.description ?? f.fix ?? "")}</td>
    </tr>`).join("");

  const fileRows = files.map((f) => {
    const s = f.result?.overallScore ?? 0;
    const g = gradeLabel(s);
    const crit = (f.result?.findings ?? []).filter((x) => x.severity === "critical").length;
    return `
    <tr>
      <td style="padding:9px 12px;font-size:12px;color:#0f172a;font-family:monospace">${escHtml(f.name)}</td>
      <td style="padding:9px 12px;text-align:center;font-size:20px;font-weight:800;color:${g.color}">${s}</td>
      <td style="padding:9px 12px;font-size:12px;color:${g.color};font-weight:600">${g.label}</td>
      <td style="padding:9px 12px;font-size:12px;color:${crit > 0 ? "#dc2626" : "#16a34a"};font-weight:600">${crit > 0 ? `${crit} critical` : "✓ none"}</td>
      <td style="padding:9px 12px;font-size:12px;color:#64748b">${(f.result?.findings ?? []).length} findings</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escHtml(projectName)} — Quality Report</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#0f172a;-webkit-font-smoothing:antialiased}
    .header{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;padding:28px 40px}
    .header h1{font-size:22px;font-weight:800;margin-bottom:4px}
    .header .meta{font-size:12px;color:#94a3b8;margin-top:2px}
    .container{max-width:1100px;margin:0 auto;padding:28px 24px}
    .stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;margin-bottom:24px}
    .stat{background:#fff;border-radius:12px;padding:16px 18px;border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(0,0,0,.05)}
    .stat-val{font-size:28px;font-weight:800;margin-bottom:2px}
    .stat-label{font-size:11.5px;font-weight:600;color:#64748b}
    .stat-sub{font-size:11px;color:#94a3b8;margin-top:2px}
    .card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.05)}
    .card-header{padding:12px 18px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;background:#fafafa;display:flex;align-items:center;justify-content:space-between}
    .badge{padding:3px 10px;border-radius:12px;font-size:10.5px;font-weight:700}
    table{width:100%;border-collapse:collapse}
    tr:hover{background:#f8fafc}
    th{padding:8px 10px;font-size:10.5px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #f1f5f9;background:#fafafa}
    .status-pass{color:#059669;font-weight:700;font-size:13px}
    .status-fail{color:#dc2626;font-weight:700;font-size:13px}
    .footer{text-align:center;padding:20px;font-size:11px;color:#94a3b8}
  </style>
</head>
<body>
<div class="header">
  <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <div style="width:48px;height:48px;background:#0d9488;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px">⚡</div>
    <div>
      <h1>${escHtml(projectName)} — Code Quality Report</h1>
      <div class="meta">Stack: ${escHtml(stackId)} · ${escHtml(files.length)} files · Generated ${escHtml(runAt)}</div>
    </div>
    <div style="margin-left:auto;text-align:right">
      <div style="font-size:36px;font-weight:800;color:${grade.color}">${avgScore}</div>
      <div style="font-size:12px;color:#94a3b8">Overall score · ${grade.label}</div>
      <div class="${passed ? "status-pass" : "status-fail"}" style="margin-top:4px">${passed ? "✓ PASSED" : "✗ FAILED"} (threshold ${threshold})</div>
    </div>
  </div>
</div>

<div class="container">

  <!-- Stats -->
  <div class="stat-grid">
    <div class="stat">
      <div class="stat-val" style="color:${grade.color}">${avgScore}</div>
      <div class="stat-label">Avg quality score</div>
      <div class="stat-sub">${grade.label}</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:#374151">${files.length}</div>
      <div class="stat-label">Files analysed</div>
      <div class="stat-sub">${stackId}</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:${critical > 0 ? "#dc2626" : "#059669"}">${critical}</div>
      <div class="stat-label">Critical issues</div>
      <div class="stat-sub">must fix</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:${warnings > 0 ? "#d97706" : "#059669"}">${warnings}</div>
      <div class="stat-label">Warnings</div>
      <div class="stat-sub">should fix</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:#374151">${allFindings.length}</div>
      <div class="stat-label">Total findings</div>
      <div class="stat-sub">across all files</div>
    </div>
  </div>

  <!-- File scores -->
  <div class="card">
    <div class="card-header">
      File Scores
      <span class="badge" style="background:${passed?"#f0fdf4":"#fef2f2"};color:${passed?"#059669":"#dc2626"};border:1px solid ${passed?"#86efac":"#fecaca"}">${passed ? "PASSED" : "BELOW THRESHOLD"}</span>
    </div>
    <table>
      <thead><tr>
        <th>File</th><th style="text-align:center">Score</th><th>Grade</th><th>Critical</th><th>Findings</th>
      </tr></thead>
      <tbody>${fileRows}</tbody>
    </table>
  </div>

  <!-- All findings -->
  ${allFindings.length > 0 ? `
  <div class="card">
    <div class="card-header">
      All Findings
      <span class="badge" style="background:#f1f5f9;color:#374151;border:1px solid #e2e8f0">${allFindings.length} total</span>
    </div>
    <table>
      <thead><tr>
        <th>File</th><th style="text-align:center">Severity</th><th>Title</th><th>Rule</th><th>Line</th><th>Description</th>
      </tr></thead>
      <tbody>${findingRows}</tbody>
    </table>
  </div>` : `
  <div class="card">
    <div style="padding:32px;text-align:center;color:#059669;font-size:16px;font-weight:700">🎉 No findings — all files pass!</div>
  </div>`}

</div>
<div class="footer">Generated by @cqs/qcbot · Code Quality Studio · ${escHtml(runAt)}</div>
</body>
</html>`;
}
