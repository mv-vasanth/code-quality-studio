import { analysePlaywright } from "./playwright.js";
import { analyseJavaApiLocally } from "./javaApi.js";
import { analyseTypeScriptLocally } from "./typescript.js";
import { analysePlaywrightJavaLocally } from "./playwrightJava.js";
import { getDisabledRuleIdsForAnalysis } from "../rules/ruleSettingsStorage.js";
import { runCustomRules } from "../rules/customRulesStorage.js";
import { scoreFromFindings } from "./analyzerUtils.js";
import { AUDIT_STACKS } from "../stacks/definitions.js";

const RUNNERS = {
  playwright: analysePlaywright,
  java_api: analyseJavaApiLocally,
  typescript: analyseTypeScriptLocally,
  playwright_java: analysePlaywrightJavaLocally,
};

/** Merge user-defined custom-rule findings into a result and recompute scores. */
function applyCustomRules(result, stackId, content, disabledRuleIds) {
  const customFindings = runCustomRules(stackId, content, { disabledRuleIds });
  if (!customFindings.length) return result;

  const findings = [...(result.findings || []), ...customFindings];
  const categoryIds = (AUDIT_STACKS[stackId] ?? AUDIT_STACKS.playwright).categories.map((c) => c.id);
  const categoryScores = Object.fromEntries(
    categoryIds.map((id) => [id, scoreFromFindings(findings, id)]),
  );
  const overallScore = Math.round(
    categoryIds.reduce((sum, id) => sum + categoryScores[id], 0) / categoryIds.length,
  );
  return { ...result, findings, categoryScores, overallScore };
}

export function runLocalAnalysis(stackId, filename, content, options = {}) {
  const fn = RUNNERS[stackId] ?? RUNNERS.playwright;
  const disabledRuleIds = options.disabledRuleIds ?? getDisabledRuleIdsForAnalysis(stackId);
  const result = fn(filename, content, { ...options, disabledRuleIds });
  return applyCustomRules(result, stackId, content, disabledRuleIds);
}
