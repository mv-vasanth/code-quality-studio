import { theme, severity, verdictTone } from "../shared/theme.js";

/** Shared CSS for standalone HTML reports (full, executive, complete package). */
export function reportBaseCss() {
  const t = theme.color;
  const sev = severity;
  return `
    * { box-sizing: border-box; }
    body { font-family: ${theme.font}; margin: 0; background: ${t.canvas}; color: ${t.text}; line-height: 1.55; }
    a { color: ${t.primary}; }
    .wrap { max-width: 920px; margin: 0 auto; padding: 24px 20px 56px; }
    header.report-hero {
      background: linear-gradient(135deg, ${t.header} 0%, #1e3a5f 100%);
      color: ${t.textInverse};
      padding: 28px 24px;
      border-radius: ${theme.radius.lg}px;
      margin-bottom: 20px;
      box-shadow: ${theme.shadow.card};
    }
    header.report-hero h1 { margin: 0 0 8px; font-size: 1.55rem; font-weight: 800; }
    header.report-hero .sub { color: #94a3b8; font-size: 0.9rem; }
    .verdict {
      padding: 16px 18px;
      border-radius: ${theme.radius.md}px;
      margin-bottom: 20px;
      border: 1px solid var(--verdict-border);
      background: var(--verdict-bg);
      color: var(--verdict-color);
    }
    .verdict h2 { margin: 0 0 6px; font-size: 1.12rem; }
    .verdict p { margin: 0; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; margin-bottom: 24px; }
    .stat {
      background: ${t.surface};
      border: 1px solid ${t.border};
      border-radius: ${theme.radius.md}px;
      padding: 12px;
      text-align: center;
    }
    .stat .n { font-size: 1.55rem; font-weight: 800; color: ${t.primary}; }
    .stat .n.critical { color: ${sev.critical.color}; }
    .stat .n.warning { color: ${sev.warning.color}; }
    .stat .n.info { color: ${sev.info.color}; }
    .stat .l { font-size: 0.7rem; color: ${t.textMuted}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .block {
      background: ${t.surface};
      border: 1px solid ${t.border};
      border-radius: ${theme.radius.lg}px;
      padding: 18px 20px;
      margin-bottom: 16px;
    }
    .block h2 { margin: 0 0 14px; font-size: 1.08rem; color: ${t.text}; }
    .finding {
      padding: 14px 16px;
      border-radius: ${theme.radius.md}px;
      margin-bottom: 12px;
      border-left: 4px solid var(--sev-color);
      background: var(--sev-bg);
    }
    .badge {
      color: #fff;
      font-size: 0.65rem;
      font-weight: 800;
      padding: 4px 8px;
      border-radius: ${theme.radius.pill}px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--sev-color);
    }
    pre {
      background: ${t.codeBg};
      color: ${t.codeText};
      padding: 12px 14px;
      border-radius: ${theme.radius.md}px;
      overflow-x: auto;
      font-size: 0.8rem;
      white-space: pre-wrap;
      font-family: ${theme.fontMono};
    }
  `;
}

export function severityCssVars(sevKey) {
  const s = severity[sevKey] || severity.info;
  return `--sev-color:${s.color};--sev-bg:${s.bg};`;
}

export function verdictCssVars(toneKey) {
  const v = verdictTone[toneKey] || verdictTone.neutral;
  return `--verdict-border:${v.border};--verdict-bg:${v.bg};--verdict-color:${v.color};`;
}

export { theme, severity, verdictTone };
