import { useState } from "react";
import { theme } from "../../shared/theme.js";
import { elevation, fx } from "../../shared/motion.js";
import RunButton from "../common/RunButton.jsx";

/**
 * Re-run every loaded file.
 *
 * Was three stacked full-width buttons — Standard / With AI / Both — which in
 * a 220px sidebar wrapped onto two lines each and gave no hint which one is
 * the normal choice. The mode is a property of the run, not three separate
 * actions, so it is a segmented control: pick the mode, press play. Same three
 * options, one row instead of six.
 */
const MODES = [
  { id: "local", label: "Rules", hint: "Standard rules only — fast, offline, no AI calls" },
  { id: "ai",    label: "AI",    hint: "Your configured AI provider reviews each file" },
  { id: "both",  label: "Both",  hint: "Run both and compare them side by side" },
];

export default function RerunAllControls({
  fileCount,
  busy,
  onRerunAll,
  onRerunBoth,
  onOpenAiSettings,
  aiCredentialsReady,
}) {
  const [mode, setMode] = useState("local");
  if (!fileCount) return null;

  const needsSetup = mode !== "local" && !aiCredentialsReady;

  const run = () => {
    if (needsSetup) return onOpenAiSettings?.();
    if (mode === "both") return onRerunBoth?.();
    onRerunAll(mode);
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: theme.color.textMuted, letterSpacing: "0.06em" }}>
          RE-RUN ALL
        </span>
        <span style={{ fontSize: 10, color: theme.color.textMuted }}>
          {fileCount} file{fileCount === 1 ? "" : "s"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <RunButton
          onClick={run}
          busy={busy}
          label={needsSetup ? "Set up AI" : `Run ${MODES.find((m) => m.id === mode).label.toLowerCase()}`}
          title={needsSetup ? "Configure AI credentials first" : MODES.find((m) => m.id === mode).hint}
          tone={mode === "local" ? theme.color.primary : theme.color.ai}
          toneRgb={mode === "local" ? "13,148,136" : "124,58,237"}
        />

        {/* segmented mode picker */}
        <div
          role="radiogroup"
          aria-label="Analysis mode"
          style={{
            flex: 1,
            minWidth: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${MODES.length}, 1fr)`,
            gap: 2,
            padding: 2,
            borderRadius: theme.radius.md,
            background: theme.color.canvas,
            border: `1px solid ${theme.color.border}`,
            boxShadow: "inset 0 1px 2px rgba(15,23,42,.05)",
          }}
        >
          {MODES.map((m) => {
            const on = m.id === mode;
            const locked = m.id !== "local" && !aiCredentialsReady;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => setMode(m.id)}
                title={locked ? `${m.hint} (needs setup)` : m.hint}
                className={fx.card}
                style={{
                  padding: "5px 2px",
                  fontSize: 10.5,
                  fontWeight: on ? 700 : 600,
                  borderRadius: theme.radius.sm,
                  border: "none",
                  cursor: busy ? "not-allowed" : "pointer",
                  background: on ? theme.color.surface : "transparent",
                  color: on ? theme.color.text : theme.color.textMuted,
                  boxShadow: on ? elevation.raised : "none",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {m.label}
                {locked && <span style={{ opacity: 0.6 }}> ·</span>}
              </button>
            );
          })}
        </div>
      </div>

      {needsSetup && (
        <p className={fx.fadeUp} style={{ margin: "7px 0 0", fontSize: 10.5, color: theme.color.ai, lineHeight: 1.4 }}>
          Press play to add your API key — it stays in this browser.
        </p>
      )}
    </div>
  );
}
