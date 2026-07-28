import { theme } from "../../shared/theme.js";

const sectionLabel = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: theme.color.textMuted,
  margin: "10px 0 5px",
};

/**
 * Renders the shared in-depth explanation for a practice.
 * Used in the Practices tab (expandable) and inside finding cards.
 */
export default function PracticeDetail({ details }) {
  if (!details) return null;
  const { how, steps, gotchas } = details;
  return (
    <div style={{ fontSize: 12.5, color: theme.color.textSecondary, lineHeight: 1.6 }}>
      {how && <p style={{ margin: 0 }}>{how}</p>}

      {steps?.length > 0 && (
        <>
          <div style={sectionLabel}>How to apply</div>
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}

      {gotchas?.length > 0 && (
        <>
          <div style={sectionLabel}>Watch out</div>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {gotchas.map((g, i) => (
              <li key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ color: theme.color.warning, flexShrink: 0 }} aria-hidden>
                  ⚠
                </span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
