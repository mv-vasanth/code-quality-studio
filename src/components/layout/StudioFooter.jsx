import { useState } from "react";
import { theme } from "../../shared/theme.js";
import { ScoringExplainerContent } from "../analysis/ScoringExplainer.jsx";
import StudioTerminal from "./StudioTerminal.jsx";

/**
 * Slim persistent footer. Always-available access to a rules terminal and
 * "How are scores calculated?" — both open as popovers above the footer.
 */
export default function StudioFooter({ categoryCount = 10, modeLabel, files = [], stackId, onRunRules, allFindings = [], ruleSettings = {}, onAddFiles }) {
  const [open, setOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);

  const ctrlBtn = (active) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${theme.color.border}`,
    background: active ? theme.color.surfaceSubtle : theme.color.surface,
    color: theme.color.textSecondary,
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: theme.radius.md,
    padding: "4px 10px",
    cursor: "pointer",
  });

  return (
    <footer
      style={{
        position: "relative",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 16px",
        background: theme.color.surface,
        borderTop: `1px solid ${theme.color.border}`,
        fontSize: 11.5,
        color: theme.color.textMuted,
      }}
    >
      <span>
        Code Quality Studio{modeLabel ? ` · ${modeLabel}` : ""}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Terminal */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setTermOpen((o) => !o)}
          aria-expanded={termOpen}
          style={{ ...ctrlBtn(termOpen), fontFamily: theme.fontMono }}
        >
          <span aria-hidden>❯_</span>
          Terminal
        </button>
        {termOpen && (
          <>
            <div onClick={() => setTermOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div
              role="dialog"
              aria-label="Rules terminal"
              style={{ position: "absolute", right: 0, bottom: "calc(100% + 8px)", zIndex: 41, width: "min(760px, 94vw)" }}
            >
              <StudioTerminal files={files} stackId={stackId} onRunRules={onRunRules} allFindings={allFindings} ruleSettings={ruleSettings} onAddFiles={onAddFiles} />
            </div>
          </>
        )}
      </div>

      {/* Scoring */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: `1px solid ${theme.color.border}`,
            background: open ? theme.color.surfaceSubtle : theme.color.surface,
            color: theme.color.textSecondary,
            fontSize: 11.5,
            fontWeight: 600,
            borderRadius: theme.radius.md,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          <span aria-hidden>ⓘ</span>
          How are scores calculated?
        </button>

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div
              role="dialog"
              aria-label="How scores are calculated"
              style={{
                position: "absolute",
                right: 0,
                bottom: "calc(100% + 8px)",
                zIndex: 41,
                width: "min(560px, 92vw)",
                maxHeight: "70vh",
                overflowY: "auto",
                background: theme.color.surface,
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.lg,
                boxShadow: "0 16px 40px rgba(15,23,42,0.20)",
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: theme.color.text }}>
                  How are scores calculated?
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{ border: "none", background: "transparent", color: theme.color.textMuted, fontSize: 16, lineHeight: 1, cursor: "pointer", padding: 2 }}
                >
                  ×
                </button>
              </div>
              <ScoringExplainerContent categoryCount={categoryCount} />
            </div>
          </>
        )}
      </div>
      </div>
    </footer>
  );
}
