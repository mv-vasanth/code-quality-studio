/**
 * remediation.js — Agentic auto-remediation for qcBot.
 *
 * Usage:
 *   qcbot remediate ./tests --stack playwright --api-key $ANTHROPIC_API_KEY
 *   qcbot remediate ./tests --dry-run   # shows what would be changed, no writes
 *   qcbot remediate ./tests --commit     # git-commits the fixes after applying
 *
 * How it works:
 *   1. Run full analysis (same as `check`)
 *   2. For each file with critical findings, call Claude to produce a fixed version
 *   3. Show a before/after summary and write the fixed file (unless --dry-run)
 *   4. If --commit, run `git add -A && git commit -m "fix: auto-remediate quality findings"`
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve, basename, relative } from "path";
import { glob } from "glob";
import { execSync } from "child_process";
import { runLocalAnalysis } from "../../src/analyzers/index.js";
import { AUDIT_STACKS } from "../../src/stacks/definitions.js";

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const RED    = "\x1b[31m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const TEAL   = "\x1b[36m";
const GRAY   = "\x1b[90m";
const DIM    = "\x1b[2m";

// ── AI fix caller ─────────────────────────────────────────────────────────

const FIX_SYSTEM_PROMPT = `You are a senior test automation engineer specialising in code quality.
You will receive a test file with one or more quality findings. Your task is to fix ALL the findings in the file.

Return ONLY the complete, corrected file content — no explanations, no markdown fences, no commentary.
The output must be the raw file content that can be written directly to disk.

Rules:
- Fix only the identified issues; keep all other code unchanged
- Maintain the same indentation style as the original
- Do not add comments explaining what you changed
- Do not remove tests or functionality
- If you cannot fix a finding without breaking functionality, leave that specific code unchanged`;

function buildRemediationPrompt(fileName, content, findings) {
  const findingList = findings
    .map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}${f.line ? ` (line ${f.line})` : ""}\n   ${f.description}\n   Fix: ${f.fix || "Follow best practices"}`)
    .join("\n\n");

  return `File: ${fileName}

Findings to fix:
${findingList}

Original file content:
${content}

Return the complete fixed file content only.`;
}

async function callAnthropicFix(apiKey, model, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-6",
      max_tokens: 8192,
      system: FIX_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.map((b) => b.text || "").join("") || "";
}

async function callGoogleFix(apiKey, model, prompt) {
  const modelId = model || "gemini-1.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: FIX_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google AI error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
}

async function getAiFix({ provider, apiKey, model, fileName, content, findings }) {
  const prompt = buildRemediationPrompt(fileName, content, findings);
  switch (provider) {
    case "anthropic": return callAnthropicFix(apiKey, model, prompt);
    case "google":    return callGoogleFix(apiKey, model, prompt);
    default: throw new Error(`Provider "${provider}" not supported for remediation. Use --provider anthropic or --provider google.`);
  }
}

// ── Diff summary ──────────────────────────────────────────────────────────

function quickDiff(original, fixed) {
  const origLines = original.split("\n");
  const fixedLines = fixed.split("\n");
  let added = 0, removed = 0;
  const maxLen = Math.max(origLines.length, fixedLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (origLines[i] !== fixedLines[i]) {
      if (origLines[i] !== undefined) removed++;
      if (fixedLines[i] !== undefined) added++;
    }
  }
  return { added, removed, changed: added + removed > 0 };
}

// ── Spinner ───────────────────────────────────────────────────────────────

function spinner(text) {
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${TEAL}${frames[i++ % frames.length]}${RESET} ${text}`);
  }, 80);
  return { stop: () => { clearInterval(id); process.stdout.write("\r\x1b[K"); } };
}

// ── Test-file guard ───────────────────────────────────────────────────────
// Patterns that identify recognised test / spec files across all supported stacks.
// Used by --test-files-only (default ON) to prevent the agent from rewriting
// production source code even if the user accidentally points it at a mixed directory.

const TEST_FILE_GUARD_PATTERNS = [
  /\.spec\.[jt]sx?$/i,          // *.spec.ts, *.spec.js, *.spec.tsx, *.spec.jsx
  /\.test\.[jt]sx?$/i,          // *.test.ts, *.test.js …
  /\.spec\.py$/i,                // Python playwright / pytest specs
  /test_[^/\\]+\.py$/i,         // pytest  test_login.py
  /[^/\\]+_test\.py$/i,         // pytest  login_test.py
  /[^/\\]+Test\.java$/i,        // JUnit   LoginTest.java
  /[^/\\]+Spec\.java$/i,        // Spock   LoginSpec.java
  /[^/\\]+IT\.java$/i,          // Maven integration tests
  /\.feature$/i,                 // Karate / Cucumber .feature files
  /[^/\\]+_spec\.rb$/i,         // RSpec
  /[^/\\]+\.steps\.[jt]sx?$/i,  // Step definitions
];

function isTestFile(filePath) {
  return TEST_FILE_GUARD_PATTERNS.some((re) => re.test(filePath));
}

// ── Main ──────────────────────────────────────────────────────────────────

export async function runRemediation(inputPath, opts) {
  const provider       = opts.provider || "anthropic";
  const apiKey         = opts.apiKey   || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const model          = opts.model    || null;
  const stackId        = opts.stack    || "playwright";
  const dryRun         = Boolean(opts.dryRun);
  const doCommit       = Boolean(opts.commit);
  const doBranch       = opts.branch || null;
  const severity       = opts.severity || "critical"; // which findings to fix: critical | warning | all
  // Safety flag — default true. When enabled, only files matching TEST_FILE_GUARD_PATTERNS
  // are eligible for remediation, regardless of what stackDef.filePattern matches.
  const testFilesOnly  = opts.testFilesOnly !== false;

  if (!apiKey) {
    console.error(`${RED}✗ No API key. Pass --api-key or set ANTHROPIC_API_KEY / GOOGLE_AI_API_KEY.${RESET}`);
    process.exit(1);
  }
  if (!AUDIT_STACKS[stackId]) {
    console.error(`${RED}✗ Unknown stack "${stackId}"${RESET}`);
    process.exit(1);
  }

  const stackDef = AUDIT_STACKS[stackId];
  const absInput = resolve(process.cwd(), inputPath);
  if (!existsSync(absInput)) {
    console.error(`${RED}✗ Path not found: ${absInput}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${BOLD}⚡ qcbot remediate${RESET}${dryRun ? ` ${YELLOW}(dry-run — no files will be written)${RESET}` : ""}`);
  console.log(`${GRAY}   provider: ${provider} · model: ${model || "default"} · severity: ${severity}${RESET}\n`);

  // 1. Discover files
  const spin1 = spinner(`Discovering ${stackDef.dropHint} files…`);
  const allFiles = await glob("**/*", { cwd: absInput, absolute: true, nodir: true });
  let specFiles = allFiles.filter((f) => stackDef.filePattern.test(basename(f)));

  // Safety guard: when --test-files-only is active (default), remove any file that
  // does not match a recognised test/spec naming pattern. This prevents the agent
  // from accidentally rewriting production source code if the user points it at a
  // mixed directory. Disable with --no-test-files-only only if you are certain the
  // directory contains only test files.
  if (testFilesOnly) {
    const before = specFiles.length;
    specFiles = specFiles.filter((f) => isTestFile(f));
    const skipped = before - specFiles.length;
    if (skipped > 0) {
      console.log(`${YELLOW}⚠  --test-files-only: skipped ${skipped} file(s) that don't match test-file naming patterns.${RESET}`);
      console.log(`${GRAY}   (pass --no-test-files-only to include them — use with caution)${RESET}\n`);
    }
  } else {
    console.log(`${YELLOW}⚠  --no-test-files-only active — AI may rewrite non-test files. Ensure you're targeting the right directory.${RESET}\n`);
  }
  spin1.stop();

  if (specFiles.length === 0) {
    console.log(`${YELLOW}⚠  No test files found in ${absInput}${RESET}\n`);
    process.exit(0);
  }

  // 2. Analyse all files
  const spin2 = spinner(`Analysing ${specFiles.length} files…`);
  const fileResults = [];
  for (const fp of specFiles) {
    try {
      const content = await readFile(fp, "utf8");
      const name    = basename(fp);
      const result  = runLocalAnalysis(stackId, name, content);
      const findings = (result.findings || []).filter((f) =>
        severity === "all" ? true :
        severity === "critical" ? f.severity === "critical" :
        f.severity === "critical" || f.severity === "warning"
      );
      fileResults.push({ fp, name, content, result, findings });
    } catch (err) {
      console.warn(`${GRAY}  Skipping ${basename(fp)}: ${err.message}${RESET}`);
    }
  }
  spin2.stop();

  const toFix = fileResults.filter((f) => f.findings.length > 0);

  console.log(`${BOLD}Analysis complete${RESET}`);
  console.log(`  ${specFiles.length} files scanned · ${toFix.length} file(s) need remediation\n`);

  if (toFix.length === 0) {
    console.log(`${GREEN}✓ No ${severity} findings to remediate. All good!${RESET}\n`);
    process.exit(0);
  }

  // 3. Create branch if requested
  if (doBranch && !dryRun) {
    try {
      execSync(`git checkout -b ${doBranch}`, { stdio: "pipe" });
      console.log(`${GREEN}✓ Created branch: ${doBranch}${RESET}`);
    } catch (err) {
      console.warn(`${YELLOW}⚠  Could not create branch: ${err.message}${RESET}`);
    }
  }

  // 4. Remediate each file
  const results = { fixed: [], failed: [], skipped: [] };

  for (let i = 0; i < toFix.length; i++) {
    const fr = toFix[i];
    const relPath = relative(process.cwd(), fr.fp);
    console.log(`\n[${i + 1}/${toFix.length}] ${BOLD}${fr.name}${RESET}`);
    console.log(`  ${fr.findings.length} finding(s): ${fr.findings.map((f) => `${f.severity}:${f.ruleId || f.title}`).join(", ")}`);

    const spin3 = spinner(`Calling ${provider} to fix ${fr.name}…`);
    let fixedContent;
    try {
      fixedContent = await getAiFix({ provider, apiKey, model, fileName: fr.name, content: fr.content, findings: fr.findings });
      spin3.stop();
    } catch (err) {
      spin3.stop();
      console.log(`  ${RED}✗ AI fix failed: ${err.message}${RESET}`);
      results.failed.push({ file: relPath, error: err.message });
      continue;
    }

    // Strip any accidental markdown fences the AI may have added
    fixedContent = fixedContent.replace(/^```[\w]*\n?/m, "").replace(/\n?```\s*$/m, "").trim() + "\n";

    const diff = quickDiff(fr.content, fixedContent);
    if (!diff.changed) {
      console.log(`  ${GRAY}No changes produced — AI returned identical content${RESET}`);
      results.skipped.push(relPath);
      continue;
    }

    console.log(`  ${GREEN}+${diff.added}${RESET} lines added  ${RED}-${diff.removed}${RESET} lines removed`);

    if (dryRun) {
      console.log(`  ${DIM}[dry-run] Would write ${fr.fp}${RESET}`);
      results.fixed.push(relPath);
    } else {
      await writeFile(fr.fp, fixedContent, "utf8");
      console.log(`  ${GREEN}✓ Written${RESET} → ${relPath}`);
      results.fixed.push(relPath);
    }
  }

  // 5. Summary
  console.log(`\n${"─".repeat(52)}`);
  console.log(`${BOLD}Remediation complete${dryRun ? " (dry-run)" : ""}${RESET}`);
  console.log(`  ${GREEN}✓ Fixed:${RESET}   ${results.fixed.length} file(s)`);
  if (results.skipped.length) console.log(`  ${GRAY}  Skipped: ${results.skipped.length} file(s) (AI produced no change)${RESET}`);
  if (results.failed.length)  console.log(`  ${RED}✗ Failed:  ${results.failed.length} file(s)${RESET}`);

  // 6. Git commit
  if (doCommit && !dryRun && results.fixed.length > 0) {
    console.log(`\n${TEAL}→${RESET} Committing fixes…`);
    try {
      execSync("git add -A", { stdio: "pipe" });
      const msg = `fix: auto-remediate ${results.fixed.length} file(s) via qcBot (${severity} findings)\n\nFiles fixed:\n${results.fixed.map((f) => `  - ${f}`).join("\n")}\n\nGenerated by qcbot remediate`;
      execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { stdio: "pipe" });
      console.log(`${GREEN}✓ Committed${RESET}`);
    } catch (err) {
      console.error(`${RED}✗ Git commit failed: ${err.message}${RESET}`);
    }
  }

  console.log();
  process.exit(results.failed.length > 0 ? 1 : 0);
}
