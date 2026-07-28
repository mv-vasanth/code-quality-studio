/**
 * Code Quality Studio — design tokens (app + exported reports).
 * Slate neutrals + indigo primary; semantic severity aligned with WCAG-friendly contrast.
 */
export const theme = {
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',

  color: {
    primary: "#0d9488",
    primaryHover: "#0f766e",
    primaryMuted: "#f0fdfa",
    primaryBorder: "#99f6e4",
    primaryOnDark: "#ccfbf1",

    surface: "#ffffff",
    surfaceSubtle: "#f8fafc",
    canvas: "#f1f5f9",
    border: "#e2e8f0",
    borderStrong: "#cbd5e1",

    text: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#64748b",
    textInverse: "#ffffff",

    header: "#1e293b",
    headerBorder: "#334155",
    headerAccent: "#14b8a6",

    success: "#059669",
    successBg: "#ecfdf5",
    successBorder: "#6ee7b7",

    warning: "#d97706",
    warningBg: "#fffbeb",
    warningBorder: "#fcd34d",

    danger: "#dc2626",
    dangerBg: "#fef2f2",
    dangerBorder: "#fca5a5",

    info: "#2563eb",
    infoBg: "#eff6ff",
    infoBorder: "#93c5fd",

    ai: "#7c3aed",
    aiBg: "#f5f3ff",
    aiBorder: "#c4b5fd",

    rules: "#047857",
    rulesBg: "#ecfdf5",
    rulesBorder: "#6ee7b7",

    codeBg: "#0f172a",
    codeText: "#e2e8f0",
  },

  radius: {
    sm: 6,
    md: 8,
    lg: 12,
    pill: 999,
  },

  shadow: {
    card: "0 1px 3px rgba(15, 23, 42, 0.06)",
  },
};

export const severity = {
  critical: {
    color: theme.color.danger,
    bg: theme.color.dangerBg,
    border: theme.color.dangerBorder,
    label: "Critical",
  },
  warning: {
    color: theme.color.warning,
    bg: theme.color.warningBg,
    border: theme.color.warningBorder,
    label: "Warning",
  },
  info: {
    color: theme.color.info,
    bg: theme.color.infoBg,
    border: theme.color.infoBorder,
    label: "Info",
  },
};

export const verdictTone = {
  critical: { bg: theme.color.dangerBg, border: theme.color.dangerBorder, color: "#b91c1c" },
  warning: { bg: theme.color.warningBg, border: theme.color.warningBorder, color: "#b45309" },
  ok: { bg: theme.color.successBg, border: theme.color.successBorder, color: "#047857" },
  neutral: { bg: theme.color.surfaceSubtle, border: theme.color.border, color: theme.color.textSecondary },
};

export const scoreGrade = (s) => {
  if (s >= 90) return { g: "A", label: "Excellent", color: theme.color.success, bg: theme.color.successBg };
  if (s >= 80) return { g: "B", label: "Good", color: "#16a34a", bg: "#f0fdf4" };
  if (s >= 70) return { g: "C", label: "Acceptable", color: theme.color.warning, bg: theme.color.warningBg };
  if (s >= 55) return { g: "D", label: "Needs work", color: "#ea580c", bg: "#fff7ed" };
  return { g: "F", label: "Poor", color: theme.color.danger, bg: theme.color.dangerBg };
};

export const analysisSource = {
  local: { label: "Rules", color: theme.color.rules, bg: theme.color.rulesBg, border: theme.color.rulesBorder },
  ai: { label: "AI", color: theme.color.ai, bg: theme.color.aiBg, border: theme.color.aiBorder },
};

/** Button style presets for inline React styles */
export const buttons = {
  primary: {
    background: theme.color.primary,
    color: theme.color.textInverse,
    border: "none",
    borderRadius: theme.radius.md,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondary: {
    background: theme.color.surface,
    color: theme.color.primary,
    border: `1px solid ${theme.color.primaryBorder}`,
    borderRadius: theme.radius.md,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  ghostOnDark: {
    background: "transparent",
    color: theme.color.primaryOnDark,
    border: `1px solid ${theme.color.headerAccent}`,
    borderRadius: theme.radius.md,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  exportTeal: {
    background: "#0f766e",
    color: theme.color.textInverse,
    border: "none",
    borderRadius: theme.radius.md,
    padding: "6px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  exportMuted: {
    background: theme.color.surface,
    color: theme.color.textMuted,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.md,
    padding: "6px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
  },
};

export const SEV = severity;
