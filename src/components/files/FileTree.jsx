import { grade } from "../../shared/grade.js";
import { getStoredResult, getAiResult } from "../../shared/fileResults.js";
import { AI_PROVIDERS } from "../../settings/aiSettingsDefaults.js";

export default function FileTree({ files, selected, onSelect, onRemove, resultsView = "local" }) {
  const grouped = files.reduce((acc, f) => {
    const parts = f.name.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "root";
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(f);
    return acc;
  }, {});

  return (
    <div style={{ fontSize: 12 }}>
      {Object.entries(grouped).map(([folder, fls]) => (
        <div key={folder}>
          {folder !== "root" && (
            <div style={{ color: "#888", padding: "4px 0 2px 4px", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <span>📁</span><span>{folder}</span>
            </div>
          )}
          {fls.map(f => {
            const isSelected = selected?.name === f.name;
            const localR = getStoredResult(f, "local");
            const single = resultsView === "compare-all" ? null : getStoredResult(f, resultsView);
            const g = single ? grade(single.overallScore) : null;
            return (
              <div key={f.name} onClick={() => onSelect(f)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 7, cursor: "pointer", background: isSelected ? "#f0fdfa" : "transparent", marginBottom: 2, border: isSelected ? "1px solid #99f6e4" : "1px solid transparent" }}>
                <span style={{ fontSize: 13 }}>📄</span>
                <span style={{ flex: 1, color: isSelected ? "#0d9488" : "#374151", fontWeight: isSelected ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name.split("/").pop()}
                </span>
                {resultsView === "compare-all" ? (
                  <span style={{ display: "flex", gap: 2, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {localR && <span title="Rules" style={{ fontSize: 8, fontWeight: 700, color: grade(localR.overallScore).color, background: grade(localR.overallScore).bg, padding: "1px 4px", borderRadius: 99 }}>R{localR.overallScore}</span>}
                    {AI_PROVIDERS.map(p => {
                      const r = getAiResult(f, p.id);
                      if (!r) return null;
                      return <span key={p.id} title={p.shortLabel} style={{ fontSize: 8, fontWeight: 700, color: grade(r.overallScore).color, background: grade(r.overallScore).bg, padding: "1px 4px", borderRadius: 99 }}>{p.shortLabel[0]}{r.overallScore}</span>;
                    })}
                  </span>
                ) : single ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: g.color, background: g.bg, padding: "1px 6px", borderRadius: 99, flexShrink: 0 }}>{single.overallScore}</span>
                ) : null}
                {f.status === "analysing" && (
                  <span style={{ width: 10, height: 10, border: "2px solid #99f6e4", borderTopColor: "#14b8a6", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0, display: "inline-block" }}/>
                )}
                <span onClick={e => { e.stopPropagation(); onRemove(f.name); }}
                  style={{ color: "#ccc", fontSize: 13, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>×</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
