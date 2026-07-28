import { hasAiCredentials } from "../../settings/aiSettingsDefaults.js";

const btn = {
  width: "100%",
  padding: "7px 8px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  marginBottom: 6,
};

export default function RerunAllControls({
  fileCount,
  busy,
  onRerunAll,
  onRerunBoth,
  onOpenAiSettings,
  aiCredentialsReady,
}) {
  if (!fileCount) return null;

  const disabled = busy;

  const runAi = () => {
    if (!aiCredentialsReady) {
      onOpenAiSettings?.();
      return;
    }
    onRerunAll("ai");
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#888",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        RE-RUN ALL FILES
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onRerunAll("local")}
        title="Re-analyse every loaded file with standard rules only"
        style={{
          ...btn,
          border: "1px solid #99f6e4",
          background: disabled ? "#f9fafb" : "#f0fdfa",
          color: disabled ? "#9ca3af" : "#0f766e",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Running…" : "↺ Standard rules (no AI)"}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={runAi}
        title={
          aiCredentialsReady
            ? "Re-analyse every loaded file with your configured AI provider"
            : "Configure AI credentials in Settings first"
        }
        style={{
          ...btn,
          marginBottom: 0,
          border: "1px solid #5eead4",
          background: disabled ? "#f9fafb" : "#0d9488",
          color: disabled ? "#9ca3af" : "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: !aiCredentialsReady && !disabled ? 0.85 : 1,
        }}
      >
        {busy ? "Running…" : "↺ With AI"}
      </button>
      <button
        type="button"
        disabled={disabled || !aiCredentialsReady}
        onClick={() => onRerunBoth?.()}
        title="Run standard rules then AI on every file and compare in the Both view"
        style={{
          ...btn,
          marginTop: 6,
          marginBottom: 0,
          border: "1px solid #86efac",
          background: disabled ? "#f9fafb" : "#ecfdf5",
          color: disabled ? "#9ca3af" : "#047857",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Running…" : "↺ Rules + AI (both)"}
        {!aiCredentialsReady && !busy ? " (set up)" : ""}
      </button>
    </div>
  );
}
