import { escapeHtml, formatReportDate } from "./reportUtils.js";
import { reportBaseCss, verdictCssVars } from "./reportTheme.js";
import { buildExecutiveHtml } from "./buildExecutiveSummary.js";
import { buildHtmlReport } from "./buildHtmlReport.js";
import { buildMarkdownReport } from "./buildMarkdownReport.js";

function extractBodyInner(html) {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : html;
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Single downloadable HTML: executive summary + full findings + in-page export of .md / .json.
 */
export function buildCompleteHtmlReport(payload) {
  const md = buildMarkdownReport(payload);
  const json = JSON.stringify(payload, null, 2);
  const mdB64 = toBase64Utf8(md);
  const jsonB64 = toBase64Utf8(json);
  const base = payload.projectName || "audit";
  const stamp = (payload.generatedAt || "").slice(0, 10);

  const execFragment = extractBodyInner(buildExecutiveHtml(payload));
  let fullFragment = extractBodyInner(buildHtmlReport(payload));
  fullFragment = fullFragment.replace(/<header[\s\S]*?<\/header>/i, "");
  fullFragment = fullFragment.replace(/<footer[\s\S]*?<\/footer>/gi, "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(base)} — Complete quality report</title>
  <style>
    ${reportBaseCss()}
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 16px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      margin-bottom: 20px;
      position: sticky;
      top: 8px;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(15,23,42,0.06);
    }
    .toolbar span { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; align-self: center; margin-right: 8px; }
    .toolbar button {
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid #99f6e4;
      background: #0d9488;
      color: #fff;
    }
    .toolbar button.secondary { background: #fff; color: #0f766e; }
    .toolbar button.ghost { background: #f8fafc; color: #475569; border-color: #e2e8f0; }
    .part { margin-bottom: 32px; }
    .part-label {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e2e8f0;
    }
    footer.report-foot { text-align: center; color: #94a3b8; font-size: 0.8rem; margin-top: 32px; }
  </style>
</head>
<body style="${verdictCssVars(payload.verdict.tone)}">
  <div class="wrap">
    <header class="report-hero">
      <h1>${escapeHtml(base)}</h1>
      <div class="sub">${escapeHtml(payload.reportNoun || "Quality")} · complete report · ${escapeHtml(payload.auditStack || "Quality")} · ${escapeHtml(formatReportDate(payload.generatedAt))}</div>
    </header>

    <div class="toolbar" role="navigation" aria-label="Report downloads">
      <span>Export</span>
      <button type="button" onclick="cqsDownload('markdown')">Markdown (.md)</button>
      <button type="button" class="secondary" onclick="cqsDownload('json')">JSON data</button>
      <button type="button" class="ghost" onclick="window.print()">Print / PDF</button>
    </div>

    <div class="part">
      <div class="part-label">Part 1 — Executive summary</div>
      ${execFragment}
    </div>

    <div class="part">
      <div class="part-label">Part 2 — Detailed findings &amp; scorecard</div>
      ${fullFragment}
    </div>

    <footer class="report-foot">Code Quality Studio — share this file with stakeholders; use toolbar to export Markdown or JSON.</footer>
  </div>
  <script>
    const PQS_EXPORT = {
      md: "${mdB64}",
      json: "${jsonB64}",
      base: ${safeJsonForScript(base)},
      stamp: ${safeJsonForScript(stamp)}
    };
    function cqsDownload(kind) {
      const b64 = kind === "json" ? PQS_EXPORT.json : PQS_EXPORT.md;
      const mime = kind === "json" ? "application/json" : "text/markdown;charset=utf-8";
      const ext = kind === "json" ? "json" : "md";
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const raw = new TextDecoder().decode(bytes);
      const blob = new Blob([raw], { type: mime });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = PQS_EXPORT.base.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-audit-" + PQS_EXPORT.stamp + "." + ext;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  </script>
</body>
</html>`;
}
