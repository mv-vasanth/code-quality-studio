import {
  AI_PROVIDERS,
  hasProviderCredentials,
  isProviderEnabled,
  setProviderEnabled,
} from "../../settings/aiSettingsDefaults.js";
import { useAiSettings } from "../../settings/AiSettingsContext.jsx";

function MiniSwitch({ on, ready, onClick, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      style={{
        position: "relative",
        width: 32,
        height: 18,
        borderRadius: 9,
        border: "none",
        cursor: "pointer",
        background: on ? (ready ? "#22c55e" : "#f59e0b") : "#475569",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.12s",
        }}
      />
    </button>
  );
}

export default function AiProviderHeaderSliders({ onOpenSettings, variant = "default" }) {
  const { settings, updateSettings } = useAiSettings();

  const toggle = (providerId) => {
    const enabled = isProviderEnabled(settings, providerId);
    const ready = hasProviderCredentials(settings, providerId);
    if (!enabled && !ready) {
      onOpenSettings?.({ provider: providerId, setupFromToggle: true });
      return;
    }
    const next = setProviderEnabled(settings, providerId, !enabled);
    updateSettings({
      enabledProviders: next,
      useAi: Object.values(next).some(Boolean),
      provider: providerId,
    });
  };

  const compact = variant === "compact";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 10 : 6,
        flexWrap: "wrap",
        ...(compact
          ? {
              background: "#1e1b4b",
              border: "1px solid #0f766e",
              borderRadius: 10,
              padding: "6px 10px",
            }
          : {}),
      }}
    >
      {AI_PROVIDERS.map((p) => {
        const on = isProviderEnabled(settings, p.id);
        const ready = hasProviderCredentials(settings, p.id);
        return (
          <label
            key={p.id}
            title={
              on
                ? ready
                  ? `${p.shortLabel} runs when you upload or re-run`
                  : `Add ${p.shortLabel} credentials in settings`
                : `Enable ${p.shortLabel}`
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span
              style={{
                color: on ? "#ccfbf1" : "#94a3b8",
                fontSize: 11,
                fontWeight: 600,
                minWidth: compact ? 52 : undefined,
              }}
            >
              {p.shortLabel}
            </span>
            <MiniSwitch
              label={`${p.shortLabel} AI`}
              on={on}
              ready={ready}
              onClick={() => toggle(p.id)}
            />
          </label>
        );
      })}
      <button
        type="button"
        onClick={() => onOpenSettings?.({})}
        aria-label="AI provider settings"
        title="API keys and models"
        style={{
          fontSize: 11,
          padding: "5px 10px",
          borderRadius: 8,
          border: "1px solid #0d9488",
          background: "#334155",
          color: "#99f6e4",
          fontWeight: 600,
          cursor: "pointer",
          marginLeft: compact ? 4 : 0,
        }}
      >
        Settings
      </button>
    </div>
  );
}
