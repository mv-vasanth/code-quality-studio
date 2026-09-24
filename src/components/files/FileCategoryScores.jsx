import MiniBar from "../charts/MiniBar.jsx";
import { grade } from "../../shared/grade.js";

/**
 * Top category breakdown with readable labels.
 * @param onSelectCategory optional (categoryId) => void — makes each row clickable.
 * @param activeCategory optional highlighted category id.
 * @param findingCounts optional map categoryId -> number of findings (shows a badge).
 */
export default function FileCategoryScores({
  categories,
  result,
  max = Infinity,
  columns = 1,
  onSelectCategory,
  activeCategory,
  findingCounts,
}) {
  if (!result) return null;
  const slice = categories.slice(0, max);
  const clickable = typeof onSelectCategory === "function";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns === 2 ? "1fr 1fr" : "1fr",
        gap: 5,
        marginTop: 4,
      }}
    >
      {slice.map((cat) => {
        const s = result.categoryScores?.[cat.id] ?? 0;
        const count = findingCounts?.[cat.id] ?? 0;
        const active = activeCategory === cat.id;

        const rowInner = (
          <>
            <span style={{ fontSize: 10 }} title={cat.label} aria-hidden>
              {cat.icon}
            </span>
            <span
              style={{
                fontSize: 9.5,
                color: active ? cat.color : "#64748b",
                fontWeight: active ? 700 : 500,
                width: 72,
                flexShrink: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={cat.label}
            >
              {cat.label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MiniBar score={s} color={cat.color} />
            </div>
            {count > 0 && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#b91c1c",
                  background: "#fef2f2",
                  borderRadius: 99,
                  padding: "0 5px",
                  minWidth: 14,
                  textAlign: "center",
                }}
                title={`${count} finding${count === 1 ? "" : "s"}`}
              >
                {count}
              </span>
            )}
            <span
              style={{
                fontSize: 10,
                color: grade(s).color,
                fontWeight: 700,
                minWidth: 22,
                textAlign: "right",
              }}
            >
              {s}
            </span>
          </>
        );

        if (!clickable) {
          return (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {rowInner}
            </div>
          );
        }

        return (
          <button
            key={cat.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectCategory(cat.id);
            }}
            title={`Show ${cat.label} findings`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              width: "100%",
              textAlign: "left",
              border: `1px solid ${active ? cat.color : "transparent"}`,
              background: active ? cat.bg : "transparent",
              borderRadius: 6,
              padding: "2px 4px",
              cursor: "pointer",
            }}
          >
            {rowInner}
          </button>
        );
      })}
    </div>
  );
}
