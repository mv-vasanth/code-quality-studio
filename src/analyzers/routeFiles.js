/**
 * Which stack owns each file — the single implementation.
 *
 * This logic previously lived only in the CLI, so the MCP server and both
 * agents kept the old filename-based detection and quietly disagreed with it:
 * the MCP server failed outright on a polyglot repo ("no .ts files found")
 * while the CLI reported six stacks, and `remediate` would judge page objects
 * by React rules — an agent that edits files, using the wrong rule set.
 *
 * Three entry points over one engine is exactly the shape where improvements
 * land in one place and rot in the others, so the routing lives here and
 * nobody reimplements it.
 */
import { basename } from "path";
import { AUDIT_STACKS } from "../stacks/definitions.js";
import { detectStackFromContent } from "./detectStackFromContent.js";

/** Most specific first: `*.spec.ts` is a Playwright spec before it is TypeScript. */
export const STACK_PRIORITY = [
  "playwright", "cypress", "playwright_java", "playwright_python",
  "selenium_java", "selenium_csharp", "appium_java", "restassured",
  "karate", "pytest_api", "postman", "tosca_xml",
  "ts_frontend", "typescript", "java_api", "java_frontend",
  "python_api", "python_frontend",
];

/**
 * Stacks claiming a broad extension (.java, .py) that several stacks share.
 * They only win if the file actually imports their framework — otherwise a
 * plain service class gets judged as a Selenium test.
 */
const STACK_MARKERS = {
  playwright_java:   /com\.microsoft\.playwright/,
  selenium_java:     /org\.openqa\.selenium/,
  appium_java:       /io\.appium/,
  restassured:       /io\.restassured/,
  playwright_python: /playwright\.(sync|async)_api/,
  pytest_api:        /\b(import\s+pytest|from\s+pytest)\b/,
  cypress:           /\bcy\.[a-z]|from\s+["\x27]cypress["\x27]/,
};

/**
 * @param file      absolute or relative path
 * @param readHead  (file) => string — first few KB of the file. Injected so
 *                  this module works in the browser as well as in Node.
 * @returns stack id, or null if nothing claims the file
 */
export function classifyFile(file, readHead) {
  const name = basename(file);

  // A baseline records findings; it is not source. Left in, it is picked up
  // as a Postman collection and reports findings about itself.
  if (/(^|[.-])cqs-baseline\.json$/i.test(name)) return null;

  // What a file imports beats what it is called.
  const head = readHead ? readHead(file) : "";
  const byContent = detectStackFromContent(name, head);
  if (byContent && AUDIT_STACKS[byContent]) return byContent;

  const candidates = STACK_PRIORITY.filter((id) => AUDIT_STACKS[id]?.filePattern?.test(name));
  if (candidates.length <= 1) return candidates[0] ?? null;

  const viable = candidates.filter((id) => !STACK_MARKERS[id] || STACK_MARKERS[id].test(head));
  return viable[0] ?? candidates[candidates.length - 1];
}

/** Group an explicit list of files by the stack that owns each. */
export function routeFileList(files, readHead) {
  const byStack = new Map();
  for (const f of files) {
    const owner = classifyFile(f, readHead);
    if (!owner) continue;
    if (!byStack.has(owner)) byStack.set(owner, []);
    byStack.get(owner).push(f);
  }
  return byStack;
}

/**
 * Walk the given paths and group everything found.
 *
 * `collectFiles` is injected because the CLI and the MCP server each have
 * their own walker with their own ignore rules; this module should not grow
 * a third.
 */
export function routeFilesByStack(inputPaths, { collectFiles, readHead }) {
  const seen = new Set();
  const byStack = new Map();
  for (const id of STACK_PRIORITY) {
    const files = [];
    for (const p of inputPaths) {
      try { files.push(...collectFiles(p, id)); } catch { /* handled by the caller */ }
    }
    for (const f of files) {
      if (seen.has(f)) continue;
      const owner = classifyFile(f, readHead);
      if (!owner) continue;
      seen.add(f);
      if (!byStack.has(owner)) byStack.set(owner, []);
      byStack.get(owner).push(f);
    }
  }
  return byStack;
}

/** The single stack that best fits a set of files — for the agents, which handle one at a time. */
export function detectDominantStack(files, readHead, fallback = "playwright") {
  const counts = new Map();
  for (const f of files) {
    const id = classifyFile(f, readHead);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (counts.size === 0) return fallback;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
