import { useState, useCallback, useMemo } from "react";
import { SEV, theme } from "../../shared/theme.js";
import { elevation, bevel, fx } from "../../shared/motion.js";
import { providerShortLabel } from "../../settings/aiSettingsDefaults.js";
import { buildFindingDisplayState } from "../../shared/findingPresentation.js";
import { getPracticeByRuleId } from "../../guides/index.js";
import { getPracticeDetails } from "../../guides/practiceDetails.js";
import PracticeDetail from "../practices/PracticeDetail.jsx";

/**
 * A finding, as one card.
 *
 * Two things were making the page unreadable. Repetition — a rule firing five
 * times in one file produced five identical cards — is handled upstream by
 * groupFindings(); this renders the group with a count and a row of line
 * chips. Depth is handled here: the card used to open into every section it
 * had at once (why, risk, two code columns, deep dive, watch-outs, link),
 * which is six screens of prose for one three-word fix. The sections are now
 * tabs, and the one you almost always want — the fix — is the default.
 */

/** When a suggestion restates the current code as a "// Before" block, drop it:
 *  the diff above already shows that line, in red. */
function fixOnly(solution, hasActual) {
  if (!hasActual || !solution) return solution;
  const m = String(solution).match(/^[\s\S]*?(^[ \t]*(?:\/\/|#)\s*After\b.*$)/im);
  if (!m) return solution;
  return solution.slice(solution.indexOf(m[1])).trim();
}

/**
 * Unified diff, with the file's real line numbers in the gutter.
 *
 * The first cut of this dropped the numbers, and the review was immediate and
 * correct: a red line with no number tells you what is wrong but not where,
 * which is the one thing a finding exists to tell you. Removals carry the
 * line they came from; additions carry "+", because they are not anywhere yet.
 */
function DiffBlock({ before, after, startLine = null, where = null, highlightLine = null }) {
  const beforeLines = before ? String(before).trimEnd().split("\n") : [];
  const afterLines = after ? String(after).trimEnd().split("\n") : [];

  const rows = [
    ...beforeLines.map((t, i) => ({
      sign: "-", t,
      // A file-level snippet is a sample from across the file, so sequential
      // numbering from the finding's line would be a lie. Only number it when
      // the snippet really is the lines at that point in the file.
      num: startLine != null ? startLine + i : null,
      // With a context window, only one line is the problem; the rest are
      // there so you can find it. Colouring all five red says five things
      // are wrong.
      context: highlightLine != null && startLine != null && startLine + i !== highlightLine,
    })),
    ...afterLines.map((t) => ({ sign: "+", t, num: null, context: false })),
  ];
  if (!rows.length) return null;

  return (
    <div style={{
      borderRadius: theme.radius.md,
      overflow: "hidden",
      boxShadow: `${bevel}, ${elevation.raised}`,
    }}>
      {where && (
        <div style={{
          padding: "5px 11px",
          background: "#1e293b",
          borderBottom: "1px solid #334155",
          fontFamily: theme.fontMono,
          fontSize: 10.5,
          color: "#94a3b8",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span aria-hidden>📄</span>
          <span style={{ color: "#cbd5e1" }}>{where}</span>
        </div>
      )}
      <pre style={{
        margin: 0,
        background: theme.color.codeBg,
        padding: "9px 0",
        fontSize: 11.5,
        lineHeight: 1.65,
        overflowX: "auto",
        fontFamily: theme.fontMono,
      }}>
        {rows.map(({ sign, t, num, context }, i) => {
          // A comment line inside the suggestion is guidance, not code to add —
          // marking it "+" would imply you should paste the comment too.
          const isNote = /^\s*(\/\/|#)/.test(t);
          const add = sign === "+";
          const plain = isNote || context;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
              <span style={{
                flex: "0 0 auto",
                minWidth: 44,
                padding: "0 8px",
                textAlign: "right",
                color: "#475569",
                userSelect: "none",
                fontVariantNumeric: "tabular-nums",
              }}>
                {isNote && num == null ? "" : num ?? (add ? "+" : "")}
              </span>
              <span style={{
                flex: 1,
                minWidth: 0,
                padding: "0 10px 0 8px",
                whiteSpace: "pre-wrap",
                color: context ? "#94a3b8" : isNote ? "#64748b" : add ? "#86efac" : "#fca5a5",
                background: plain ? "transparent" : add ? "rgba(34,197,94,.10)" : "rgba(248,113,113,.14)",
                borderLeft: `2px solid ${plain ? "transparent" : add ? "#22c55e" : "#f87171"}`,
              }}>
                {t || " "}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

const metaDot = (color) => ({
  width: 6, height: 6, borderRadius: "50%", background: color,
  display: "inline-block", flexShrink: 0,
});

function Tab({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={fx.card}
      style={{
        padding: "4px 11px",
        fontSize: 11,
        fontWeight: active ? 700 : 600,
        borderRadius: theme.radius.pill,
        border: `1px solid ${active ? theme.color.borderStrong : "transparent"}`,
        background: active ? theme.color.surface : "transparent",
        color: active ? theme.color.text : theme.color.textMuted,
        boxShadow: active ? elevation.raised : "none",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {children}
      {count != null && (
        <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.6 }}>{count}</span>
      )}
    </button>
  );
}

export default function FindingCard({
  f,
  group = null,
  categories = [],
  stackId = "playwright",
  onOpenPractices,
  onAiFix = null,
}) {
  // Criticals open, everything else collapsed. A real suite produces over a
  // thousand findings; a page where every card is expanded cannot be skimmed,
  // and you scroll past the three that matter looking for them.
  const [open, setOpen] = useState(f.severity === "critical");
  const [tab, setTab] = useState("fix");
  const [occIdx, setOccIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [aiFix, setAiFix] = useState(null);
  const [aiFixLoading, setAiFixLoading] = useState(false);
  const [aiFixError, setAiFixError] = useState(null);
  const [aiFixCopied, setAiFixCopied] = useState(false);

  const occurrences = group?.occurrences?.length ? group.occurrences : [f];
  const count = occurrences.length;
  // Which occurrence's code the Fix tab shows. Everything else about the
  // group is identical by construction, so only the snippet switches.
  const active = occurrences[Math.min(occIdx, count - 1)] ?? f;

  const sev = SEV[active.severity] || SEV.info;
  const cat = categories.find((c) => c.id === active.category) || {
    icon: "📋", label: active.category,
    color: theme.color.textMuted, bg: theme.color.surfaceSubtle,
  };

  const display = useMemo(() => buildFindingDisplayState(active, stackId), [active, stackId]);
  const {
    whyHelp, actualCode, solutionCode, fixIsContextual,
    actualCodeLabel, simpleTerms, section3LeftHint,
  } = display;

  const suggestion = useMemo(
    () => fixOnly(solutionCode, Boolean(actualCode || active.evidence)),
    [solutionCode, actualCode, active.evidence],
  );
  const title = group?.title || active.title;

  // What was wrong, in the user's own code.
  //
  // The live app recovers this from the loaded file. A report has no source,
  // so the CLI attached a small window at scan time — without one of the two
  // the Fix tab shows a recommendation with nothing to compare it against,
  // which reads as "here is a fix" with no stated problem.
  const evidence = active.evidence ?? null;
  const beforeCode = actualCode || evidence?.text || null;
  const beforeStart = actualCode
    ? (fixIsContextual ? active.line ?? null : null)
    : evidence?.startLine ?? null;

  // Does the snippet above sit at one place in the file, or is it a sample
  // gathered from across it? Only the first can be numbered from active.line.
  const isSample = Boolean(actualCode) && !fixIsContextual;

  // Always say where. The file name is already the section heading when you
  // are looking at every file at once, but it is not when you have drilled
  // into one, and the line is the part people actually copy out.
  const shortFile = String(active.fileName ?? active.sourcePath ?? "").split("/").pop();
  const atLine = beforeStart != null ? active.line ?? evidence?.line : active.line;
  const whereLabel = shortFile
    ? isSample ? `${shortFile} — sample from this file`
      : atLine != null ? `${shortFile}:${atLine}`
      : `${shortFile} — whole file`
    : atLine != null ? `Line ${atLine}` : null;

  const ruleTip = [active.whyUse, whyHelp, active.impact]
    .filter(Boolean).map((t) => String(t).trim()).join(" — ") || null;

  const practice = active.ruleId ? getPracticeByRuleId(stackId, active.ruleId) : null;
  const practiceDetails = practice ? getPracticeDetails(practice.id) : null;

  const lead = simpleTerms || whyHelp.whyUse;
  const hasFix = Boolean(beforeCode || suggestion);
  const hasWhy = Boolean(lead || whyHelp.impact);
  const hasDeep = Boolean(practiceDetails || active.reference);
  const hasDetails = hasFix || hasWhy || hasDeep;

  const copyFix = useCallback(async (e) => {
    e.stopPropagation();
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestion);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }, [suggestion]);

  const handleAiFix = useCallback(async (e) => {
    e.stopPropagation();
    if (!onAiFix || aiFixLoading) return;
    setOpen(true); setTab("fix");
    setAiFixLoading(true); setAiFixError(null); setAiFix(null);
    try { setAiFix(await onAiFix(active)); }
    catch (err) { setAiFixError(err.message || "AI fix failed"); }
    finally { setAiFixLoading(false); }
  }, [onAiFix, active, aiFixLoading]);

  const copyAiFix = useCallback(async (e) => {
    e.stopPropagation();
    if (!aiFix) return;
    const codeMatch = aiFix.match(/```[\w]*\n?([\s\S]*?)```/);
    try {
      await navigator.clipboard.writeText(codeMatch ? codeMatch[1].trim() : aiFix);
      setAiFixCopied(true);
      setTimeout(() => setAiFixCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }, [aiFix]);

  // Opening a card should land on something useful: the fix if there is one,
  // otherwise the explanation, rather than an empty default tab.
  const openCard = () => {
    if (!hasDetails) return;
    if (!open) setTab(hasFix ? "fix" : hasWhy ? "why" : "deep");
    setOpen((o) => !o);
  };

  return (
    <div
      className={`${fx.card} ${fx.lift}`}
      style={{
        display: "flex",
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        marginBottom: 9,
        overflow: "hidden",
        background: theme.color.surface,
        boxShadow: open ? elevation.floating : elevation.raised,
      }}
    >
      {/* severity accent bar */}
      <div style={{ width: 4, background: sev.color, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* header — click to expand */}
        <button
          type="button"
          onClick={openCard}
          aria-expanded={open}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "10px 13px", background: "transparent", border: "none",
            textAlign: "left", cursor: hasDetails ? "pointer" : "default",
          }}
        >
          <span
            title={whyHelp.impact ? `Risk if ignored: ${whyHelp.impact}` : undefined}
            style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em",
              padding: "3px 8px", borderRadius: theme.radius.pill,
              background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`,
              whiteSpace: "nowrap", flexShrink: 0,
              cursor: whyHelp.impact ? "help" : "inherit",
            }}
          >
            {sev.label.toUpperCase()}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: 13.5, color: theme.color.text }}>{title}</span>

              {count > 1 && (
                // The number *is* the severity signal for a repeated rule —
                // one hard wait is a slip, twelve is a habit.
                <span
                  title={`${count} occurrences in this file`}
                  style={{
                    fontSize: 10, fontWeight: 800, padding: "1px 7px",
                    borderRadius: theme.radius.pill, background: sev.color,
                    color: "#fff", boxShadow: elevation.flat,
                  }}
                >
                  ×{count}
                </span>
              )}

              {active.analysisSource && (
                <span style={{
                  fontSize: 9.5, padding: "1px 6px", borderRadius: theme.radius.pill,
                  background: active.analysisSource === "ai" ? theme.color.aiBg : theme.color.rulesBg,
                  color: active.analysisSource === "ai" ? theme.color.ai : theme.color.rules,
                  fontWeight: 700,
                }}>
                  {active.analysisSource === "local" ? "Rules" : providerShortLabel(active.analysisSource)}
                </span>
              )}
            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 3,
              fontSize: 11, color: theme.color.textMuted, flexWrap: "wrap",
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={metaDot(cat.color)} />
                {cat.label}
              </span>
              {count === 1 && active.line != null && <span>· Line {active.line}</span>}
              {active.ruleId && (
                // Why it matters and how the fix helps are valuable the first
                // time you meet a rule and noise the twentieth — available on
                // hover rather than occupying the row.
                <span
                  style={{ fontFamily: theme.fontMono, cursor: ruleTip ? "help" : "inherit" }}
                  title={ruleTip || undefined}
                >
                  · {active.ruleId}{ruleTip ? " ⓘ" : ""}
                </span>
              )}
            </div>
          </div>

          {onAiFix && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleAiFix}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleAiFix(e); }}
              title="Generate an AI fix for this finding"
              className={`${fx.card} ${aiFixLoading ? fx.ring : fx.lift} ${fx.press}`}
              style={{
                fontSize: 10.5, fontWeight: 700, padding: "4px 10px",
                borderRadius: theme.radius.pill, border: "1px solid #c4b5fd",
                background: aiFixLoading ? "#ede9fe" : "linear-gradient(180deg,#f5f3ff,#ede9fe)",
                color: "#7c3aed", cursor: aiFixLoading ? "progress" : "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
                display: "inline-flex", alignItems: "center", gap: 5,
                boxShadow: elevation.flat,
              }}
            >
              <span className={aiFixLoading ? fx.spin : fx.blink} style={{ display: "inline-block" }}>
                {aiFixLoading ? "◴" : "✨"}
              </span>
              {aiFixLoading ? "Thinking…" : "AI Fix"}
            </span>
          )}

          {hasDetails && (
            <span style={{
              fontSize: 11, color: theme.color.textMuted,
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 0.18s cubic-bezier(.16,.84,.44,1)", flexShrink: 0,
            }} aria-hidden>▶</span>
          )}
        </button>

        {/* one-line problem statement */}
        <p
          title={display.problemText}
          style={{
            margin: 0, padding: "0 13px 11px 13px", fontSize: 12.5,
            color: theme.color.textSecondary, lineHeight: 1.5,
            ...(open ? {} : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
          }}
        >
          {display.problemText}
        </p>

        {/* line chips — the map of where this rule fires in the file */}
        {count > 1 && (
          <div style={{
            display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center",
            padding: "0 13px 11px",
          }}>
            <span style={{ fontSize: 10, color: theme.color.textMuted, marginRight: 2 }}>Lines</span>
            {occurrences.map((o, i) => (
              <button
                key={`${o.line}-${i}`}
                type="button"
                onClick={() => { setOccIdx(i); setOpen(true); setTab("fix"); }}
                title={`Show the code at line ${o.line ?? "?"}`}
                className={`${fx.card} ${fx.press}`}
                style={{
                  fontSize: 10.5, fontFamily: theme.fontMono, fontWeight: 600,
                  padding: "2px 7px", borderRadius: theme.radius.sm,
                  border: `1px solid ${i === occIdx && open ? sev.color : theme.color.border}`,
                  background: i === occIdx && open ? sev.bg : theme.color.surfaceSubtle,
                  color: i === occIdx && open ? sev.color : theme.color.textSecondary,
                  cursor: "pointer",
                }}
              >
                {o.line ?? "–"}
              </button>
            ))}
          </div>
        )}

        {/* details — progressive disclosure, one section at a time */}
        {open && hasDetails && (
          <div className={fx.fadeUp} style={{
            borderTop: `1px solid ${theme.color.border}`,
            background: theme.color.surfaceSubtle,
          }}>
            <div style={{
              display: "flex", gap: 4, padding: "9px 13px 0", flexWrap: "wrap",
            }}>
              {hasFix && <Tab active={tab === "fix"} onClick={() => setTab("fix")}>🛠 Fix</Tab>}
              {hasWhy && <Tab active={tab === "why"} onClick={() => setTab("why")}>💡 Why</Tab>}
              {hasDeep && <Tab active={tab === "deep"} onClick={() => setTab("deep")}>📘 Deep dive</Tab>}
            </div>

            <div style={{ padding: "12px 13px 13px" }}>
              {tab === "fix" && hasFix && (
                <>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 7, gap: 8,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: theme.color.textMuted, textTransform: "uppercase" }}>
                      {beforeCode
                        ? isSample ? actualCodeLabel || "What's there now" : "What's wrong → what to use"
                        : "Recommended pattern"}
                    </span>
                    {suggestion && (
                      <button
                        type="button"
                        onClick={copyFix}
                        className={`${fx.card} ${fx.lift} ${fx.press}`}
                        style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 10px",
                          borderRadius: theme.radius.pill,
                          border: `1px solid ${copied ? theme.color.rulesBorder : theme.color.border}`,
                          background: copied ? theme.color.rulesBg : theme.color.surface,
                          color: copied ? theme.color.rules : theme.color.textSecondary,
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        {copied ? "✓ Copied" : "Copy fix"}
                      </button>
                    )}
                  </div>

                  {section3LeftHint && (
                    <p style={{ margin: "0 0 7px", fontSize: 11, color: theme.color.textMuted, lineHeight: 1.45 }}>
                      {section3LeftHint}
                    </p>
                  )}

                  <DiffBlock
                    before={beforeCode}
                    after={suggestion}
                    startLine={beforeStart}
                    highlightLine={actualCode ? null : evidence?.line ?? null}
                    where={whereLabel}
                  />

                  {!beforeCode && suggestion && !fixIsContextual && (
                    <p style={{ margin: "9px 0 0", fontSize: 11, color: theme.color.textMuted, lineHeight: 1.45 }}>
                      This one is about the file as a whole, so there is no single line to
                      point at — adapt the pattern above to your setup.
                    </p>
                  )}

                  {(aiFix || aiFixError) && (
                    <div className={fx.fadeUp} style={{ marginTop: 13, borderTop: "1px solid #ede9fe", paddingTop: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: theme.color.ai, textTransform: "uppercase" }}>
                          ✨ AI-generated fix
                        </span>
                        {aiFix && (
                          <button
                            type="button"
                            onClick={copyAiFix}
                            className={`${fx.card} ${fx.lift} ${fx.press}`}
                            style={{
                              fontSize: 10, fontWeight: 700, padding: "3px 10px",
                              borderRadius: theme.radius.pill, border: "1px solid #c4b5fd",
                              background: aiFixCopied ? theme.color.aiBg : theme.color.surface,
                              color: theme.color.ai, cursor: "pointer",
                            }}
                          >
                            {aiFixCopied ? "✓ Copied" : "Copy"}
                          </button>
                        )}
                      </div>
                      {aiFixError && <p style={{ margin: 0, fontSize: 12, color: theme.color.danger }}>{aiFixError}</p>}
                      {aiFix && (() => {
                        const explMatch = aiFix.match(/EXPLANATION:\s*(.+?)(?:\n|$)/i);
                        const codeMatch = aiFix.match(/```[\w]*\n?([\s\S]*?)```/);
                        return (
                          <>
                            {explMatch?.[1] && (
                              <p style={{ margin: "0 0 7px", fontSize: 12, color: "#5b21b6", lineHeight: 1.5, fontStyle: "italic" }}>
                                {explMatch[1].trim()}
                              </p>
                            )}
                            <DiffBlock after={(codeMatch?.[1] ?? aiFix).trim()} where={whereLabel} />
                          </>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}

              {tab === "why" && hasWhy && (
                <>
                  {lead && (
                    <p style={{ margin: "0 0 8px", fontSize: 12.5, color: theme.color.textSecondary, lineHeight: 1.55 }}>
                      {lead}
                    </p>
                  )}
                  {whyHelp.impact && whyHelp.impact !== whyHelp.howHelps && (
                    <div style={{
                      display: "flex", gap: 8, padding: "8px 10px",
                      borderRadius: theme.radius.md,
                      background: theme.color.warningBg,
                      border: `1px solid ${theme.color.warningBorder}`,
                    }}>
                      <span aria-hidden>⚠️</span>
                      <p style={{ margin: 0, fontSize: 11.5, color: "#92400e", lineHeight: 1.5 }}>
                        <strong>If ignored: </strong>{whyHelp.impact}
                      </p>
                    </div>
                  )}
                </>
              )}

              {tab === "deep" && hasDeep && (
                <>
                  {practiceDetails && <PracticeDetail details={practiceDetails} />}
                  {active.reference && (
                    <div style={{ marginTop: practiceDetails ? 11 : 0, fontSize: 11, color: theme.color.textMuted }}>
                      Learn more:{" "}
                      {String(active.reference).startsWith("http") ? (
                        <a href={active.reference} target="_blank" rel="noreferrer" style={{ color: theme.color.primary, fontWeight: 600 }}>
                          {active.reference.replace(/^https?:\/\//, "")} ↗
                        </a>
                      ) : onOpenPractices ? (
                        <button
                          type="button"
                          onClick={onOpenPractices}
                          style={{ border: "none", background: "transparent", color: theme.color.primary, fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 11, textDecoration: "underline", textUnderlineOffset: 2 }}
                        >
                          {active.reference} →
                        </button>
                      ) : active.reference}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
