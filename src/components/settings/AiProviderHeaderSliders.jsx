import {
  AI_PROVIDERS,
  hasProviderCredentials,
  isProviderEnabled,
  setProviderEnabled,
} from "../../settings/aiSettingsDefaults.js";
import { useAiSettings } from "../../settings/AiSettingsContext.jsx";

/**
 * Unified chip — two jobs in one:
 *
 *  ENABLE / DISABLE:
 *    OFF → click → enable (or open settings if no key)
 *    ON  + no results → click → disable
 *
 *  VIEW SWITCHING:
 *    ON  + has results → click → switch results view to this provider
 *    ON  + is current view → bright border (active indicator); click → back to Local
 */
function ProviderChip({
  label, on, ready, hasResults, isViewing,
  onToggle, onView,
}) {
  const handleClick = () => {
    if (!on) {
      onToggle();                 // enable (or open settings)
    } else if (hasResults) {
      onView();                   // switch view, or back to local if already viewing
    } else {
      onToggle();                 // disable (enabled but never run)
    }
  };

  const bg     = on ? (ready ? "#0d9488" : "#92400e") : "#1e293b";
  const color  = on ? "#fff"    : "#64748b";
  const dot    = on ? (ready ? "#4ade80" : "#fbbf24") : "#334155";
  const border = isViewing ? "#fff" : (on ? (ready ? "#2dd4bf" : "#f59e0b") : "#334155");
  const shadow = isViewing ? "0 0 0 2px #0d9488, 0 0 8px rgba(13,148,136,0.4)" : "none";

  const title = !on
    ? `Enable ${label}`
    : hasResults
      ? isViewing
        ? `Viewing ${label} results · click to return to Local`
        : `Switch to ${label} results`
      : ready
        ? `${label} enabled · run analysis to get results`
        : `${label} enabled but no API key — open Settings`;

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-pressed={isViewing}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 20,
        border: `1px solid ${border}`,
        boxShadow: shadow,
        background: bg, color,
        fontSize: 11, fontWeight: 700,
        cursor: "pointer",
        transition: "all 0.15s",
        whiteSpace: "nowrap", userSelect: "none",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0, transition: "background 0.12s" }} />
      {label}
    </button>
  );
}

/** The Local chip — always enabled, just switches view */
function LocalChip({ isViewing, hasResults, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hasResults ? (isViewing ? "Viewing local rule results (current)" : "Switch to local rule results") : "Run analysis to see local results"}
      aria-pressed={isViewing}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 20,
        border: isViewing ? "1px solid #fff" : "1px solid #2dd4bf",
        boxShadow: isViewing ? "0 0 0 2px #0d9488, 0 0 8px rgba(13,148,136,0.4)" : "none",
        background: "#0d9488", color: "#fff",
        fontSize: 11, fontWeight: 700,
        cursor: hasResults ? "pointer" : "default",
        transition: "all 0.15s",
        whiteSpace: "nowrap", userSelect: "none",
        opacity: hasResults ? 1 : 0.55,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
      Local
    </button>
  );
}

export default function AiProviderHeaderSliders({
  onOpenSettings,
  variant = "default",
  // View-switching props (passed from header)
  resultsView = "local",
  onResultsViewChange,
  providersWithResults = [],
  hasLocalResults = false,
}) {
  const { settings, updateSettings } = useAiSettings();

  const toggle = (providerId) => {
    const enabled = isProviderEnabled(settings, providerId);
    const ready   = hasProviderCredentials(settings, providerId);
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

  const switchView = (id) => {
    // If already viewing this provider → back to local
    onResultsViewChange?.(resultsView === id ? "local" : id);
  };

  const hasMultiple = hasLocalResults && providersWithResults.length > 0;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 8px", borderRadius: 10,
        background: "#0f172a", border: "1px solid #1e3a5f",
      }}
    >
      {/* Local chip — only "active" when there are local results to view */}
      <LocalChip
        isViewing={resultsView === "local" && hasLocalResults}
        hasResults={hasLocalResults}
        onClick={() => onResultsViewChange?.("local")}
      />

      {/* Per-provider chips */}
      {AI_PROVIDERS.map((p) => {
        const on         = isProviderEnabled(settings, p.id);
        const ready      = hasProviderCredentials(settings, p.id);
        const hasResults = providersWithResults.some((x) => x.id === p.id);
        // Only show active-view glow when there are actual results to view
        const isViewing  = resultsView === p.id && hasResults;
        return (
          <ProviderChip
            key={p.id}
            label={p.shortLabel}
            on={on}
            ready={ready}
            hasResults={hasResults}
            isViewing={isViewing}
            onToggle={() => toggle(p.id)}
            onView={() => switchView(p.id)}
          />
        );
      })}

      {/* Compare-all — only when ≥2 result sources exist */}
      {hasMultiple && (
        <button
          type="button"
          onClick={() => onResultsViewChange?.(resultsView === "compare-all" ? "local" : "compare-all")}
          title="Compare all — rules vs AI side by side"
          aria-pressed={resultsView === "compare-all"}
          style={{
            fontSize: 13, padding: "3px 7px", borderRadius: 8,
            border: resultsView === "compare-all" ? "1px solid #fff" : "1px solid #334155",
            boxShadow: resultsView === "compare-all" ? "0 0 0 2px #0d9488" : "none",
            background: "transparent", color: resultsView === "compare-all" ? "#fff" : "#64748b",
            cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
          }}
          title="Compare all sources side-by-side"
        >
          ⊞
        </button>
      )}

      {/* Divider */}
      <span style={{ width: 1, height: 16, background: "#1e3a5f", flexShrink: 0 }} aria-hidden />

      {/* Settings icon */}
      <button
        type="button"
        onClick={() => onOpenSettings?.({})}
        aria-label="AI provider settings"
        title="API keys and models"
        style={{
          width: 26, height: 26, borderRadius: 8,
          border: "1px solid #0d9488", background: "transparent",
          color: "#5eead4", fontSize: 13,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", flexShrink: 0, transition: "background 0.12s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#0d9488"; e.currentTarget.style.color = "#fff"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#5eead4"; }}
      >
        ⚙
      </button>
    </div>
  );
}
