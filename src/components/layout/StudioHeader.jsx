import StackSelector from "./StackSelector.jsx";
import AiProviderHeaderSliders from "../settings/AiProviderHeaderSliders.jsx";
import DownloadReportButton from "../../DownloadReportButton.jsx";
import { theme, buttons } from "../../shared/theme.js";
import AnalysisViewToggle from "../analysis/AnalysisViewToggle.jsx";

const btnPrimary = {
  background: "#0d9488",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnGhost = {
  background: "transparent",
  color: "#ccfbf1",
  border: "1px solid #0d9488",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default function StudioHeader({
  stack,
  stackList,
  stackId,
  onStackChange,
  modeLabel,
  onAddFiles,
  onLoadFolder,
  onOpenAiSettings,
  projectName,
  files,
  categories,
  resultsView,
  hasLocalResults,
  providersWithResults,
  showResultsBar,
  onResultsViewChange,
  fileCount,
  critTotal,
  warnTotal,
  avgScore,
  avgBySource,
  resultsViewCompareAll,
  gradeFn,
  aiProviders,
}) {
  return (
    <header style={{ background: theme.color.header, flexShrink: 0, borderBottom: "1px solid #334155" }}>
      {/* Single control row — brand + stack + AI + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "8px 16px",
          flexWrap: "wrap",
        }}
      >
        {/* left — brand + stack */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <div
              style={{
                width: 28,
                height: 28,
                background: "#0d9488",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              ⚡
            </div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1.2, whiteSpace: "nowrap" }}>
              Code Quality Studio
            </div>
          </div>

          <div style={{ width: 1, height: 22, background: "#0f766e", opacity: 0.5, flexShrink: 0 }} aria-hidden />

          <StackSelector stacks={stackList} activeId={stackId} onChange={onStackChange} />
        </div>

        {/* right — AI toggles + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <AiProviderHeaderSliders onOpenSettings={onOpenAiSettings} variant="compact" />
          <div style={{ width: 1, height: 22, background: "#0f766e", opacity: 0.5, flexShrink: 0 }} aria-hidden />
          <button type="button" onClick={onAddFiles} style={btnPrimary}>
            Add files
          </button>
          <button type="button" onClick={onLoadFolder} style={btnGhost}>
            Load folder
          </button>
          <DownloadReportButton
            variant="compact"
            projectName={projectName}
            files={files}
            categories={categories}
            analysisModeLabel={modeLabel}
            auditStack={stack}
            resultsView={resultsView}
            disabled={!files.length}
          />
        </div>
      </div>

      {/* Context bar — only after files loaded */}
      {showResultsBar && (
        <div
          style={{
            background: "#334155",
            borderTop: "1px solid #0f766e",
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <AnalysisViewToggle
            compact
            variant="onDark"
            value={resultsView}
            onChange={onResultsViewChange}
            hasLocal={hasLocalResults}
            providersWithResults={providersWithResults}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "#99f6e4" }}>
            <span>{fileCount} files</span>
            {critTotal > 0 && (
              <span style={{ color: "#fca5a5", fontWeight: 700 }}>{critTotal} critical</span>
            )}
            {warnTotal > 0 && (
              <span style={{ color: "#fcd34d", fontWeight: 700 }}>{warnTotal} warnings</span>
            )}
            {resultsViewCompareAll ? (
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {avgBySource.local != null && (
                  <span>
                    Rules{" "}
                    <strong style={{ color: gradeFn(avgBySource.local).color }}>{avgBySource.local}</strong>
                  </span>
                )}
                {aiProviders.map(
                  (p) =>
                    avgBySource[p.id] != null && (
                      <span key={p.id}>
                        {p.shortLabel}{" "}
                        <strong style={{ color: gradeFn(avgBySource[p.id]).color }}>
                          {avgBySource[p.id]}
                        </strong>
                      </span>
                    ),
                )}
              </span>
            ) : (
              avgScore != null && (
                <span>
                  Avg <strong style={{ color: gradeFn(avgScore).color }}>{avgScore}</strong>
                </span>
              )
            )}
          </div>
        </div>
      )}
    </header>
  );
}
