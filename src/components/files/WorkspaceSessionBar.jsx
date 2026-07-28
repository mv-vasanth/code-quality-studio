/** Local tokens (matches src/shared/theme.js) — avoids fragile deep imports in this folder. */
const c = {
  primaryMuted: "#f0fdfa",
  primaryBorder: "#99f6e4",
  primaryHover: "#0f766e",
  textSecondary: "#475569",
  textMuted: "#64748b",
  surface: "#ffffff",
  border: "#e2e8f0",
  danger: "#dc2626",
  dangerBorder: "#fca5a5",
};

export default function WorkspaceSessionBar({
  folderHint,
  fileCount,
  savedAt,
  onAddFiles,
  onAddFolder,
  onRerunRules,
  onClear,
  busy,
}) {
  if (!fileCount) return null;

  const savedLabel = savedAt
    ? new Date(savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div
      style={{
        marginBottom: 10,
        padding: "10px 12px",
        borderRadius: 8,
        background: c.primaryMuted,
        border: `1px solid ${c.primaryBorder}`,
        fontSize: 11.5,
        color: c.textSecondary,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, color: c.primaryHover, marginBottom: 4 }}>
        Saved workspace — re-run anytime (no re-upload)
      </div>
      <div>
        <strong>{fileCount}</strong> file{fileCount === 1 ? "" : "s"}
        {folderHint ? (
          <>
            {" "}
            · <code style={{ fontSize: 10.5 }}>{folderHint}</code>
          </>
        ) : null}
        {savedLabel ? <span style={{ color: c.textMuted }}> · last saved {savedLabel}</span> : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <button
          type="button"
          disabled={busy}
          onClick={onRerunRules}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "5px 10px",
            borderRadius: 6,
            border: `1px solid ${c.primaryBorder}`,
            background: c.surface,
            color: c.primaryHover,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          ↺ Re-run rules
        </button>
        <button type="button" onClick={onAddFiles} style={ghostBtn}>
          + Add files
        </button>
        <button type="button" onClick={onAddFolder} style={ghostBtn}>
          + Add folder
        </button>
        <button
          type="button"
          onClick={onClear}
          style={{ ...ghostBtn, color: c.danger, borderColor: c.dangerBorder }}
        >
          Clear saved workspace
        </button>
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: c.textMuted }}>
        Files and results are stored in this browser (IndexedDB). Refreshing the page restores them. To pick up edits on disk, use Add folder again.
      </div>
    </div>
  );
}

const ghostBtn = {
  fontSize: 11,
  fontWeight: 600,
  padding: "5px 10px",
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  background: c.surface,
  color: c.textSecondary,
  cursor: "pointer",
};
