import { useState, useRef, useCallback, useEffect } from "react";
import { getGuideForStack } from "./guides/index.js";
import { getPracticeDetails } from "./guides/practiceDetails.js";
import { getAuditStack } from "./stacks/registry.js";
import { usePracticeChecklist } from "./practiceChecklistState.js";
import PracticeChecklistSection from "./PracticeChecklistSection.jsx";
import PracticeDetail from "./components/practices/PracticeDetail.jsx";

function CodeBlock({ label, code }) {
  if (!code) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {label && (
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 4, letterSpacing: "0.04em" }}>
          {label}
        </div>
      )}
      <pre
        style={{
          margin: 0,
          background: "#0f172a",
          color: "#99f6e4",
          padding: "10px 12px",
          borderRadius: 8,
          fontSize: 11,
          overflowX: "auto",
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

export default function BestPracticesPanel({ categories, stackId = "playwright" }) {
  const [filter, setFilter] = useState("all");
  const [openDetails, setOpenDetails] = useState(() => new Set());
  const detailRefs = useRef({});

  const toggleDetail = useCallback((id) => {
    setOpenDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const guide = getGuideForStack(stackId);
  const practices = guide.practices;
  const stackMeta = getAuditStack(stackId);
  const checklist = usePracticeChecklist(stackMeta.checklistStorageKey, practices);

  useEffect(() => { setFilter("all"); }, [stackId]);

  const scrollToDetail = useCallback((id) => {
    const el = detailRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const filtered =
    filter === "all" ? practices : practices.filter((p) => p.category === filter);

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: stackMeta.accent, marginBottom: 8 }}>{stackMeta.icon} {stackMeta.name}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#111", marginBottom: 6 }}>{guide.title}</div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#555", lineHeight: 1.6, maxWidth: 720 }}>
        {guide.intro} Full markdown copy:{" "}
        <code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
          {guide.docPath}
        </code>
      </p>

      <PracticeChecklistSection
        categories={categories}
        practices={practices}
        filter={filter}
        onScrollToDetail={scrollToDetail}
        {...checklist}
      />

      <div style={{ fontWeight: 700, fontSize: 13, color: "#374151", marginBottom: 10 }}>Detailed reference</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setFilter("all")}
          style={{
            padding: "5px 10px",
            borderRadius: 99,
            border: `1px solid ${filter === "all" ? "#14b8a6" : "#e5e7eb"}`,
            background: filter === "all" ? "#f0fdfa" : "#fff",
            color: filter === "all" ? "#0d9488" : "#555",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          All ({practices.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            style={{
              padding: "5px 10px",
              borderRadius: 99,
              border: `1px solid ${filter === c.id ? c.color : "#e5e7eb"}`,
              background: filter === c.id ? c.bg : "#fff",
              color: filter === c.id ? c.color : "#555",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {c.icon} {c.label.split(" ")[0]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((p) => {
          const cat = catById[p.category] || { icon: "📋", label: p.category, color: "#666", bg: "#f9fafb" };
          const isPassed = checklist.checked.has(p.id);
          return (
            <article
              key={p.id}
              id={`practice-${p.id}`}
              ref={(el) => {
                detailRefs.current[p.id] = el;
              }}
              style={{
                background: "#fff",
                borderRadius: 12,
                border: `1px solid ${isPassed ? "#86efac" : "#e5e7eb"}`,
                padding: "14px 16px",
                scrollMarginTop: 12,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={isPassed}
                  onChange={() => checklist.toggleChecked(p.id)}
                  aria-label={`Mark as passed: ${p.title}`}
                  style={{ width: 16, height: 16, accentColor: "#16a34a", cursor: "pointer" }}
                />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111", flex: "1 1 200px" }}>{p.title}</h3>
                {isPassed && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#16a34a",
                      background: "#dcfce7",
                      padding: "2px 8px",
                      borderRadius: 99,
                    }}
                  >
                    ✓ Passed
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 99,
                    background: cat.bg,
                    color: cat.color,
                    fontWeight: 600,
                  }}
                >
                  {cat.icon} {cat.label}
                </span>
                {p.ruleIds?.map((rid) => (
                  <span
                    key={rid}
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 99,
                      background: "#f3f4f6",
                      color: "#888",
                      fontFamily: "monospace",
                    }}
                  >
                    {rid}
                  </span>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: "#555", lineHeight: 1.6 }}>{p.summary}</p>
              {p.detects && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b" }}>
                  <strong>Detects:</strong> <code style={{ fontSize: 10.5, background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>{p.detects}</code>
                </p>
              )}
              <CodeBlock label="AVOID" code={p.avoid} />
              <CodeBlock label="PREFER" code={p.prefer} />
              {p.reference && (
                <div style={{ marginTop: 10, fontSize: 11, color: "#14b8a6" }}>
                  📖{" "}
                  <a href={p.reference} target="_blank" rel="noreferrer" style={{ color: "#14b8a6" }}>
                    {p.reference.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}
              {getPracticeDetails(p.id) && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => toggleDetail(p.id)}
                    aria-expanded={openDetails.has(p.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: "none",
                      background: "transparent",
                      color: "#0d9488",
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <span style={{ transform: openDetails.has(p.id) ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} aria-hidden>▶</span>
                    {openDetails.has(p.id) ? "Hide explanation" : "Explain in depth"}
                  </button>
                  {openDetails.has(p.id) && (
                    <div style={{ marginTop: 8, padding: "12px 14px", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                      <PracticeDetail details={getPracticeDetails(p.id)} />
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
