import { useState } from "react";
import { theme } from "../../shared/theme.js";
import {
  PERSONAS,
  getPersonaForStack,
  getStacksByPersona,
  defaultStackForPersona,
} from "../../stacks/definitions.js";

/**
 * Persona-first stack selector: a Testers | Devs toggle plus a grouped dropdown
 * of the stacks in the active persona.
 * @param {{ stacks, activeId, onChange, disabled }} props
 */
export default function StackSelector({ stacks, activeId, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const active = stacks.find((s) => s.id === activeId) || stacks[0];
  const activePersona = getPersonaForStack(activeId);
  const groups = getStacksByPersona(activePersona);

  const selectPersona = (personaId) => {
    if (personaId === activePersona) return;
    onChange(defaultStackForPersona(personaId));
    setOpen(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* Persona segmented toggle */}
      <div
        role="tablist"
        aria-label="Persona"
        style={{ display: "inline-flex", gap: 2, padding: 3, background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}
      >
        {PERSONAS.map((p) => {
          const on = p.id === activePersona;
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={on}
              disabled={disabled}
              onClick={() => selectPersona(p.id)}
              title={p.blurb}
              style={{
                border: "none",
                borderRadius: 6,
                padding: "5px 12px",
                fontSize: 11.5,
                fontWeight: on ? 700 : 500,
                cursor: disabled ? "not-allowed" : "pointer",
                background: on ? theme.color.primary : "transparent",
                color: on ? "#fff" : "#94a3b8",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Grouped stack dropdown */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#fff",
            borderRadius: 8,
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 14 }}>{active?.icon}</span>
          <span>{active?.shortName}</span>
          <span style={{ color: "#94a3b8", fontSize: 10 }}>▾</span>
        </button>

        {open && !disabled && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div
              role="listbox"
              style={{
                position: "absolute",
                left: 0,
                top: "calc(100% + 6px)",
                zIndex: 41,
                width: 320,
                maxHeight: "70vh",
                overflowY: "auto",
                background: theme.color.surface,
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.lg,
                boxShadow: "0 16px 40px rgba(15,23,42,0.22)",
                padding: 6,
              }}
            >
              {groups.map((grp) => (
                <div key={grp.group} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: theme.color.textMuted, padding: "8px 10px 4px" }}>
                    {grp.group}
                  </div>
                  {grp.stacks.map((s) => {
                    const on = s.id === activeId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        aria-selected={on}
                        onClick={() => { onChange(s.id); setOpen(false); }}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 9,
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: on ? theme.color.primaryMuted : "transparent",
                          borderRadius: theme.radius.sm,
                          padding: "7px 10px",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ fontSize: 15, lineHeight: 1.2, flexShrink: 0 }}>{s.icon}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: on ? theme.color.primaryHover : theme.color.text }}>
                            {s.name}
                          </span>
                          <span style={{ display: "block", fontSize: 11, color: theme.color.textMuted, lineHeight: 1.4 }}>
                            {s.tagline}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
