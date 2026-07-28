export default function FilesTabGuide({ resultsView, hasCompare }) {
  const compareNote =
    resultsView === "compare-all" && hasCompare
      ? " Compare mode lists Rules and each AI score side by side."
      : "";

  return (
    <div
      style={{
        fontSize: 12,
        color: "#475569",
        lineHeight: 1.55,
        background: "#f8fafc",
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #e2e8f0",
        marginBottom: 12,
      }}
    >
      <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>How to read these cards</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          <strong>Overall score</strong> (large number, 0–100): higher is better.{" "}
          <strong>Rules</strong> = fast local checks; <strong>AI</strong> = optional model review.
        </li>
        <li>
          <strong>Category rows</strong> show which areas drove the score (selectors, reliability, etc.).
        </li>
        <li>
          <strong>Click a card</strong> to open detailed findings and fixes.{compareNote}
        </li>
      </ul>
      <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
        Tip: use <strong>View → Rules</strong> for a simple pass/fail style grid; switch to a single AI or Compare when you need
        side-by-side.
      </div>
    </div>
  );
}
