import { AI_PROVIDERS } from "../../settings/aiSettingsDefaults.js";
import { providerShortLabel } from "../../shared/fileResults.js";

const pill = (active, onDark) => ({
  fontSize: 11,
  fontWeight: 600,
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid",
  cursor: "pointer",
  lineHeight: 1.2,
  ...(onDark
    ? active
      ? { background: "#0d9488", borderColor: "#2dd4bf", color: "#fff" }
      : { background: "transparent", borderColor: "#0f766e", color: "#5eead4" }
    : active
      ? { background: "#f0fdfa", borderColor: "#14b8a6", color: "#0f766e" }
      : { background: "#fff", borderColor: "#e5e7eb", color: "#6b7280" }),
});

export default function AnalysisViewToggle({
  value,
  onChange,
  hasLocal,
  providersWithResults = [],
  compact,
  variant = "light",
}) {
  const onDark = variant === "onDark";
  const hasAi = providersWithResults.length > 0;
  const options = [
    { id: "local", label: compact ? "Rules" : "Standard rules", disabled: !hasLocal },
    ...AI_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.shortLabel,
      disabled: !providersWithResults.some((x) => x.id === p.id),
    })),
    {
      id: "compare-all",
      label: compact ? "All" : "Compare all",
      disabled: !(hasLocal && hasAi),
    },
  ];

  return (
    <div
      role="group"
      aria-label="Results view"
      style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: onDark ? "#94a3b8" : "#64748b",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          marginRight: 4,
        }}
      >
        View
      </span>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          style={{
            ...pill(value === o.id, onDark),
            opacity: o.disabled ? 0.4 : 1,
            cursor: o.disabled ? "not-allowed" : "pointer",
          }}
          title={
            o.disabled
              ? o.id === "compare-all"
                ? "Run rules and at least one AI to compare"
                : `No ${providerShortLabel(o.id)} results yet`
              : undefined
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
