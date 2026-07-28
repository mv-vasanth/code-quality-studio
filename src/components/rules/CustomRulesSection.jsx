import { useState } from "react";
import { SEV, theme } from "../../shared/theme.js";
import {
  loadCustomRules,
  addCustomRule,
  deleteCustomRule,
  updateCustomRule,
  makeCustomRuleId,
  validateCustomRule,
} from "../../rules/customRulesStorage.js";

const inputStyle = {
  fontSize: 12,
  padding: "7px 9px",
  borderRadius: 8,
  border: `1px solid ${theme.color.border}`,
  boxSizing: "border-box",
  width: "100%",
  fontFamily: "inherit",
};

const emptyDraft = (categoryId) => ({
  title: "",
  category: categoryId || "",
  severity: "warning",
  matchType: "text",
  pattern: "",
  message: "",
});

export default function CustomRulesSection({ stackId, categories = [], onChange }) {
  const [rules, setRules] = useState(() => loadCustomRules(stackId));
  const [draft, setDraft] = useState(() => emptyDraft(categories[0]?.id));
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Note: this component is mounted with key={stackId} by RulesReviewTab, so switching
  // stacks remounts it and the useState initializers above re-read the right stack.

  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const openNew = () => {
    setDraft(emptyDraft(categories[0]?.id));
    setEditingId(null);
    setError(null);
    setShowForm(true);
  };

  const startEdit = (r) => {
    setDraft({
      title: r.title,
      category: r.category,
      severity: r.severity,
      matchType: r.matchType || "text",
      pattern: r.pattern,
      message: r.message || "",
    });
    setEditingId(r.id);
    setError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setError(null);
    setDraft(emptyDraft(categories[0]?.id));
  };

  const submit = () => {
    const err = validateCustomRule(draft);
    if (err) {
      setError(err);
      return;
    }
    const fields = {
      title: draft.title.trim(),
      category: draft.category,
      severity: draft.severity,
      matchType: draft.matchType,
      pattern: draft.pattern,
      message: draft.message.trim(),
    };
    if (editingId) {
      setRules(updateCustomRule(stackId, editingId, fields));
    } else {
      setRules(
        addCustomRule(stackId, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ruleId: makeCustomRuleId(),
          enabled: true,
          ...fields,
        }),
      );
    }
    closeForm();
    onChange?.();
  };

  const toggle = (id, enabled) => {
    setRules(updateCustomRule(stackId, id, { enabled }));
    onChange?.();
  };

  const remove = (id) => {
    setRules(deleteCustomRule(stackId, id));
    onChange?.();
  };

  const catMeta = (id) =>
    categories.find((c) => c.id === id) || { label: id, icon: "📋", color: theme.color.textMuted, bg: theme.color.surfaceSubtle };

  return (
    <div style={{ marginBottom: 20, background: theme.color.surface, borderRadius: 12, border: `1px solid ${theme.color.border}`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", background: theme.color.primaryMuted, borderBottom: `1px solid ${theme.color.border}` }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: theme.color.text }}>✎ Custom rules</div>
          <div style={{ fontSize: 11.5, color: theme.color.textMuted, marginTop: 2 }}>
            Your own checks for this stack. They run on the next Rules scan and count toward scores.
          </div>
        </div>
        <button
          type="button"
          onClick={() => (showForm ? closeForm() : openNew())}
          style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: "none", background: theme.color.primary, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {showForm ? "Cancel" : "+ New rule"}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: "14px", borderBottom: `1px solid ${theme.color.border}`, background: theme.color.surfaceSubtle }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <label style={{ gridColumn: "1 / -1" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.color.textSecondary }}>Title</span>
              <input style={inputStyle} value={draft.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. No console.log left in specs" />
            </label>

            <label>
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.color.textSecondary }}>Category</span>
              <select style={inputStyle} value={draft.category} onChange={(e) => setField("category", e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.color.textSecondary }}>Severity</span>
              <select style={inputStyle} value={draft.severity} onChange={(e) => setField("severity", e.target.value)}>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </label>

            <label>
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.color.textSecondary }}>Match type</span>
              <select style={inputStyle} value={draft.matchType} onChange={(e) => setField("matchType", e.target.value)}>
                <option value="text">Text contains</option>
                <option value="regex">Regular expression</option>
              </select>
            </label>

            <label>
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.color.textSecondary }}>
                {draft.matchType === "regex" ? "Pattern (regex)" : "Pattern (text)"}
              </span>
              <input
                style={{ ...inputStyle, fontFamily: draft.matchType === "regex" ? theme.fontMono : "inherit" }}
                value={draft.pattern}
                onChange={(e) => setField("pattern", e.target.value)}
                placeholder={draft.matchType === "regex" ? "console\\.(log|debug)\\(" : "console.log"}
              />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.color.textSecondary }}>Message / fix (optional)</span>
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={draft.message} onChange={(e) => setField("message", e.target.value)} placeholder="Explain what to do instead — shown on the finding." />
            </label>
          </div>

          {error && (
            <div style={{ fontSize: 11.5, color: theme.color.danger, marginBottom: 8 }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={submit} style={{ fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", background: theme.color.primary, color: "#fff", cursor: "pointer" }}>
              {editingId ? "Save changes" : "Add rule"}
            </button>
            <span style={{ fontSize: 11, color: theme.color.textMuted, alignSelf: "center" }}>
              {draft.matchType === "regex" ? "Matched case-insensitively against each line." : "Case-insensitive substring match per line."}
            </span>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <div style={{ padding: "14px", fontSize: 12, color: theme.color.textMuted }}>
          No custom rules yet. Click <strong>+ New rule</strong> to add your team's own checks.
        </div>
      ) : (
        rules.map((r) => {
          const sev = SEV[r.severity] || SEV.info;
          const cat = catMeta(r.category);
          return (
            <div key={r.id} style={{ padding: "11px 14px", borderBottom: `1px solid ${theme.color.surfaceSubtle}`, opacity: r.enabled === false ? 0.6 : 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, marginTop: 2 }}>
                <input type="checkbox" checked={r.enabled !== false} onChange={(e) => toggle(r.id, e.target.checked)} />
                <span style={{ fontSize: 11, fontWeight: 600, color: r.enabled === false ? theme.color.textMuted : theme.color.rules }}>{r.enabled === false ? "Off" : "On"}</span>
              </label>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 99, background: sev.bg, color: sev.color, border: `1px solid ${sev.border}` }}>{r.severity}</span>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 99, background: cat.bg, color: cat.color, fontWeight: 600 }}>{cat.icon} {cat.label}</span>
                  <code style={{ fontSize: 10, color: theme.color.textMuted }}>{r.ruleId}</code>
                  <span style={{ fontWeight: 600, fontSize: 13, color: theme.color.text }}>{r.title}</span>
                </div>
                <div style={{ fontSize: 11.5, color: theme.color.textMuted }}>
                  <strong>{r.matchType === "regex" ? "regex" : "text"}:</strong>{" "}
                  <code style={{ fontFamily: theme.fontMono, background: theme.color.surfaceSubtle, padding: "1px 5px", borderRadius: 4 }}>{r.pattern}</code>
                  {r.message ? <> — {r.message}</> : null}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => startEdit(r)} title="Edit rule" style={{ border: `1px solid ${theme.color.primaryBorder}`, background: editingId === r.id ? theme.color.primaryMuted : theme.color.surface, color: theme.color.primary, borderRadius: 6, fontSize: 11, fontWeight: 600, padding: "4px 9px", cursor: "pointer" }}>
                  Edit
                </button>
                <button type="button" onClick={() => remove(r.id)} title="Delete rule" style={{ border: `1px solid ${theme.color.dangerBorder}`, background: theme.color.surface, color: theme.color.danger, borderRadius: 6, fontSize: 11, fontWeight: 600, padding: "4px 9px", cursor: "pointer" }}>
                  Delete
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
