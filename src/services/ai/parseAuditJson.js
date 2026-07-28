function normalizeFinding(f) {
  if (!f || typeof f !== "object") return f;
  const fix = f.fix || f.solution || f.remediation;
  return fix && !f.fix ? { ...f, fix: String(fix) } : f;
}

function normalizeAuditPayload(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data.findings)) {
    return { ...data, findings: data.findings.map(normalizeFinding) };
  }
  return data;
}

export function parseAuditJsonFromModel(text) {
  const clean = String(text || "")
    .replace(/```json|```/g, "")
    .trim();
  try {
    return normalizeAuditPayload(JSON.parse(clean));
  } catch (e) {
    throw new Error(
      `Model response was not valid audit JSON (${e.message}). Try re-run or another model.`,
    );
  }
}
