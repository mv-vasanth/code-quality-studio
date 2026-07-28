import { getFindingFixText } from "./findingFix.js";
import {
  enrichFindingWithFileContext,
  getActualCodeForFinding,
  parseBeforeAfterFix,
  resolveFileForFinding,
} from "./findingActualCode.js";
import { getContextualSolution } from "./findingContextualFix.js";
import { getWhyHelpForFinding } from "./findingWhyHelp.js";
import { RULE_WHY_HELP } from "../rules/ruleWhyCatalog.js";
import { categoryLabel } from "../report/reportUtils.js";

/** Rules that show file-wide snippets instead of a single line. */
export const CONFIG_LEVEL_RULE_IDS = new Set(["PW-MOB-001"]);

export function isConfigLevelRule(ruleId) {
  return CONFIG_LEVEL_RULE_IDS.has(ruleId);
}

export const FILE_LEVEL_RULE_IDS = new Set([
  "PW-AST-002",
  "PW-STR-001",
  "PW-MOB-001",
  "PW-A11Y-001",
  "JV-TST-001",
  "JV-API-001",
  "JV-MNT-001",
  "JV-PER-001",
  "TS-VAL-001",
]);

const ACTUAL_CODE_LABELS = {
  "PW-AST-002": "Tests in this file (no expect yet)",
  "PW-STR-001": "Tests in this file (not grouped)",
  "PW-MOB-001": "Tests in this file (no mobile/viewport setup)",
  "PW-A11Y-001": "Tests in this file (no a11y patterns)",
  "JV-TST-001": "Production types in this file (no @Test)",
  "JV-API-001": "Controllers / mappings in this file",
  "JV-MNT-001": "Large types in this file",
  "JV-PER-001": "Loops / data access in this file",
  "TS-VAL-001": "Request handling in this file (validate input)",
};

export function getActualCodeColumnLabel(ruleId) {
  if (ruleId && ACTUAL_CODE_LABELS[ruleId]) return ACTUAL_CODE_LABELS[ruleId];
  if (ruleId && FILE_LEVEL_RULE_IDS.has(ruleId)) return "Snippet from your file";
  return "Your code (now)";
}

export function getSimpleTermsForFinding(finding) {
  const ruleId = finding?.ruleId;
  return RULE_WHY_HELP[ruleId]?.simpleTerms?.trim() || null;
}

export const SECTION3_TIE_IN =
  "Applying the recommended fix below addresses the risks described in Why change this above.";

const SECTION3_GUIDANCE_BY_RULE = {
  "PW-MOB-001":
    "The left column is only evidence (this spec has no mobile/viewport keywords). Apply the right column in playwright.config.ts — you do not repeat setup in every test() below.",
  "PW-STR-001":
    "Move the tests on the left into the describe block on the right and keep your existing test bodies.",
  "PW-AST-002": "Add expect() inside each test listed on the left after your current steps.",
  "PW-A11Y-001":
    "Left: tests without keyboard/role patterns. Right: add checks in your real flows — adapt names to your UI.",
};

export function getSection3Guidance(ruleId, fixIsContextual) {
  if (ruleId && SECTION3_GUIDANCE_BY_RULE[ruleId]) return SECTION3_GUIDANCE_BY_RULE[ruleId];
  return fixIsContextual
    ? "Recommended changes for the lines on the left — adapt role names and labels to your app."
    : "Compare what is in your file with the pattern to apply. Copy the recommended side and adapt names or selectors.";
}

export function getSection3LeftHint(ruleId) {
  if (isConfigLevelRule(ruleId)) {
    return "Evidence from this spec — no mobile change required inside these lines.";
  }
  return null;
}

/**
 * Single source for Problem / Why / fix columns — used by FindingCard and reports.
 */
export function buildFindingDisplayState(finding, stackId = "playwright", fileContent = null) {
  const withCode =
    fileContent != null && finding
      ? enrichFindingWithFileContext(finding, { content: fileContent })
      : finding;

  const fixRaw = getFindingFixText(withCode, stackId);
  const { actualFromFix, solution } = parseBeforeAfterFix(fixRaw);
  const actualCode = withCode?.actualCode || actualFromFix || null;
  const contextualSolution = getContextualSolution(withCode, actualCode, fixRaw);
  const solutionCode = contextualSolution || solution || fixRaw || null;
  const fixIsContextual = Boolean(contextualSolution);
  const whyHelp = getWhyHelpForFinding(withCode, stackId);

  return {
    whyHelp,
    fixRaw,
    actualCode,
    solutionCode,
    fixIsContextual,
    actualCodeLabel: getActualCodeColumnLabel(withCode?.ruleId),
    simpleTerms: getSimpleTermsForFinding(withCode),
    section3TieIn: SECTION3_TIE_IN,
    section3Guidance: getSection3Guidance(withCode?.ruleId, fixIsContextual),
    section3LeftHint: getSection3LeftHint(withCode?.ruleId),
    problemText: withCode?.description || withCode?.title || "",
  };
}

/** Enrich a finding row for export (HTML / MD / JSON) with the same display fields as the UI. */
export function enrichFindingForReport(finding, stackId, files, categories) {
  const file = resolveFileForFinding(files, {
    ...finding,
    sourcePath: finding.sourcePath || finding.sourceFile,
  });
  const display = buildFindingDisplayState(finding, stackId, file?.content ?? null);
  const why = display.whyHelp;

  return {
    ...finding,
    categoryLabel: categoryLabel(categories, finding.category),
    whyUse: why.whyUse,
    howHelps: why.howHelps,
    impact: finding.impact || why.impact,
    hoverTip: why.hoverTip,
    actualCode: display.actualCode,
    solutionCode: display.solutionCode,
    fix: display.solutionCode,
    fixIsContextual: display.fixIsContextual,
    actualCodeLabel: display.actualCodeLabel,
    simpleTerms: display.simpleTerms,
    section3TieIn: display.section3TieIn,
    section3Guidance: display.section3Guidance,
    section3LeftHint: display.section3LeftHint,
  };
}

/** Resolve actual code when only file list + finding are available (e.g. UI list). */
export function attachActualCodeFromFiles(finding, files) {
  const file = resolveFileForFinding(files, finding);
  if (!file?.content) return finding;
  const actualCode = getActualCodeForFinding(file.content, finding);
  return actualCode ? { ...finding, actualCode } : finding;
}
