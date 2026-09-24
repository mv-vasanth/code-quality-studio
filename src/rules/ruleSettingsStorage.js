const KEY = (stackId) => `cqs-rule-settings-${stackId}`;

function defaultSettings() {
  return { disabled: {}, notes: {} };
}

export function loadRuleSettings(stackId) {
  try {
    const raw = localStorage.getItem(KEY(stackId));
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    return {
      disabled: parsed.disabled && typeof parsed.disabled === "object" ? parsed.disabled : {},
      notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
    };
  } catch {
    return defaultSettings();
  }
}

export function saveRuleSettings(stackId, settings) {
  const payload = {
    disabled: settings.disabled ?? {},
    notes: settings.notes ?? {},
  };
  localStorage.setItem(KEY(stackId), JSON.stringify(payload));
}

export function isRuleEnabled(stackId, ruleId, settings = null) {
  const s = settings ?? loadRuleSettings(stackId);
  return s.disabled[ruleId] !== true;
}

/** Set of rule IDs skipped during local analysis. */
export function getDisabledRuleIdsForAnalysis(stackId) {
  const s = loadRuleSettings(stackId);
  return new Set(Object.keys(s.disabled).filter((id) => s.disabled[id] === true));
}

export function exportRuleSettingsJson(stackId, catalog) {
  const s = loadRuleSettings(stackId);
  return {
    stackId,
    exportedAt: new Date().toISOString(),
    source: "code-quality-studio-rules-tab",
    rules: catalog.map((r) => ({
      ruleId: r.ruleId,
      enabled: isRuleEnabled(stackId, r.ruleId, s),
      note: s.notes[r.ruleId] ?? "",
      title: r.title,
      severity: r.severity,
      category: r.category,
    })),
  };
}
