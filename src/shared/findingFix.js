import { getGuideForStack } from "../guides/index.js";

function formatPracticeSnippet(bp) {
  if (!bp) return "";
  const parts = [];
  if (bp.avoid) parts.push(`// Avoid\n${bp.avoid}`);
  if (bp.prefer) parts.push(`// Prefer\n${bp.prefer}`);
  return parts.join("\n\n");
}

const ruleMaps = new Map();

function ruleMapForStack(stackId) {
  const key = stackId || "playwright";
  if (!ruleMaps.has(key)) {
    const guide = getGuideForStack(key);
    const map = new Map();
    for (const bp of guide.practices) {
      for (const id of bp.ruleIds || []) {
        if (!map.has(id)) map.set(id, bp);
      }
    }
    ruleMaps.set(key, map);
  }
  return ruleMaps.get(key);
}

export function getFindingFixText(finding, stackId = "playwright") {
  const direct = finding?.fix || finding?.solution || finding?.remediation;
  if (direct && String(direct).trim()) return String(direct).trim();
  const bp = finding?.ruleId ? ruleMapForStack(stackId).get(finding.ruleId) : null;
  if (bp) return formatPracticeSnippet(bp);
  return "";
}
