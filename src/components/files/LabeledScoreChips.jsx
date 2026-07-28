import { grade } from "../../shared/grade.js";
import { getAiResult } from "../../shared/fileResults.js";
import { AI_PROVIDERS } from "../../settings/aiSettingsDefaults.js";

function Chip({ label, score, accent }) {
  const g = grade(score);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "3px 8px",
        borderRadius: 6,
        background: accent ? "#f0fdfa" : "#f8fafc",
        border: `1px solid ${accent ? "#99f6e4" : "#e2e8f0"}`,
        minWidth: 88,
      }}
      title={`${label}: ${score}/100`}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color: g.color }}>{score}</span>
    </div>
  );
}

/** Compact labeled scores for compare view (Rules vs each AI). */
export default function LabeledScoreChips({ file, localResult }) {
  const chips = [];
  if (localResult) {
    chips.push({ key: "local", label: "Rules", score: localResult.overallScore, accent: true });
  }
  for (const p of AI_PROVIDERS) {
    const r = getAiResult(file, p.id);
    if (r) chips.push({ key: p.id, label: p.shortLabel, score: r.overallScore, accent: false });
  }
  if (chips.length <= 1) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      {chips.map((c) => (
        <Chip key={c.key} label={c.label} score={c.score} accent={c.accent} />
      ))}
    </div>
  );
}
