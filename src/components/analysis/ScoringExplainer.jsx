import { useState } from "react";
import { theme } from "../../shared/theme.js";

const PENALTIES = [
  { label: "Critical", points: "−18", color: theme.color.danger },
  { label: "Warning", points: "−10", color: theme.color.warning },
  { label: "Info", points: "−4", color: theme.color.info },
];

const GRADES = [
  { g: "A", range: "90–100", label: "Excellent", color: theme.color.success },
  { g: "B", range: "80–89", label: "Good", color: "#16a34a" },
  { g: "C", range: "70–79", label: "Acceptable", color: theme.color.warning },
  { g: "D", range: "55–69", label: "Needs work", color: "#ea580c" },
  { g: "F", range: "0–54", label: "Poor", color: theme.color.danger },
];

/**
 * The scoring explanation body (no toggle). Reused in the footer popover.
 * @param {number} categoryCount - number of categories in the active stack.
 */
export function ScoringExplainerContent({ categoryCount = 10 }) {
  return (
    <div style={{ fontSize: 12.5, color: theme.color.textSecondary, lineHeight: 1.6 }}>
      <p style={{ margin: "0 0 10px" }}>
        <strong style={{ color: theme.color.text }}>Rules scores are deterministic.</strong> Every
        category starts at <strong>100</strong> and loses points for each finding it contains
        (a category never drops below 0):
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {PENALTIES.map((p) => (
          <span
            key={p.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: theme.radius.pill,
              background: theme.color.surfaceSubtle,
              border: `1px solid ${theme.color.border}`,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color }} aria-hidden />
            {p.label}
            <strong style={{ color: p.color }}>{p.points}</strong>
          </span>
        ))}
      </div>

      <p style={{ margin: "0 0 10px" }}>
        The <strong style={{ color: theme.color.text }}>overall score</strong> is the average of
        all {categoryCount} category scores, rounded. A category shows <strong>100</strong> when the
        standard rules found nothing to flag there — rules are heuristic checks, so that means{" "}
        <em>"nothing flagged,"</em> not <em>"provably perfect."</em>
      </p>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: theme.color.textMuted, textTransform: "uppercase", margin: "12px 0 6px" }}>
        Grades
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {GRADES.map((g) => (
          <span
            key={g.g}
            title={g.label}
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 5,
              fontSize: 11,
              padding: "4px 9px",
              borderRadius: theme.radius.sm,
              background: theme.color.surfaceSubtle,
              border: `1px solid ${theme.color.border}`,
            }}
          >
            <strong style={{ color: g.color, fontSize: 12.5 }}>{g.g}</strong>
            <span style={{ color: theme.color.textMuted }}>{g.range}</span>
          </span>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 11.5, color: theme.color.textMuted }}>
        <strong style={{ color: theme.color.ai }}>AI views</strong> (Claude / Bedrock / Gemini)
        show the model's own assessment, not this formula — so those scores can differ from Rules.
      </p>
    </div>
  );
}

/**
 * Inline collapsible variant (kept for reuse; the app currently surfaces this via the footer).
 */
export default function ScoringExplainer({ categoryCount = 10 }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          border: `1px solid ${theme.color.border}`,
          background: theme.color.surface,
          color: theme.color.textSecondary,
          fontSize: 12,
          fontWeight: 600,
          borderRadius: theme.radius.md,
          padding: "6px 12px",
          cursor: "pointer",
        }}
      >
        <span aria-hidden>ⓘ</span>
        How are scores calculated?
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", fontSize: 10 }} aria-hidden>▶</span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            background: theme.color.surface,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.lg,
            padding: "14px 16px",
            maxWidth: 720,
          }}
        >
          <ScoringExplainerContent categoryCount={categoryCount} />
        </div>
      )}
    </div>
  );
}
