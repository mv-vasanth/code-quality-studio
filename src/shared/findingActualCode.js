/** Extract real lines from source to show next to suggested fixes. */

const RULE_LINE_PATTERNS = {
  "PW-REL-001": /waitForTimeout\s*\(/,
  "PW-REL-002": /page\.\$\$\s*\(/,
  "PW-SEL-001": /xpath\s*=|locator\s*\(\s*['"`]\s*\//i,
  "PW-SEL-002": /locator\s*\(\s*['"`]#/,
  "PW-AST-001": /expect\s*\(\s*await\b/,
  "PW-STD-001": /\.only\s*\(/,
  "PW-CI-001": /goto\s*\(\s*['"]https?:\/\//,
  "PW-SEC-001": /(?:password|api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]{4,}['"]/i,
  "PW-PER-001": /page\.goto\s*\(/,
  "JV-SEC-001": /createStatement\s*\(|executeQuery\s*\(\s*["'][^"']*\+/,
  "JV-SEC-002": /(?:password|apiKey|secret|privateKey)\s*=\s*["'][^"']{4,}["']/i,
  "JV-ERR-001": /catch\s*\([^)]*\)\s*\{\s*\}/,
  "JV-OBS-001": /System\.(out|err)\.print/,
  "JV-API-001": /@(Get|Post|Put|Delete|Patch)Mapping/,
  "JV-API-002": /return\s+null\s*;/,
  "JV-CON-001": /new\s+Thread\s*\(|\.start\s*\(\)/,
  "JV-PER-001": /findById|findOne|EntityManager|JpaRepository/,
  "JV-TST-001": /class\s+\w+(Service|Controller)/,
  "JV-MNT-001": /public\s+class\s+\w+/,
  "TS-TYP-001": /:\s*any\b|as\s+any\b|<any>/,
  "TS-TYP-002": /@ts-ignore|@ts-expect-error/,
  "TS-TYP-003": /\w+!\./,
  "TS-HTTP-001": /fetch\s*\(/,
  "TS-HTTP-002": /axios\./,
  "TS-SEC-001": /(?:password|api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]{4,}['"]/i,
  "TS-STD-001": /console\.(log|debug|info)\s*\(/,
  "TS-ERR-001": /catch\s*\([^)]*\)\s*\{\s*\}/,
  "TS-VAL-001": /req\.body|request\.json/,
  "TS-STR-001": /export\s+\*\s+from/,
};

/** Max lines to show per rule when scanning the whole file locally. */
const RULE_MAX_LINES = {
  "PW-REL-001": 25,
  "PW-SEL-001": 12,
  "PW-SEL-002": 12,
  "PW-SEL-003": 20,
  "PW-PER-001": 8,
  "JV-ERR-001": 15,
  "JV-OBS-001": 12,
  "JV-SEC-001": 10,
  "JV-SEC-002": 8,
  "TS-TYP-001": 12,
  "TS-STD-001": 10,
  "TS-ERR-001": 15,
  default: 10,
};

function linesOf(content) {
  return String(content || "").split(/\r?\n/);
}

function sliceAround(lines, lineNum, context = 1) {
  const idx = lineNum - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const start = Math.max(0, idx - context);
  const end = Math.min(lines.length, idx + context + 1);
  const out = [];
  for (let i = start; i < end; i++) {
    const prefix = i === idx ? ">" : " ";
    out.push(`${prefix} ${i + 1}| ${lines[i]}`);
  }
  return out.join("\n");
}

function linesMatching(lines, re, max = 4) {
  const out = [];
  for (let i = 0; i < lines.length && out.length < max; i++) {
    if (re.test(lines[i])) {
      re.lastIndex = 0;
      out.push(`${i + 1}| ${lines[i].trimEnd()}`);
    }
    re.lastIndex = 0;
  }
  return out.length ? out.join("\n") : null;
}

function fileLevelSnippet(lines, ruleId) {
  if (ruleId === "PW-AST-002") {
    const tests = linesMatching(lines, /\btest\s*\(/, 8);
    const expects = linesMatching(lines, /\bexpect\s*\(/, 3);
    if (tests && !expects) {
      return `${tests}\n// ↑ test blocks in this file — no expect() found`;
    }
    if (tests) return tests;
  }
  if (ruleId === "PW-STR-001") {
    return linesMatching(lines, /\btest\s*\(/, 6);
  }
  if (ruleId === "PW-MOB-001" || ruleId === "PW-A11Y-001") {
    const tests = linesMatching(lines, /\btest\s*\(|test\.describe\s*\(/, 5);
    if (tests) return `${tests}\n// ↑ no viewport / mobile / a11y patterns detected in this file`;
    return linesMatching(lines, /async\s*\(\s*\{\s*page\s*\}/, 3);
  }
  if (ruleId === "JV-TST-001") {
    const cls = linesMatching(lines, /class\s+\w+/, 3);
    const tests = linesMatching(lines, /@Test|@ParameterizedTest/, 3);
    if (cls && !tests) {
      return `${cls}\n// ↑ no @Test in this service/controller file`;
    }
    return cls;
  }
  if (ruleId === "JV-API-001") {
    return linesMatching(lines, /@(RestController|Controller|GetMapping|PostMapping)/, 6);
  }
  if (ruleId === "JV-MNT-001") {
    return linesMatching(lines, /public\s+class\s+\w+/, 2);
  }
  if (ruleId === "JV-PER-001") {
    return linesMatching(lines, /for\s*\(|findById|findOne/, 8);
  }
  if (ruleId === "TS-VAL-001") {
    return linesMatching(lines, /req\.body|request\.json|ctx\.request/, 6);
  }
  return null;
}

/** Split fix text that uses // Before / // After blocks (from local rules). */
export function parseBeforeAfterFix(fixText) {
  if (!fixText || typeof fixText !== "string") return { solution: fixText || "" };
  const t = fixText.trim();
  const beforeAfter = t.match(/\/\/\s*Before\s*\n([\s\S]*?)\n\s*\/\/\s*After\s*\n([\s\S]*)$/i);
  if (beforeAfter) {
    return {
      actualFromFix: beforeAfter[1].trim(),
      solution: beforeAfter[2].trim(),
    };
  }
  const avoidPrefer =
    t.match(/\/\/\s*Avoid\s*\n([\s\S]*?)(?:\n\s*\/\/\s*Prefer\s*\n)([\s\S]*)$/i) ||
    t.match(/\/\/\s*avoid\s*\n([\s\S]*?)(?:\n\s*\/\/\s*prefer\s*\n)([\s\S]*)$/i);
  if (avoidPrefer) {
    return {
      actualFromFix: avoidPrefer[1].trim(),
      solution: avoidPrefer[2].trim(),
    };
  }
  return { solution: t };
}

export function getActualCodeForFinding(content, finding) {
  if (!content) return finding?.actualCode || finding?.currentCode || null;
  if (finding?.actualCode || finding?.currentCode) {
    return finding.actualCode || finding.currentCode;
  }

  const lines = linesOf(content);
  const ruleId = finding?.ruleId || "";
  const max =
    RULE_MAX_LINES[ruleId] ?? RULE_MAX_LINES.default;

  const re = ruleId ? RULE_LINE_PATTERNS[ruleId] : null;
  if (re) {
    const all = linesMatching(lines, re, max);
    if (all) return all;
  }

  if (ruleId === "PW-SEL-003") {
    const brittle = linesMatching(lines, /page\.locator\s*\(|(?:^|[^\w])locator\s*\(\s*['"`]/, max);
    if (brittle) return brittle;
  }

  const fileLevel = fileLevelSnippet(lines, ruleId);
  if (fileLevel) return fileLevel;

  if (finding?.line) {
    const around = sliceAround(lines, finding.line, 2);
    if (around) return around;
  }

  return null;
}

export function resolveFileForFinding(files, finding) {
  if (!files?.length || !finding) return null;
  const pathKey = finding.sourcePath || finding.sourceFile;
  if (pathKey) {
    const exact = files.find((f) => f.name === pathKey);
    if (exact) return exact;
  }
  const base = finding.fileName;
  if (!base) return null;
  const matches = files.filter((f) => f.name === base || f.name.split("/").pop() === base);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1 && finding.sourcePath) {
    const byPath = matches.find((f) => f.name === finding.sourcePath || f.name.endsWith("/" + finding.sourcePath));
    if (byPath) return byPath;
  }
  return matches[0] ?? files.find((f) => f.name.endsWith("/" + base)) ?? null;
}

export function enrichFindingWithFileContext(finding, file) {
  if (!finding || !file?.content) return finding;
  const actualCode = getActualCodeForFinding(file.content, finding);
  return actualCode ? { ...finding, actualCode } : finding;
}
