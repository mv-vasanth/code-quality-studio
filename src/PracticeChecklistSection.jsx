export default function PracticeChecklistSection({
  categories,
  practices,
  filter,
  checked,
  toggleChecked,
  resetChecklist,
  passedCount,
  totalCount,
  onScrollToDetail,
}) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const checklistItems =
    filter === "all" ? practices : practices.filter((p) => p.category === filter);
  const pct = totalCount ? Math.round((passedCount / totalCount) * 100) : 0;

  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        padding: "14px 16px",
        marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>Compliance checklist</div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 99,
            background: passedCount === totalCount ? "#f0fdf4" : "#f0fdfa",
            color: passedCount === totalCount ? "#16a34a" : "#0d9488",
            border: `1px solid ${passedCount === totalCount ? "#86efac" : "#99f6e4"}`,
          }}
        >
          {passedCount} / {totalCount} passed
        </span>
        {passedCount > 0 && (
          <button
            type="button"
            onClick={resetChecklist}
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#6b7280",
              background: "transparent",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Reset checklist
          </button>
        )}
      </div>
      <div style={{ height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: passedCount === totalCount ? "#16a34a" : "#14b8a6",
            borderRadius: 3,
            transition: "width 0.35s ease",
          }}
        />
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "#6b7280" }}>
        Mark items your project already follows. Progress is saved in this browser.
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {checklistItems.map((p) => {
          const isPassed = checked.has(p.id);
          const cat = catById[p.category];
          return (
            <li
              key={p.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: isPassed ? "#f0fdf4" : "#fafafa",
                border: `1px solid ${isPassed ? "#86efac" : "#f3f4f6"}`,
              }}
            >
              <input
                type="checkbox"
                checked={isPassed}
                onChange={() => toggleChecked(p.id)}
                aria-label={`Mark as passed: ${p.title}`}
                style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: "#16a34a", cursor: "pointer" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: isPassed ? "#15803d" : "#111",
                    textDecoration: isPassed ? "line-through" : "none",
                    lineHeight: 1.4,
                  }}
                >
                  {p.title}
                </span>
                {isPassed && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#16a34a",
                      background: "#dcfce7",
                      padding: "1px 6px",
                      borderRadius: 99,
                    }}
                  >
                    Passed
                  </span>
                )}
                {cat && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: cat.color }}>
                    {cat.icon} {cat.label.split(" ")[0]}
                  </span>
                )}
              </div>
              {onScrollToDetail && (
                <button
                  type="button"
                  onClick={() => onScrollToDetail(p.id)}
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#14b8a6",
                    background: "#f0fdfa",
                    border: "none",
                    borderRadius: 6,
                    padding: "4px 8px",
                    cursor: "pointer",
                  }}
                >
                  Details ↓
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
