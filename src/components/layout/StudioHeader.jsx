import { useState, useRef, useEffect } from "react";
import StackSelector from "./StackSelector.jsx";
import { getPersona } from "../../stacks/definitions.js";
import AiProviderHeaderSliders from "../settings/AiProviderHeaderSliders.jsx";
import DownloadReportButton from "../../DownloadReportButton.jsx";
import { theme } from "../../shared/theme.js";
import { isOfflineReport } from "../../shared/offlineReport.js";

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
  isMobile = false,
  onMenuToggle,
  onRun,            // () => void — standard rules re-run
  onRunAi,          // () => void — AI-only re-run
  onRunBoth,        // () => void — rules + AI re-run
  rerunBusy = false,
  aiConfigured = false, // true when at least one AI provider has credentials
}) {
  // An offline report has results but no source files: running and opening
  // cannot work there, so hide the controls rather than fail on click.
  const offline = isOfflineReport();
  const [runOpen, setRunOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);
  const runRef = useRef(null);
  const openRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!runOpen && !openOpen) return;
    const handler = (e) => {
      if (runRef.current && !runRef.current.contains(e.target)) setRunOpen(false);
      if (openRef.current && !openRef.current.contains(e.target)) setOpenOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [runOpen, openOpen]);

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
        {/* left — hamburger (mobile) + brand + stack */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
          {/* Hamburger — only on mobile */}
          {isMobile && (
            <button
              type="button"
              onClick={onMenuToggle}
              aria-label="Open navigation menu"
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                fontSize: 20,
                cursor: "pointer",
                padding: "2px 4px",
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ☰
            </button>
          )}
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
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1.15, whiteSpace: "nowrap" }}>
                Code Quality Studio
              </div>
              <div style={{ color: "#5eead4", fontSize: 10.5, lineHeight: 1.2, whiteSpace: "nowrap" }}>
                {getPersona(stack.persona).blurb}
              </div>
            </div>
          </div>

          <div style={{ width: 1, height: 22, background: "#0f766e", opacity: 0.5, flexShrink: 0 }} aria-hidden />

          {offline ? (
            // Offline: the results belong to one stack and nothing can be
            // re-analysed, so show which stack produced them, not a picker.
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#99f6e4", whiteSpace: "nowrap" }}>
              <span aria-hidden>{stack?.icon}</span>
              <span>{stack?.shortName || stack?.name}</span>
            </div>
          ) : (
            <StackSelector stacks={stackList} activeId={stackId} onChange={onStackChange} />
          )}
        </div>

        {/* right — AI toggles + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {!offline && <AiProviderHeaderSliders
            onOpenSettings={onOpenAiSettings}
            variant="compact"
            resultsView={resultsView}
            onResultsViewChange={onResultsViewChange}
            providersWithResults={providersWithResults}
            hasLocalResults={hasLocalResults}
          />}
          {!offline && <div style={{ width: 1, height: 22, background: "#0f766e", opacity: 0.5, flexShrink: 0 }} aria-hidden />}

          {/* ▶ Run button — single button, always opens the mode picker */}
          {files.length > 0 && !offline && (
            <div ref={runRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => { setOpenOpen(false); setRunOpen(v => !v); }}
                disabled={rerunBusy}
                title={rerunBusy ? "Analysis running…" : "Choose run mode"}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px",
                  border: "none", borderRadius: 8,
                  fontWeight: 700, fontSize: 12,
                  cursor: rerunBusy ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  background: rerunBusy ? "#0f766e" : "#14b8a6",
                  color: "#fff", opacity: rerunBusy ? 0.75 : 1,
                  transition: "background 0.15s",
                }}
              >
                {rerunBusy ? (
                  <>
                    <span style={{
                      width: 11, height: 11, border: "2px solid rgba(255,255,255,0.35)",
                      borderTopColor: "#fff", borderRadius: "50%",
                      display: "inline-block", animation: "spin 0.7s linear infinite",
                    }} />
                    Running…
                  </>
                ) : <>▶ Run ▾</>}
              </button>

              {/* Dropdown menu */}
              {runOpen && !rerunBusy && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
                  background: "#1e293b", border: "1px solid #334155",
                  borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  minWidth: 200, overflow: "hidden",
                }}>
                  {[
                    { label: "⚙️ Rule-based only", sub: "Fast — no API key needed", action: onRun,     needsAi: false },
                    { label: "🤖 AI only",          sub: "Requires AI provider",      action: onRunAi,  needsAi: true  },
                    { label: "⚡ Rules + AI",        sub: "Full analysis — both",      action: onRunBoth, needsAi: true },
                  ].map(({ label, sub, action, needsAi }, i, arr) => {
                    const unavailable = needsAi && !aiConfigured;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => { setRunOpen(false); action?.(); }}
                        disabled={unavailable}
                        title={unavailable ? "Add an AI provider in Settings first" : undefined}
                        style={{
                          width: "100%", display: "flex", flexDirection: "column",
                          alignItems: "flex-start", gap: 1,
                          padding: "10px 14px", border: "none",
                          background: "transparent",
                          color: unavailable ? "#64748b" : "#e2e8f0",
                          fontSize: 12, fontWeight: 600,
                          cursor: unavailable ? "default" : "pointer",
                          textAlign: "left",
                          borderBottom: i < arr.length - 1 ? "1px solid #334155" : "none",
                          opacity: unavailable ? 0.55 : 1,
                        }}
                        onMouseEnter={e => { if (!unavailable) e.currentTarget.style.background = "#334155"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        {label}
                        <span style={{ fontSize: 10, fontWeight: 400, color: unavailable ? "#475569" : "#94a3b8" }}>
                          {unavailable ? "Add credentials in Settings" : sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* "Open ▾" — single button, always opens the file-source picker */}
          {!offline && <div ref={openRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => { setRunOpen(false); setOpenOpen(v => !v); }}
              title="Open files or folder"
              style={{ ...btnPrimary, borderRadius: 8 }}
            >
              + Open ▾
            </button>
            {openOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
                background: "#1e293b", border: "1px solid #334155",
                borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                minWidth: 170, overflow: "hidden",
              }}>
                {[
                  { label: "📄 Add files…",   sub: "Pick individual test files",    action: onAddFiles },
                  { label: "📁 Load folder…", sub: "Open an entire test directory",  action: onLoadFolder },
                ].map(({ label, sub, action }, i, arr) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { setOpenOpen(false); action?.(); }}
                    style={{
                      width: "100%", display: "flex", flexDirection: "column",
                      alignItems: "flex-start", gap: 1, padding: "10px 14px", border: "none",
                      background: "transparent", color: "#e2e8f0",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      textAlign: "left",
                      borderBottom: i < arr.length - 1 ? "1px solid #334155" : "none",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    {label}
                    <span style={{ fontSize: 10, fontWeight: 400, color: "#94a3b8" }}>{sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>}
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
          {/* Download lives here — only visible when results exist.
              Hidden offline: you are already looking at the report. */}
          {!offline && <DownloadReportButton
            variant="compact"
            projectName={projectName}
            files={files}
            categories={categories}
            analysisModeLabel={modeLabel}
            auditStack={stack}
            resultsView={resultsView}
            disabled={!files.length}
          />}
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
