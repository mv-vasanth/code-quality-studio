import { useState } from "react";
import { hasAiCredentials, isAiConfigured } from "../../settings/aiSettingsDefaults.js";
import { useAiSettings } from "../../settings/AiSettingsContext.jsx";
import AiProviderFields from "./AiProviderFields.jsx";

export default function AiSettingsModal({ open, onClose, setupFromToggle = false, initialProvider = null }) {
  const { settings, updateSettings, clearSecrets } = useAiSettings();
  const focusProvider = initialProvider || settings.provider;
  const [showSecrets, setShowSecrets] = useState(false);

  if (!open) return null;

  const credentialsReady = hasAiCredentials(settings);
  const configured = settings.useAi ? isAiConfigured(settings) : credentialsReady;

  const handleDone = () => {
    if (setupFromToggle && credentialsReady) {
      updateSettings({ useAi: true, enabledProviders: { ...settings.enabledProviders, [focusProvider]: true } });
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-settings-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #f3f4f6" }}>
          <h2 id="ai-settings-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111" }}>
            {setupFromToggle ? "Connect AI provider" : "AI review settings"}
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
            {setupFromToggle
              ? "Add your API details once — they are saved in this browser (localStorage) and reused next time. They are not committed to the repo or server."
              : "Provider and keys are stored on this device only so you do not re-enter them each visit. Clear credentials anytime below."}
          </p>
        </div>

        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {!setupFromToggle && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={settings.useAi}
                onChange={(e) => updateSettings({ useAi: e.target.checked })}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>Use AI for new scans</span>
            </label>
          )}

          {setupFromToggle && (
            <p style={{ margin: 0, fontSize: 12, color: "#0f766e", background: "#f0fdfa", padding: 10, borderRadius: 8 }}>
              Turn on AI review after you save a valid provider below.
            </p>
          )}

          {(settings.useAi || setupFromToggle) && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#6b7280" }}>
                <input type="checkbox" checked={showSecrets} onChange={(e) => setShowSecrets(e.target.checked)} />
                Show secret fields
              </label>
              <AiProviderFields
                settings={{ ...settings, provider: focusProvider }}
                updateSettings={updateSettings}
                showSecrets={showSecrets}
              />
            </>
          )}

          {!settings.useAi && !setupFromToggle && (
            <p style={{ margin: 0, fontSize: 12, color: "#059669", background: "#ecfdf5", padding: 10, borderRadius: 8 }}>
              Standard rule checks run without any API. Use the top-bar switch to enable AI.
            </p>
          )}
        </div>

        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid #f3f4f6",
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => clearSecrets()}
            style={{
              padding: "8px 12px",
              fontSize: 11,
              border: "1px solid #fecaca",
              background: "#fff",
              color: "#dc2626",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Clear saved credentials
          </button>
          <button
            type="button"
            onClick={handleDone}
            style={{
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              background: credentialsReady || configured ? "#0d9488" : "#94a3b8",
              color: "#fff",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {setupFromToggle ? (credentialsReady ? "Save & turn on AI" : "Save") : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
