/**
 * Identify a file's stack from what it imports, not what it is called.
 *
 * Filenames lie. Playwright's pattern is `*.spec.ts`, but a Playwright suite
 * keeps its locators and waits in page objects named `AssessmentPage.ts` —
 * so matching on the name alone audits that layer as plain TypeScript and
 * reports it clean. One real suite scored 99 with 839 hard waits in it.
 *
 * Shared by the CLI (which routes each file to the right analyzer) and the
 * web app (which cannot silently mix stacks in one view, because the category
 * rows come from the selected stack — so it warns instead).
 */

const JS_FAMILY = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

/** Framework imports that identify a stack regardless of filename. */
const CONTENT_MARKERS = [
  ["playwright",        JS_FAMILY,      /from\s*["']@playwright\/test["']|require\(\s*["']@playwright\/test["']/],
  ["cypress",           JS_FAMILY,      /from\s*["']cypress["']|\bcy\.[a-z]/],
  ["playwright_java",   /\.java$/i,     /com\.microsoft\.playwright/],
  ["selenium_java",     /\.java$/i,     /org\.openqa\.selenium/],
  ["appium_java",       /\.java$/i,     /io\.appium/],
  ["restassured",       /\.java$/i,     /io\.restassured/],
  ["playwright_python", /\.py$/i,       /playwright\.(sync|async)_api/],
  ["pytest_api",        /\.py$/i,       /\b(import\s+pytest|from\s+pytest)\b/],
];

/**
 * @returns {string|null} stack id the content points to, or null if nothing
 *   in the file identifies a framework.
 */
export function detectStackFromContent(filename, content) {
  if (!content) return null;
  const head = content.slice(0, 4000);
  for (const [stackId, namePattern, marker] of CONTENT_MARKERS) {
    if (namePattern.test(filename) && marker.test(head)) return stackId;
  }
  return null;
}

/**
 * Does the loaded set look like a different stack than the one selected?
 *
 * Only reports when it is worth acting on: a clear majority of files pointing
 * somewhere else. A handful of Playwright specs inside a React app is normal
 * and should not nag.
 *
 * @param files [{ name, content }]
 * @returns {{ stackId: string, matched: number, total: number }|null}
 */
export function suggestStackForFiles(files, selectedStackId, { threshold = 0.6 } = {}) {
  const counts = new Map();
  let considered = 0;

  for (const f of files) {
    const detected = detectStackFromContent(f.name ?? "", f.content ?? "");
    if (!detected) continue;
    considered++;
    counts.set(detected, (counts.get(detected) ?? 0) + 1);
  }
  if (!considered) return null;

  const [stackId, matched] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (stackId === selectedStackId) return null;
  if (matched / files.length < threshold) return null;

  return { stackId, matched, total: files.length };
}
