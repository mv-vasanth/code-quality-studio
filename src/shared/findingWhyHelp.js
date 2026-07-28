import { getRuleCatalogEntry } from "../rules/catalog.js";
import { RULE_WHY_HELP } from "../rules/ruleWhyCatalog.js";

function fallbackWhy(finding, entry) {
  if (entry?.description) {
    return `This rule flags: ${entry.description}`;
  }
  return finding?.description || finding?.title || "Align this code with your stack quality standards.";
}

function fallbackHow(finding, entry) {
  if (entry?.impact) return entry.impact;
  if (finding?.impact) return finding.impact;
  return "Applying the recommended fix reduces risk and keeps reviews and CI trustworthy.";
}

/** Shared copy for cards, reports, Rules tab, and hover tips. */
export function getWhyHelpForFinding(finding, stackId = "playwright") {
  const ruleId = finding?.ruleId;
  const entry = ruleId ? getRuleCatalogEntry(stackId, ruleId) : null;
  const guide = ruleId ? RULE_WHY_HELP[ruleId] : null;

  const impact = (finding?.impact || entry?.impact || "").trim();
  const whyUse = guide?.whyUse || entry?.whyUse || fallbackWhy(finding, entry);
  const howHelps = guide?.howHelps || entry?.howHelps || fallbackHow(finding, entry);

  const hoverTip = [`Why: ${whyUse}`, `How it helps: ${howHelps}`, impact ? `Risk: ${impact}` : ""]
    .filter(Boolean)
    .join(" ");

  return { impact, whyUse, howHelps, hoverTip };
}

export { RULE_WHY_HELP };
