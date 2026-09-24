import { useState, useCallback, useMemo } from "react";
import { SEV, theme } from "../../shared/theme.js";
import { providerShortLabel } from "../../settings/aiSettingsDefaults.js";
import { buildFindingDisplayState } from "../../shared/findingPresentation.js";
import { getPracticeByRuleId } from "../../guides/index.js";
import { getPracticeDetails } from "../../guides/practiceDetails.js";
import PracticeDetail from "../practices/PracticeDetail.jsx";

function CodeBlock({ children, variant }) {
  const isActual = variant === "actual";
  return (
    <pre
      style={{
        margin: 0,
        background: isActual ? "#1c1917" : theme.color.codeBg,
        color: isActual ? "#fecaca" : theme.color.codeText,
        border: `1px solid ${isActual ? "#7f1d1d" : "#334155"}`,
        padding: "10px 12px",
        borderRadius: theme.radius.md,
        fontSize: 11,
        overflowX: "auto",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        fontFamily: theme.fontMono,
      }}
    >
      {children}
    </pre>
  );
}

const metaDot = (color) => ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: color,
  display: "inline-block",
  flexShrink: 0,
});

export default function FindingCard({ f, categories = [], stackId = "playwright", onOpenPractices, onAiFix = null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiFix, setAiFix] = useState(null);
  const [aiFixLoading, setAiFixLoading] = useState(false);
  const [aiFixError, setAiFixError] = useState(null);
  const [aiFixCopied, setAiFixCopied] = useState(false);
  const sev = SEV[f.severity] || SEV.info;
  const cat = categories.find((c) => c.id === f.category) || {
    icon: "📋",
    label: f.category,
    color: theme.color.textMuted,
    bg: theme.color.surfaceSubtle,
  };

  const display = useMemo(() => buildFindingDisplayState(f, stackId), [f, stackId]);
  const {
    whyHelp,
    actualCode,
    solutionCode,
    fixIsContextual,
    actualCodeLabel,
    simpleTerms,
    section3LeftHint,
  } = display;

  const practice = f.ruleId ? getPracticeByRuleId(stackId, f.ruleId) : null;
  const practiceDetails = practice ? getPracticeDetails(practice.id) : null;

  const hasDetails = Boolean(
    whyHelp.whyUse || whyHelp.impact || simpleTerms || actualCode || solutionCode || f.reference || practiceDetails,
  );

  const copyFix = useCallback(
    async (e) => {
      e.stopPropagation();
      if (!solutionCode) return;
      try {
        await navigator.clipboard.writeText(solutionCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* clipboard blocked */
      }
    },
    [solutionCode],
  );

  const handleAiFix = useCallback(async (e) => {
    e.stopPropagation();
    if (!onAiFix || aiFixLoading) return;
    setAiFixLoading(true);
    setAiFixError(null);
    setAiFix(null);
    try {
      const result = await onAiFix(f);
      setAiFix(result);
    } catch (err) {
      setAiFixError(err.message || "AI fix failed");
    } finally {
      setAiFixLoading(false);
    }
  }, [onAiFix, f, aiFixLoading]);

  const copyAiFix = useCallback(async (e) => {
    e.stopPropagation();
    if (!aiFix) return;
    // Extract just the code block from the response
    const codeMatch = aiFix.match(/```[\w]*\n?([\s\S]*?)```/);
    const text = codeMatch ? codeMatch[1].trim() : aiFix;
    try {
      await navigator.clipboard.writeText(text);
      setAiFixCopied(true);
      setTimeout(() => setAiFixCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }, [aiFix]);

  const lead = simpleTerms || whyHelp.whyUse;

  return (
    <div
      style={{
        display: "flex",
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        marginBottom: 8,
        overflow: "hidden",
        background: theme.color.surface,
        boxShadow: theme.shadow.card,
      }}
    >
      {/* severity accent bar */}
      <div style={{ width: 4, background: sev.color, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* header — click to expand */}
        <button
          type="button"
          onClick={() => hasDetails && setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "11px 14px",
            background: "transparent",
            border: "none",
            textAlign: "left",
            cursor: hasDetails ? "pointer" : "default",
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.04em",
              padding: "3px 8px",
              borderRadius: theme.radius.pill,
              background: sev.bg,
              color: sev.color,
              border: `1px solid ${sev.border}`,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {sev.label.toUpperCase()}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: 13.5, color: theme.color.text }}>{f.title}</span>
              {f.analysisSource && (
                <span
                  style={{
                    fontSize: 9.5,
                    padding: "1px 6px",
                    borderRadius: theme.radius.pill,
                    background: f.analysisSource === "ai" ? theme.color.aiBg : theme.color.rulesBg,
                    color: f.analysisSource === "ai" ? theme.color.ai : theme.color.rules,
                    fontWeight: 700,
                  }}
                >
                  {f.analysisSource === "local" ? "Rules" : providerShortLabel(f.analysisSource)}
                </span>
              )}
            </div>
            {/* muted meta line */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 3,
                fontSize: 11,
                color: theme.color.textMuted,
                flexWrap: "wrap",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={metaDot(cat.color)} />
                {cat.label}
              </span>
              {f.line != null && <span>· Line {f.line}</span>}
              {f.ruleId && <span style={{ fontFamily: theme.fontMono }}>· {f.ruleId}</span>}
            </div>
          </div>

          {onAiFix && (
            <button
              type="button"
              onClick={handleAiFix}
              disabled={aiFixLoading}
              title="Generate an AI fix for this finding"
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: theme.radius.sm,
                border: `1px solid #a78bfa`,
                background: aiFixLoading ? "#f5f3ff" : "#ede9fe",
                color: "#7c3aed",
                cursor: aiFixLoading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {aiFixLoading ? (
                <>
                  <span style={{ width: 9, height: 9, border: "1.5px solid #a78bfa", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                  Generating…
                </>
              ) : (
                "✨ AI Fix"
              )}
            </button>
          )}

          {hasDetails && (
            <span
              style={{
                fontSize: 11,
                color: theme.color.textMuted,
                transform: open ? "rotate(90deg)" : "none",
                transition: "transform 0.15s",
                flexShrink: 0,
              }}
              aria-hidden
            >
              ▶
            </span>
          )}
        </button>

        {/* problem — always visible, concise */}
        <p
          style={{
            margin: 0,
            padding: "0 14px 12px 14px",
            fontSize: 12.5,
            color: theme.color.textSecondary,
            lineHeight: 1.5,
          }}
        >
          {display.problemText}
        </p>

        {/* details — progressive disclosure */}
        {open && hasDetails && (
          <div style={{ borderTop: `1px solid ${theme.color.border}`, padding: "12px 14px", background: theme.color.surfaceSubtle }}>
            {(lead || whyHelp.impact) && (
              <div style={{ marginBottom: actualCode || solutionCode ? 14 : 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: theme.color.textMuted, textTransform: "uppercase", marginBottom: 6 }}>
                  Why it matters
                </div>
                {lead && (
                  <p style={{ margin: "0 0 6px", fontSize: 12.5, color: theme.color.textSecondary, lineHeight: 1.55 }}>{lead}</p>
                )}
                {whyHelp.impact && whyHelp.impact !== whyHelp.howHelps && (
                  <p style={{ margin: 0, fontSize: 11.5, color: theme.color.warning, lineHeight: 1.5 }}>
                    <strong style={{ fontWeight: 700 }}>Risk if ignored: </strong>
                    {whyHelp.impact}
                  </p>
                )}
              </div>
            )}

            {(actualCode || solutionCode) && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: theme.color.textMuted, textTransform: "uppercase", marginBottom: 8 }}>
                  Suggested fix
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: actualCode && solutionCode ? "minmax(0, 1fr) minmax(0, 1fr)" : "1fr",
                    gap: 10,
                  }}
                >
                  {actualCode && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.color.danger, marginBottom: 6 }}>
                        {actualCodeLabel || "Your code"}
                      </div>
                      {section3LeftHint && (
                        <p style={{ margin: "0 0 6px", fontSize: 11, color: theme.color.textMuted, lineHeight: 1.45 }}>{section3LeftHint}</p>
                      )}
                      <CodeBlock variant="actual">{actualCode}</CodeBlock>
                    </div>
                  )}
                  {solutionCode && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: theme.color.rules }}>Recommended</div>
                        <button
                          type="button"
                          onClick={copyFix}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "3px 9px",
                            borderRadius: theme.radius.sm,
                            border: `1px solid ${theme.color.rulesBorder}`,
                            background: copied ? theme.color.rulesBg : theme.color.surface,
                            color: theme.color.rules,
                            cursor: "pointer",
                          }}
                        >
                          {copied ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                      <CodeBlock variant="solution">{solutionCode}</CodeBlock>
                    </div>
                  )}
                </div>
                {!actualCode && solutionCode && !fixIsContextual && (
                  <p style={{ margin: "10px 0 0", fontSize: 11, color: theme.color.textMuted, lineHeight: 1.45 }}>
                    This rule applies to the whole file. Re-run rules after saving, or open the file at the line above.
                  </p>
                )}
              </div>
            )}

            {practiceDetails && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: theme.color.textMuted, textTransform: "uppercase", marginBottom: 6 }}>
                  Learn in depth
                </div>
                <PracticeDetail details={practiceDetails} />
              </div>
            )}

            {f.reference && (
              <div style={{ marginTop: 12, fontSize: 11, color: theme.color.textMuted }}>
                Learn more:{" "}
                {String(f.reference).startsWith("http") ? (
                  <a href={f.reference} target="_blank" rel="noreferrer" style={{ color: theme.color.primary, fontWeight: 600 }}>
                    {f.reference.replace(/^https?:\/\//, "")} ↗
                  </a>
                ) : onOpenPractices ? (
                  <button
                    type="button"
                    onClick={onOpenPractices}
                    style={{ border: "none", background: "transparent", color: theme.color.primary, fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 11, textDecoration: "underline", textUnderlineOffset: 2 }}
                  >
                    {f.reference} →
                  </button>
                ) : (
                  f.reference
                )}
              </div>
            )}

            {/* ── AI Fix result panel ── */}
            {(aiFix || aiFixError) && (
              <div style={{ marginTop: 14, borderTop: `1px solid #ede9fe`, paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "#7c3aed", textTransform: "uppercase" }}>
                    ✨ AI-generated fix
                  </div>
                  {aiFix && (
                    <button
                      type="button"
                      onClick={copyAiFix}
                      style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: theme.radius.sm, border: "1px solid #a78bfa", background: aiFixCopied ? "#ede9fe" : "#fff", color: "#7c3aed", cursor: "pointer" }}
                    >
                      {aiFixCopied ? "✓ Copied" : "Copy code"}
                    </button>
                  )}
                </div>
                {aiFixError && (
                  <p style={{ margin: 0, fontSize: 12, color: theme.color.danger }}>{aiFixError}</p>
                )}
                {aiFix && (() => {
                  // Parse EXPLANATION + code block
                  const explMatch = aiFix.match(/EXPLANATION:\s*(.+?)(?:\n|$)/i);
                  const codeMatch = aiFix.match(/```[\w]*\n?([\s\S]*?)```/);
                  const explanation = explMatch?.[1]?.trim();
                  const code = codeMatch?.[1]?.trim() ?? aiFix;
                  return (
                    <>
                      {explanation && (
                        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#5b21b6", lineHeight: 1.5, fontStyle: "italic" }}>
                          {explanation}
                        </p>
                      )}
                      <CodeBlock variant="solution">{code}</CodeBlock>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
