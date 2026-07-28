/** @param {{ id: string, name: string, shortName: string, icon: string, accent: string, tagline: string }[]} stacks */
export default function StackSelector({ stacks, activeId, onChange, disabled }) {
  return (
    <div
      role="tablist"
      aria-label="Audit stack"
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 3,
        background: "#1e1b4b",
        borderRadius: 8,
        border: "1px solid #0f766e",
      }}
    >
      {stacks.map((stack) => {
        const active = stack.id === activeId;
        return (
          <button
            key={stack.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(stack.id)}
            title={stack.tagline}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 6,
              border: "none",
              background: active ? stack.accent : "transparent",
              color: active ? "#fff" : "#94a3b8",
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.7 : 1,
              transition: "background 0.12s, color 0.12s",
            }}
          >
            <span style={{ fontSize: 13 }}>{stack.icon}</span>
            <span>{stack.shortName}</span>
          </button>
        );
      })}
    </div>
  );
}
