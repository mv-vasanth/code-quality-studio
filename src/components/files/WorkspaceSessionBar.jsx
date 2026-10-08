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

/**
 * The restored-session strip.
 *
 * Previously five lines of prose plus a wrapped absolute path plus four
 * full-width buttons — the tallest thing in the sidebar, for something you
 * read once. The storage explanation is now on hover, the path is truncated
 * from the left (the tail is the part you recognise), and the actions are
 * icons on one row.
 */
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
        padding: "9px 10px",
        borderRadius: 10,
        background: c.primaryMuted,
        border: `1px solid ${c.primaryBorder}`,
        fontSize: 11.5,
        color: c.textSecondary,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.6)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#14b8a6", flexShrink: 0 }} />
        <strong style={{ fontSize: 11.5, color: c.primaryHover }}>
          {fileCount} file{fileCount === 1 ? "" : "s"} restored
        </strong>
        <span
          title={`Files and results are stored in this browser (IndexedDB), so refreshing restores them and nothing is re-uploaded.${
            savedLabel ? `\n\nLast saved ${savedLabel}.` : ""
          }\n\nTo pick up edits made on disk, use "Add folder" again.`}
          style={{ marginLeft: "auto", cursor: "help", color: c.textMuted, fontSize: 11 }}
        >
          ⓘ
        </span>
      </div>

      {folderHint && (
        // direction:rtl truncates at the *start*, keeping the folder you
        // actually recognise instead of a long common prefix.
        <div
          title={folderHint}
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 10,
            color: c.textMuted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            direction: "rtl",
            textAlign: "left",
            marginBottom: 7,
          }}
        >
          {folderHint}
        </div>
      )}

      <div style={{ display: "flex", gap: 5 }}>
        <button
          type="button"
          disabled={busy}
          onClick={onRerunRules}
          title="Re-run the standard rules over every restored file"
          className="cqs-card cqs-lift cqs-press"
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 700,
            padding: "5px 8px",
            borderRadius: 6,
            border: `1px solid ${c.primaryBorder}`,
            background: c.surface,
            color: c.primaryHover,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          ↺ Re-run
        </button>
        <button type="button" onClick={onAddFiles} title="Add individual files" style={iconBtn}>+ Files</button>
        <button type="button" onClick={onAddFolder} title="Add a folder (also refreshes edits on disk)" style={iconBtn}>+ Folder</button>
        <button
          type="button"
          onClick={onClear}
          title="Forget this saved workspace"
          style={{ ...iconBtn, color: c.danger, borderColor: c.dangerBorder, flex: "0 0 auto", padding: "5px 7px" }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

const iconBtn = {
  flex: 1,
  fontSize: 11,
  fontWeight: 600,
  padding: "5px 6px",
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  background: c.surface,
  color: c.textSecondary,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
