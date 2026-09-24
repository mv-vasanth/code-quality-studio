import { useState, useEffect, useMemo, useCallback } from "react";
import { SEV } from "../../shared/theme.js";
import { getRuleCatalog } from "../../rules/catalog.js";
import { RULE_WHY_HELP } from "../../rules/ruleWhyCatalog.js";
import {
  loadRuleSettings,
  saveRuleSettings,
  isRuleEnabled,
  exportRuleSettingsJson,
} from "../../rules/ruleSettingsStorage.js";
import CustomRulesSection from "./CustomRulesSection.jsx";
import { suggestRules } from "../../services/ai/suggestRules.js";

export default function RulesReviewTab({
  stackId,
  categories = [],
  onSettingsChange,
  onRerunRules,
  rerunBusy = false,
  hasFiles = false,
  aiSettings = null,
  loadedFiles = [],
  allFindings = [],       // all findings across all loaded files
  skippedRuleIds = new Set(), // ruleIds whose prerequisite was not met on any file
  onAiFix = null,         // (ruleId) => void — trigger AI fix for findings of this rule
}) {
  const catalog = useMemo(() => getRuleCatalog(stackId), [stackId]);
  const [settings, setSettings] = useState(() => loadRuleSettings(stackId));
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState(null); // array of suggested rules
  const [suggestError, setSuggestError] = useState(null);
  const [addedIds, setAddedIds] = useState(new Set());

  useEffect(() => {
    setSettings(loadRuleSettings(stackId));
  }, [stackId]);

  const persist = useCallback(
    (next) => {
      setSettings(next);
      saveRuleSettings(stackId, next);
      onSettingsChange?.();
    },
    [stackId, onSettingsChange],
  );

  const setEnabled = (ruleId, enabled) => {
    const disabled = { ...settings.disabled };
    if (enabled) delete disabled[ruleId];
    else disabled[ruleId] = true;
    persist({ ...settings, disabled });
  };

  const setNote = (ruleId, note) => {
    const notes = { ...settings.notes, [ruleId]: note };
    persist({ ...settings, notes });
  };

  const enabledCount = catalog.filter((r) => isRuleEnabled(stackId, r.ruleId, settings)).length;

  // Per-rule finding counts, computed from all loaded files' findings
  const findingCountByRuleId = useMemo(() => {
    const map = {};
    for (const f of allFindings) {
      if (f.ruleId) map[f.ruleId] = (map[f.ruleId] || 0) + 1;
    }
    return map;
  }, [allFindings]);

  /** Return status badge config for a rule */
  function ruleStatus(ruleId, enabled) {
    if (!enabled) return null; // disabled — shown by the toggle itself
    if (!hasFiles) return null; // no files yet — no status
    const count = findingCountByRuleId[ruleId] || 0;
    if (count > 0) return { label: `${count} issue${count > 1 ? "s" : ""}`, bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" };
    if (skippedRuleIds.has(ruleId)) return { label: "⏭ Skipped", bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" };
    return { label: "✅ Passed", bg: "#f0fdf4", color: "#16a34a", border: "#86efac" };
  }

  const filtered = catalog.filter((r) => {
    if (filter !== "all" && r.severity !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.ruleId.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      (r.detection || "").toLowerCase().includes(q)
    );
  });

  const grouped = useMemo(() => {
    const byCat = new Map();
    for (const r of filtered) {
      const list = byCat.get(r.category) ?? [];
      list.push(r);
      byCat.set(r.category, list);
    }
    return byCat;
  }, [filtered]);

  const handleSuggestRules = async () => {
    if (suggesting || !aiSettings) return;
    setSuggesting(true);
    setSuggestions(null);
    setSuggestError(null);
    setAddedIds(new Set());
    try {
      const result = await suggestRules({ settings: aiSettings, files: loadedFiles, stackId });
      setSuggestions(result);
    } catch (err) {
      setSuggestError(err.message || "Suggestion failed");
    } finally {
      setSuggesting(false);
    }
  };

  const downloadExport = () => {
    const json = exportRuleSettingsJson(stackId, catalog);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cqs-rules-${stackId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const catMeta = (id) =>
    categories.find((c) => c.id === id) || { label: id, icon: "📋", color: "#64748b", bg: "#f1f5f9" };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, color: "#111", marginBottom: 8 }}>Local rules — review &amp; configure</div>
      <div
        style={{
          background: "#ecfdf5",
          border: "1px solid #86efac",
          borderRadius: 10,
          padding: "12px 14px",
          marginBottom: 16,
          fontSize: 12.5,
          color: "#14532d",
          lineHeight: 1.55,
        }}
      >
        <strong>Rules analysis runs entirely in your browser.</strong> It scans the file text you load against the
        built-in checks below — no network calls, no API keys. Optional AI review is separate (header → AI settings);
        use the results toggle <strong>Rules</strong> to see only local findings.
      </div>

      <CustomRulesSection key={stackId} stackId={stackId} categories={categories} onChange={onSettingsChange} />

      {/* ── AI Rule Suggestion ── */}
      {aiSettings && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: suggestions || suggestError ? 12 : 0 }}>
            <button
              type="button"
              onClick={handleSuggestRules}
              disabled={suggesting || !loadedFiles.length}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 12, fontWeight: 700, padding: "7px 14px",
                borderRadius: 8, border: "1px solid #a78bfa",
                background: suggesting ? "#f5f3ff" : "#ede9fe",
                color: "#7c3aed", cursor: (suggesting || !loadedFiles.length) ? "not-allowed" : "pointer",
              }}
            >
              {suggesting ? (
                <><span style={{ width: 11, height: 11, border: "2px solid #a78bfa", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Analysing files…</>
              ) : "✨ Suggest rules from codebase"}
            </button>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              {loadedFiles.length > 0 ? `AI analyses ${Math.min(loadedFiles.length, 8)} of ${loadedFiles.length} loaded files` : "Load a test folder first"}
            </span>
          </div>

          {suggestError && (
            <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>
              {suggestError}
            </div>
          )}

          {suggestions && suggestions.length > 0 && (
            <div style={{ border: "1px solid #a78bfa", borderRadius: 10, overflow: "hidden", background: "#faf5ff" }}>
              <div style={{ padding: "10px 14px", background: "#ede9fe", borderBottom: "1px solid #a78bfa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5b21b6" }}>
                  ✨ {suggestions.length} rule{suggestions.length !== 1 ? "s" : ""} suggested from your codebase
                </span>
                <button type="button" onClick={() => setSuggestions(null)} style={{ fontSize: 11, color: "#7c3aed", background: "none", border: "none", cursor: "pointer" }}>Dismiss</button>
              </div>
              {suggestions.map((s, i) => {
                const isAdded = addedIds.has(i);
                const sevColors = { critical: "#dc2626", warning: "#d97706", info: "#0891b2" };
                return (
                  <div key={i} style={{ padding: "12px 14px", borderBottom: i < suggestions.length - 1 ? "1px solid #e9d5ff" : "none" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1e1b4b" }}>{s.title}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#fff", color: sevColors[s.severity] || "#64748b", border: `1px solid ${sevColors[s.severity] || "#64748b"}` }}>
                            {(s.severity || "info").toUpperCase()}
                          </span>
                          <span style={{ fontSize: 10, color: "#7c3aed", fontFamily: "monospace" }}>{s.category}</span>
                        </div>
                        <p style={{ margin: "0 0 4px", fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{s.description}</p>
                        {s.rationale && <p style={{ margin: "0 0 4px", fontSize: 11, color: "#64748b", fontStyle: "italic", lineHeight: 1.4 }}>{s.rationale}</p>}
                        {s.pattern && (
                          <div style={{ fontSize: 10.5, fontFamily: "monospace", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 5, padding: "3px 8px", color: "#334155", marginTop: 4, wordBreak: "break-all" }}>
                            pattern: /{s.pattern}/
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={isAdded}
                        onClick={() => {
                          // Fire a custom event that CustomRulesSection can pick up,
                          // or call the onChange + add via dispatchEvent.
                          // For now we store in localStorage via the custom rules storage key.
                          try {
                            const storageKey = `cqs-custom-rules-${stackId}`;
                            const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
                            const newRule = {
                              id: `AI-${Date.now()}-${i}`,
                              title: s.title || "AI suggested rule",
                              pattern: s.pattern || "",
                              severity: s.severity || "info",
                              category: s.category || "coding_standards",
                              description: s.description || "",
                              fix: s.fix || "",
                              enabled: true,
                              source: "ai-suggest",
                            };
                            existing.push(newRule);
                            localStorage.setItem(storageKey, JSON.stringify(existing));
                            setAddedIds((prev) => new Set([...prev, i]));
                            onSettingsChange?.();
                          } catch (e) {
                            console.error("Failed to add rule", e);
                          }
                        }}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8,
                          border: isAdded ? "1px solid #86efac" : "1px solid #a78bfa",
                          background: isAdded ? "#f0fdf4" : "#fff",
                          color: isAdded ? "#15803d" : "#7c3aed",
                          cursor: isAdded ? "default" : "pointer",
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        {isAdded ? "✓ Added" : "+ Add rule"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: 13, color: "#374151", marginBottom: 10 }}>Built-in rules</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: "#475569" }}>
          {enabledCount} of {catalog.length} rules enabled for this stack
        </span>
        <input
          type="search"
          placeholder="Search rules…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 160px", minWidth: 140, padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        {["all", "critical", "warning", "info"].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 10px",
              borderRadius: 99,
              border: filter === id ? "1px solid #14b8a6" : "1px solid #e2e8f0",
              background: filter === id ? "#f0fdfa" : "#fff",
              color: filter === id ? "#0f766e" : "#64748b",
              cursor: "pointer",
            }}
          >
            {id === "all" ? "All" : id}
          </button>
        ))}
        <button
          type="button"
          onClick={() => persist({ disabled: {}, notes: settings.notes })}
          style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
        >
          Enable all
        </button>
        <button type="button" onClick={downloadExport} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#0f766e", cursor: "pointer" }}>
          Export JSON
        </button>
        {hasFiles && onRerunRules && (
          <button
            type="button"
            disabled={rerunBusy}
            onClick={onRerunRules}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 8,
              border: "none",
              background: "#0d9488",
              color: "#fff",
              cursor: rerunBusy ? "not-allowed" : "pointer",
              opacity: rerunBusy ? 0.7 : 1,
            }}
          >
            Re-run rules on loaded files
          </button>
        )}
      </div>

      <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 12px", lineHeight: 1.5 }}>
        Toggle rules off while you review them with your team. Disabled rules are skipped on the next local analysis.
        Export JSON to track what to promote into <code style={{ fontSize: 10 }}>localAnalyzer.js</code> / analyzers later.
      </p>

      {[...grouped.entries()].map(([catId, rules]) => {
        const cat = catMeta(catId);
        return (
          <div key={catId} style={{ marginBottom: 16, background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: cat.bg, borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 13, color: cat.color }}>
              {cat.icon} {cat.label}
            </div>
            {rules.map((r) => {
              const enabled = isRuleEnabled(stackId, r.ruleId, settings);
              const sev = SEV[r.severity] || SEV.info;
              return (
                <div
                  key={r.ruleId}
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #f1f5f9",
                    opacity: enabled ? 1 : 0.65,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, marginTop: 2 }}>
                      <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(r.ruleId, e.target.checked)} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: enabled ? "#047857" : "#94a3b8" }}>{enabled ? "On" : "Off"}</span>
                    </label>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 99, background: sev.bg, color: sev.color, border: `1px solid ${sev.border}` }}>
                          {r.severity}
                        </span>
                        <code style={{ fontSize: 10, color: "#64748b" }}>{r.ruleId}</code>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{r.title}</span>
                        {/* Per-rule status badge — only when enabled */}
                        {(() => { const st = ruleStatus(r.ruleId, enabled); return st ? (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: st.bg, color: st.color, border: `1px solid ${st.border}`, marginLeft: "auto" }}>
                            {st.label}
                          </span>
                        ) : null; })()}
                        {/* AI fix button — only when rule has findings and AI available */}
                        {onAiFix && enabled && (findingCountByRuleId[r.ruleId] || 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => onAiFix(r.ruleId)}
                            style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: "1px solid #7c3aed", background: "#faf5ff", color: "#7c3aed", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                            title={`Generate AI fix for ${r.ruleId} findings`}
                          >
                            🤖 Fix
                          </button>
                        )}
                      </div>
                      <p style={{ margin: "0 0 4px", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{r.description}</p>
                      {RULE_WHY_HELP[r.ruleId] && (
                        <div
                          style={{
                            margin: "6px 0 6px",
                            padding: "8px 10px",
                            background: "#fffbeb",
                            borderRadius: 8,
                            border: "1px solid #fde68a",
                            fontSize: 11.5,
                            color: "#78350f",
                            lineHeight: 1.5,
                          }}
                          title={`${RULE_WHY_HELP[r.ruleId].whyUse} ${RULE_WHY_HELP[r.ruleId].howHelps}`}
                        >
                          <div>
                          {RULE_WHY_HELP[r.ruleId].simpleTerms && (
                            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#1e3a8a" }}>
                              <strong>In simple terms:</strong> {RULE_WHY_HELP[r.ruleId].simpleTerms}
                            </p>
                          )}
                            <strong>Why use this:</strong> {RULE_WHY_HELP[r.ruleId].whyUse}
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <strong>How the fix helps:</strong> {RULE_WHY_HELP[r.ruleId].howHelps}
                          </div>
                        </div>
                      )}
                      {r.detection && (
                        <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
                          <strong>Detects:</strong> {r.detection}
                        </p>
                      )}
                      <textarea
                        placeholder="Team note (for review before adding to code)…"
                        value={settings.notes[r.ruleId] ?? ""}
                        onChange={(e) => setNote(r.ruleId, e.target.value)}
                        rows={2}
                        style={{
                          width: "100%",
                          marginTop: 8,
                          fontSize: 11,
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #e2e8f0",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
