export function scoreFromFindings(findings, category, categoryIds) {
  const cat = findings.filter((f) => f.category === category);
  let s = 100;
  for (const f of cat) {
    if (f.severity === "critical") s -= 18;
    else if (f.severity === "warning") s -= 10;
    else s -= 4;
  }
  return Math.max(0, Math.min(100, s));
}

export function buildAuditResult({
  filename,
  categoryIds,
  findings,
  metrics,
  summary,
  topPriority,
  positives,
  roadmap,
}) {
  const categoryScores = Object.fromEntries(
    categoryIds.map((id) => [id, scoreFromFindings(findings, id)]),
  );
  const overallScore = Math.round(
    categoryIds.reduce((sum, id) => sum + categoryScores[id], 0) / categoryIds.length,
  );
  return {
    overallScore,
    categoryScores,
    summary,
    topPriority: topPriority ?? findings.find((f) => f.severity === "critical")?.title ?? "Review warnings and align with stack best practices.",
    findings,
    positives: positives?.length ? positives : [{ title: "File analysed", description: "See findings for actionable improvements." }],
    metrics,
    roadmap: roadmap ?? [
      { phase: "Immediate (Day 1)", color: "#dc2626", actions: findings.filter((f) => f.severity === "critical").map((f) => f.title).slice(0, 3) },
      { phase: "Short-term (Week 1)", color: "#d97706", actions: ["Address warning-level issues", "Add tests for critical paths"] },
      { phase: "Long-term (Month 1)", color: "#16a34a", actions: ["Refactor for maintainability", "Document API contracts"] },
    ],
    _analysisMode: "local",
  };
}

export function lineMatches(content, re) {
  const lines = content.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) hits.push(i + 1);
    re.lastIndex = 0;
  }
  return hits;
}

export function countMatches(content, re) {
  const m = content.match(re);
  return m ? m.length : 0;
}

export function pushFinding(findings, partial, disabledRuleIds) {
  if (disabledRuleIds?.has(partial.ruleId)) return;
  findings.push({
    ruleId: partial.ruleId,
    category: partial.category,
    severity: partial.severity,
    title: partial.title,
    description: partial.description,
    impact: partial.impact,
    fix: partial.fix,
    line: partial.line ?? null,
    reference: partial.reference ?? "Team standards",
  });
}
