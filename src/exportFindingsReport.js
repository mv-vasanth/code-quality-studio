import { buildFindingsReportPayload } from "./report/buildPayload.js";
import { buildMarkdownReport } from "./report/buildMarkdownReport.js";
import { buildHtmlReport } from "./report/buildHtmlReport.js";
import { buildExecutiveHtml, buildExecutiveMarkdown } from "./report/buildExecutiveSummary.js";
import { buildCompleteHtmlReport } from "./report/buildCompleteReport.js";
import { slugify } from "./report/reportUtils.js";

export { buildFindingsReportPayload, buildMarkdownReport, buildHtmlReport, buildExecutiveHtml, buildExecutiveMarkdown };

function buildPayload(opts) {
  return buildFindingsReportPayload({
    projectName: opts.projectName,
    files: opts.files,
    categories: opts.categories,
    analysisModeLabel: opts.analysisModeLabel,
    auditStack: opts.auditStack,
    resultsView: opts.resultsView ?? "local",
  });
}

/** @param {"complete" | "executive" | "html"} format */
export function buildReportHtmlContent(opts, format) {
  const payload = buildPayload(opts);
  if (format === "complete") return buildCompleteHtmlReport(payload);
  if (format === "executive") return buildExecutiveHtml(payload);
  return buildHtmlReport(payload);
}

function reportFilename(projectName, format) {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = slugify(projectName);
  if (format === "complete") return `${base}-complete-report-${stamp}.html`;
  if (format === "executive") return `${base}-executive-${stamp}.html`;
  return `${base}-audit-${stamp}.html`;
}

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Open HTML report in a new browser tab (no download prompt). */
export function openReportInNewTab(opts, format) {
  const html = buildReportHtmlContent(opts, format);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** @param {"complete" | "executive" | "executive-md" | "html" | "markdown" | "json"} format */
export function downloadReport(opts) {
  const {
    projectName,
    format = "complete",
  } = opts;
  const payload = buildPayload(opts);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = slugify(projectName);

  if (format === "json") {
    triggerDownload(`${base}-audit-${stamp}.json`, JSON.stringify(payload, null, 2), "application/json");
    return;
  }

  if (format === "markdown") {
    triggerDownload(
      `${base}-audit-${stamp}.md`,
      buildMarkdownReport(payload),
      "text/markdown;charset=utf-8",
    );
    return;
  }

  if (format === "executive-md") {
    triggerDownload(
      `${base}-executive-${stamp}.md`,
      buildExecutiveMarkdown(payload),
      "text/markdown;charset=utf-8",
    );
    return;
  }

  if (format === "executive") {
    triggerDownload(
      reportFilename(projectName, "executive"),
      buildExecutiveHtml(payload),
      "text/html;charset=utf-8",
    );
    return;
  }

  if (format === "complete") {
    triggerDownload(
      reportFilename(projectName, "complete"),
      buildCompleteHtmlReport(payload),
      "text/html;charset=utf-8",
    );
    return;
  }

  triggerDownload(reportFilename(projectName, "html"), buildHtmlReport(payload), "text/html;charset=utf-8");
}

export { reportFilename, buildReportHtmlContent as getReportHtmlForPreview };
