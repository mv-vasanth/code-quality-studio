import { parseBeforeAfterFix } from "./findingActualCode.js";

function cleanActualLine(line) {
  return String(line)
    .replace(/^\s*>\s*\d+\|\s*/, "")
    .replace(/^\d+\|\s*/, "")
    .trimEnd();
}

function varNameFromLine(line) {
  const m = line.match(/^\s*const\s+(\w+)/);
  return m?.[1] || "target";
}

function suggestForLocatorLine(line) {
  const t = cleanActualLine(line);
  if (!t || !/locator\s*\(|page\.\$\$|xpath/i.test(t)) return null;

  const name = varNameFromLine(t);
  const closeish = /close|btn-close|banner-close|dismiss/i.test(t);
  const modalish = /modal|ngb-modal|dialog/i.test(t);
  const bannerish = /banner/i.test(t);

  if (modalish && closeish) {
    return `// Your line:\n// ${t}\nconst ${name} = page.getByRole("dialog").getByRole("button", { name: /close/i });\nawait ${name}.click();`;
  }
  if (modalish) {
    return `// Your line:\n// ${t}\nconst ${name} = page.getByRole("dialog");\nawait expect(${name}).toBeVisible();`;
  }
  if (bannerish || (closeish && !modalish)) {
    return `// Your line:\n// ${t}\nawait page.getByRole("button", { name: /close|dismiss/i }).click();`;
  }

  const sel = t.match(/locator\s*\(\s*['"`]([^'"`]+)['"`]/)?.[1];
  if (sel?.startsWith("#")) {
    return `// Your line:\n// ${t}\nconst ${name} = page.getByTestId("…"); // replace id ${sel.slice(1)} with data-testid in app`;
  }
  if (sel) {
    return `// Your line:\n// ${t}\nconst ${name} = page.getByRole("button", { name: "…" }); // map selector: ${sel}`;
  }
  return `// Your line:\n// ${t}\n// Use getByRole / getByLabel / getByTestId instead of CSS/XPath chains`;
}


function extractTestNamesFromLines(lines) {
  const names = [];
  const seen = new Set();
  for (const raw of lines) {
    const t = cleanActualLine(raw);
    const m = t.match(/\btest\s*\(\s*['"\`]([^'"\`]+)['"\`]/);
    if (!m) continue;
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function suggestDescribeGroupName(testNames) {
  if (!testNames.length) return "Your feature";
  if (testNames.length === 1) return testNames[0];
  let prefix = testNames[0];
  for (const n of testNames.slice(1)) {
    while (prefix && !n.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  prefix = prefix.replace(/[\d_-]+$/, "").trim() || prefix;
  if (prefix.length >= 2) return prefix;
  const first = testNames[0];
  const alpha = first.match(/^([A-Za-z]+)/)?.[1];
  return alpha && alpha.length >= 2 ? alpha : "Your feature";
}

/** Right column: wrap *your* test names — not a generic Checkout example. */

function contextualMobileConfigFix(lines, sourceFile) {
  const names = extractTestNamesFromLines(lines);
  const specHint = names.length
    ? `// Spec tests detected: ${names.slice(0, 4).join(", ")}${names.length > 4 ? ", …" : ""}\n`
    : "";
  const fileHint = sourceFile ? `// File: ${sourceFile}\n` : "";
  return (
    `${fileHint}${specHint}` +
    `Fix in playwright.config — not inside each test on the left.\n\n` +
    `import { defineConfig, devices } from '@playwright/test';\n\n` +
    `export default defineConfig({\n` +
    `  projects: [\n` +
    `    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },\n` +
    `    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },\n` +
    `  ],\n` +
    `});\n\n` +
    `// Then run mobile for this spec:\n` +
    `// npx playwright test --project=mobile-chrome <your-spec-file>`
  );
}

function contextualDescribeGroupingFix(lines) {
  const names = extractTestNamesFromLines(lines);
  if (!names.length) return null;
  const group = suggestDescribeGroupName(names);
  const stubs = names.map((n) => `  test('${n}', async ({ page }) => { /* move existing body here */ });`).join("\n");
  return (
    `Use the test names from the left column — do not copy a unrelated example like "Checkout".\n\n` +
    `test.describe('${group}', () => {\n` +
    `  test.beforeEach(async ({ page }) => {\n` +
    `    // optional: login, base URL, or other setup once for this group\n` +
    `  });\n\n` +
    `${stubs}\n` +
    `});`
  );
}

function contextualNoExpectFix(lines) {
  const testLines = lines.filter((l) => /\btest\s*\(/.test(l) && !l.trimStart().startsWith("//"));
  if (!testLines.length) return null;
  const first = cleanActualLine(testLines[0]);
  const nameMatch = first.match(/test\s*\(\s*['"`]([^'"`]+)/);
  const testName = nameMatch?.[1] || "your test";
  return (
    `test('${testName}', async ({ page }) => {\n` +
    `  // ...your existing steps...\n\n` +
    `  // ✅ add at least one expect() so the test actually verifies something:\n` +
    `  await expect(page).toHaveURL(/insights/);              // right page loaded\n` +
    `  await expect(page.getByRole('heading')).toBeVisible(); // key content rendered\n` +
    `});`
  );
}

const NO_DUPLICATE_BEFORE_RULES = new Set(["PW-AST-002", "PW-MOB-001", "PW-STR-001", "PW-A11Y-001"]);

function pairActualWithGenericFix(beforeLines, genericFixText) {
  const before = beforeLines.map(cleanActualLine).filter(Boolean).join("\n");
  if (!before || !genericFixText?.trim()) return null;
  const { solution } = parseBeforeAfterFix(genericFixText);
  const after = solution?.trim() || genericFixText.trim();
  if (!after) return null;
  return `// Before (your file)\n${before}\n\n// After (recommended)\n${after}`;
}


function contextualWaitForTimeoutFixes(lines) {
  const blocks = [];
  for (const raw of lines) {
    const t = cleanActualLine(raw);
    if (!t || !/waitForTimeout/.test(t)) continue;
    const ms = t.match(/waitForTimeout\s*\(\s*(\d+)/)?.[1] || "?";
    blocks.push(
      `// Before (line in your file)\n${t}\n\n// After — wait for UI state, not ${ms}ms\nawait expect(page.getByRole("status")).toBeVisible(); // or element after your action`,
    );
  }
  return blocks.length ? blocks.join("\n\n") : null;
}

const RULES_WITH_LOCATOR_CONTEXT = new Set(["PW-SEL-001", "PW-SEL-002", "PW-SEL-003"]);

/**
 * When we show real lines on the left, build a right-hand fix from those lines
 * instead of an unrelated generic snippet (e.g. "Sign in" for modal locators).
 */
export function getContextualSolution(finding, actualCode, genericFixText) {
  if (!actualCode?.trim() || !finding) return null;

  const ruleId = finding.ruleId || "";
  const { actualFromFix } = parseBeforeAfterFix(genericFixText || "");

  if (actualFromFix && !actualCode.includes(actualFromFix.split("\n")[0]?.trim())) {
    /* generic before/after is fine */
  }

  const lines = actualCode.split(/\n/).map(cleanActualLine).filter((l) => l.length > 0);
  const hasLocators = lines.some((l) => /page\.locator|\.locator\s*\(|xpath/i.test(l));

  if (RULES_WITH_LOCATOR_CONTEXT.has(ruleId) || (ruleId.startsWith("PW-SEL") && hasLocators)) {
    const blocks = [];
    const seen = new Set();
    for (const line of lines) {
      const key = line.trim();
      if (seen.has(key)) continue;
      if (!/locator\s*\(|page\.\$\$|xpath/i.test(line)) continue;
      seen.add(key);
      const block = suggestForLocatorLine(line);
      if (block) blocks.push(block);
    }
    if (blocks.length) {
      return `${blocks.join("\n\n")}\n\n// Adjust role names, regex, and test ids to match your UI.`;
    }
  }

  if (ruleId === "PW-REL-001") {
    const multi = contextualWaitForTimeoutFixes(lines);
    if (multi) return multi;
  }

  if (ruleId === "PW-AST-001") {
    const bad = lines.find((l) => /expect\s*\(\s*await/.test(l));
    if (bad) {
      const inner = bad.match(/expect\s*\(\s*await\s+([^)]+)\)/);
      const target = inner?.[1]?.trim() || "page.getByText('…')";
      return `// Before\n${bad}\n\n// After\nawait expect(${target}).toBeVisible();`;
    }
  }

  if (ruleId === "PW-AST-002") {
    const noExpect = contextualNoExpectFix(lines);
    if (noExpect) return noExpect;
  }

  if (ruleId === "PW-STR-001") {
    const grouped = contextualDescribeGroupingFix(lines);
    if (grouped) return grouped;
  }

  if (ruleId === "PW-MOB-001") {
    const mobile = contextualMobileConfigFix(lines, finding.sourcePath || finding.sourceFile || finding.fileName);
    if (mobile) return mobile;
  }

  if (ruleId === "PW-A11Y-001") {
    const { solution } = parseBeforeAfterFix(genericFixText || "");
    const body = (solution || genericFixText || "").trim();
    if (body) {
      return "Add keyboard/role checks where relevant:\n\n" + body;
    }
  }

  if (!NO_DUPLICATE_BEFORE_RULES.has(ruleId)) {
    const paired = pairActualWithGenericFix(lines, genericFixText);
    if (paired) return paired;
  }

  return null;
}

export function shouldPreferContextualOverGeneric(finding, actualCode, genericFixText) {
  if (!actualCode || !genericFixText) return false;
  if (!/Sign in/i.test(genericFixText)) return false;
  return RULES_WITH_LOCATOR_CONTEXT.has(finding?.ruleId) && /locator\s*\(/.test(actualCode);
}
