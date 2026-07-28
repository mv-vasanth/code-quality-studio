import { useState, useCallback, useMemo } from "react";
import {
  downloadReport,
  buildReportHtmlContent,
  openReportInNewTab,
} from "./exportFindingsReport.js";
import ReportHtmlPreview from "./components/reports/ReportHtmlPreview.jsx";
import { theme, buttons } from "./shared/theme.js";

const btn = (variant, disabled) => {
  const base = buttons[variant] || buttons.secondary;
  if (!disabled) return base;
  return {
    ...base,
    opacity: 0.45,
    cursor: "not-allowed",
    background: variant === "primary" || variant === "exportTeal" ? theme.color.border : base.background,
    color: disabled ? theme.color.textMuted : base.color,
  };
};

const PREVIEW_TITLES = {
  complete: "Complete report package",
  executive: "Executive summary",
  html: "Findings report",
};

export default function DownloadReportButton({
  projectName,
  files,
  categories,
  analysisModeLabel,
  auditStack,
  resultsView = "local",
  disabled,
  variant = "findings",
}) {
  const hasContent = files.length > 0;
  const isDisabled = disabled ?? !hasContent;
  const [preview, setPreview] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const opts = useMemo(
    () => ({ projectName, files, categories, analysisModeLabel, auditStack, resultsView }),
    [projectName, files, categories, analysisModeLabel, auditStack, resultsView],
  );

  const runDownload = (format) => {
    if (isDisabled) return;
    downloadReport({ ...opts, format });
  };

  const openInside = useCallback(
    (format) => {
      if (isDisabled) return;
      const html = buildReportHtmlContent(opts, format);
      setPreview({
        format,
        html,
        title: PREVIEW_TITLES[format] || "Report",
      });
    },
    [isDisabled, opts],
  );

  const openNewTab = (format) => {
    if (isDisabled) return;
    const ok = openReportInNewTab(opts, format);
    if (!ok) openInside(format);
  };

  if (variant === "compact") {
    return (
      <>
        <button
          type="button"
          title="View complete report in app"
          disabled={isDisabled}
          onClick={() => openInside("complete")}
          style={{
            ...btn("ghostOnDark", isDisabled),
            fontSize: 11.5,
            padding: "6px 12px",
          }}
        >
          View report
        </button>
        <ReportHtmlPreview
          open={Boolean(preview)}
          title={preview?.title}
          html={preview?.html}
          onClose={() => setPreview(null)}
          onDownload={preview ? () => runDownload(preview.format) : undefined}
        />
      </>
    );
  }

  const iconBtn = {
    border: "none",
    background: "transparent",
    color: theme.color.textMuted,
    fontSize: 13,
    lineHeight: 1,
    padding: "4px 6px",
    borderRadius: theme.radius.sm,
    cursor: "pointer",
  };

  const htmlReportRow = (format, label) => (
    <div
      key={format}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "7px 10px",
        borderRadius: theme.radius.sm,
      }}
    >
      <button
        type="button"
        disabled={isDisabled}
        title={`Open ${label} in the app`}
        onClick={() => { openInside(format); setMenuOpen(false); }}
        style={{ border: "none", background: "transparent", color: theme.color.text, fontSize: 12.5, fontWeight: 500, cursor: "pointer", padding: 0, flex: 1, textAlign: "left" }}
      >
        {label}
      </button>
      <button type="button" disabled={isDisabled} title="Open in new browser tab" onClick={() => { openNewTab(format); setMenuOpen(false); }} style={iconBtn}>⧉</button>
      <button type="button" disabled={isDisabled} title="Download .html" onClick={() => { runDownload(format); setMenuOpen(false); }} style={iconBtn}>↓</button>
    </div>
  );

  const fileRow = (format, label) => (
    <button
      key={format}
      type="button"
      disabled={isDisabled}
      title={`Download .${format === "markdown" ? "md" : format}`}
      onClick={() => { runDownload(format); setMenuOpen(false); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        padding: "7px 10px", border: "none", background: "transparent", color: theme.color.text,
        fontSize: 12.5, fontWeight: 500, cursor: "pointer", borderRadius: theme.radius.sm,
      }}
    >
      {label}
      <span style={{ color: theme.color.textMuted, fontSize: 13 }}>↓</span>
    </button>
  );

  return (
    <>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          style={btn("primary", isDisabled)}
        >
          ↓ Export report ▾
        </button>

        {menuOpen && !isDisabled && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div
              role="menu"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 6px)",
                zIndex: 41,
                width: 260,
                background: theme.color.surface,
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.lg,
                boxShadow: "0 12px 32px rgba(15,23,42,0.16)",
                padding: 6,
              }}
            >
              <div style={{ fontSize: 9.5, fontWeight: 700, color: theme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", padding: "6px 10px 4px" }}>
                Reports
              </div>
              {htmlReportRow("complete", "Complete package")}
              {htmlReportRow("executive", "Executive summary")}
              {htmlReportRow("html", "Findings only")}
              <div style={{ height: 1, background: theme.color.border, margin: "6px 8px" }} />
              <div style={{ fontSize: 9.5, fontWeight: 700, color: theme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 10px 4px" }}>
                Raw data
              </div>
              {fileRow("markdown", "Markdown")}
              {fileRow("json", "JSON")}
              <div style={{ fontSize: 10, color: theme.color.textMuted, padding: "6px 10px 4px", lineHeight: 1.4, borderTop: `1px solid ${theme.color.border}`, marginTop: 4 }}>
                Name opens in app · <strong>⧉</strong> new tab · <strong>↓</strong> download
              </div>
            </div>
          </>
        )}
      </div>
      <ReportHtmlPreview
        open={Boolean(preview)}
        title={preview?.title}
        html={preview?.html}
        onClose={() => setPreview(null)}
        onDownload={preview ? () => runDownload(preview.format) : undefined}
      />
    </>
  );
}
