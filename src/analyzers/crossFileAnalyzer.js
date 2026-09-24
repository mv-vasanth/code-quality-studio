/**
 * Cross-file duplicate code detection.
 *
 * Takes an array of { name, content } file objects and returns a map of
 * filename → additional findings[] to be merged into each file's resultLocal.
 *
 * Three checks:
 *  DUP-BLOCK-001  Identical test/describe/setup block found in another file (warning)
 *  DUP-BLOCK-002  Near-duplicate test block (≥75% line similarity) (info)
 *  DUP-SETUP-001  Identical beforeEach/afterEach/beforeAll/afterAll block across files (warning)
 */

// ─── Normalisation helpers ─────────────────────────────────────────────────

/** Strip single-line comments, collapse string literals, trim whitespace. */
function normaliseLine(line) {
  return line
    .replace(/\/\/.*$/, "")                         // strip // comments
    .replace(/["'`]([^"'`\\]|\\.){0,120}["'`]/g, '"…"')  // normalise string literals
    .replace(/\s+/g, " ")                           // collapse whitespace
    .trim();
}

/** Return normalised non-trivial lines for a block body string. */
function normalisedLines(raw) {
  return raw
    .split("\n")
    .map(normaliseLine)
    .filter((l) => l.length > 4 && l !== "{" && l !== "}" && l !== "})" && l !== "});");
}

// ─── Block extraction ──────────────────────────────────────────────────────

const BLOCK_STARTER = /^\s*(test\.describe|describe|test\.beforeEach|test\.afterEach|beforeEach|afterEach|beforeAll|afterAll|test|it)\s*[\('"]/;

/**
 * Extract semantic blocks (test / describe / beforeEach …) from a file's content.
 * Uses brace-depth counting to find block boundaries.
 *
 * @returns {{ kind: string, startLine: number, lineCount: number, normalized: string }[]}
 */
function extractBlocks(content) {
  const lines = content.split("\n");
  const blocks = [];

  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(BLOCK_STARTER);
    if (match) {
      const kind = match[1];
      let depth = 0;
      let started = false;
      const bodyLines = [];
      const startLine = i + 1; // 1-indexed

      // Cap at 300 lines to avoid runaway loops on minified files
      for (let j = i; j < Math.min(i + 300, lines.length); j++) {
        const l = lines[j];
        bodyLines.push(l);
        for (let ci = 0; ci < l.length; ci++) {
          const ch = l[ci];
          if (ch === "{") { depth++; started = true; }
          else if (ch === "}") depth--;
        }
        if (started && depth === 0) {
          // Only capture blocks with a meaningful body (> 2 lines)
          if (bodyLines.length > 2) {
            // Exclude the outer opening/closing lines to focus on body content
            const bodyStr = bodyLines.slice(1, -1).join("\n");
            const normed = normalisedLines(bodyStr).join("\n");
            if (normed.length > 30) {
              blocks.push({ kind, startLine, lineCount: bodyLines.length, normalized: normed });
            }
          }
          i = j; // advance outer pointer past this block
          break;
        }
      }
    }
    i++;
  }
  return blocks;
}

// ─── Similarity ────────────────────────────────────────────────────────────

/** djb2-style hash for a string. */
function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

/** Line-level Jaccard similarity: |A ∩ B| / |A ∪ B|. */
function jaccard(normA, normB) {
  const setA = new Set(normA.split("\n").filter((l) => l.length > 5));
  const setB = new Set(normB.split("\n").filter((l) => l.length > 5));
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const line of setA) {
    if (setB.has(line)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Finding builder ───────────────────────────────────────────────────────

function makeFinding(ruleId, severity, title, description, impact, fix, line, otherFile) {
  return {
    ruleId,
    category: ruleId.startsWith("DUP-SETUP") ? "structure" : "coding_standards",
    severity,
    title,
    description,
    impact,
    fix,
    line: line ?? null,
    reference: "DRY principle — don't repeat yourself",
    _crossFile: true,    // internal marker so we can strip on rerun
    _otherFile: otherFile,
  };
}

// ─── Main export ───────────────────────────────────────────────────────────

/**
 * Run cross-file duplicate analysis across all provided files.
 *
 * @param {{ name: string, content: string }[]} files
 * @returns {{ [filename: string]: object[] }}
 */
export function runCrossFileAnalysis(files) {
  if (!files || files.length < 2) return {};

  // Build per-file block lists
  const fileBlocks = files.map((f) => ({
    name: f.name,
    short: f.name.split("/").pop(),
    blocks: extractBlocks(f.content),
  }));

  const findings = {}; // filename → findings[]

  const add = (name, finding) => {
    if (!findings[name]) findings[name] = [];
    // Deduplicate by ruleId + other-file combo
    const key = `${finding.ruleId}:${finding._otherFile}`;
    if (!findings[name].some((fi) => `${fi.ruleId}:${fi._otherFile}` === key)) {
      findings[name].push(finding);
    }
  };

  // ── Check 1 & 2: Block-level duplicates ──────────────────────────────────
  for (let i = 0; i < fileBlocks.length; i++) {
    for (let j = i + 1; j < fileBlocks.length; j++) {
      const fa = fileBlocks[i];
      const fb = fileBlocks[j];

      for (const ba of fa.blocks) {
        if (ba.lineCount < 5) continue; // skip trivially short blocks

        for (const bb of fb.blocks) {
          if (bb.lineCount < 5) continue;

          // Skip if sizes differ by more than 50% (unlikely to be a duplicate)
          const ratio = ba.lineCount / bb.lineCount;
          if (ratio < 0.5 || ratio > 2) continue;

          const hashA = hashStr(ba.normalized);
          const hashB = hashStr(bb.normalized);

          if (hashA === hashB && ba.normalized.length > 50) {
            // ── Identical block ──
            add(fa.name, makeFinding(
              "DUP-BLOCK-001", "warning",
              "Duplicate test block detected",
              `A \`${ba.kind}\` block (line ${ba.startLine}) is identical to one in ${fb.short}.`,
              "Duplicated logic must be maintained in multiple places; bugs or changes must be applied everywhere.",
              `Extract the shared steps into a Playwright fixture, helper, or page-object method shared by both files.`,
              ba.startLine, fb.name,
            ));
            add(fb.name, makeFinding(
              "DUP-BLOCK-001", "warning",
              "Duplicate test block detected",
              `A \`${bb.kind}\` block (line ${bb.startLine}) is identical to one in ${fa.short}.`,
              "Duplicated logic must be maintained in multiple places; bugs or changes must be applied everywhere.",
              `Extract the shared steps into a Playwright fixture, helper, or page-object method shared by both files.`,
              bb.startLine, fa.name,
            ));
          } else {
            // ── Near-duplicate block ──
            const sim = jaccard(ba.normalized, bb.normalized);
            if (sim >= 0.75 && ba.lineCount >= 7) {
              const pct = Math.round(sim * 100);
              add(fa.name, makeFinding(
                "DUP-BLOCK-002", "info",
                "Near-duplicate test block detected",
                `A \`${ba.kind}\` block (line ${ba.startLine}) is ${pct}% similar to one in ${fb.short}.`,
                "Near-identical tests often diverge silently — copy-paste errors slip in when one copy is updated but not the other.",
                `Extract the common steps into a shared helper or parameterise the difference; keep only one copy of the logic.`,
                ba.startLine, fb.name,
              ));
              add(fb.name, makeFinding(
                "DUP-BLOCK-002", "info",
                "Near-duplicate test block detected",
                `A \`${bb.kind}\` block (line ${bb.startLine}) is ${pct}% similar to one in ${fa.short}.`,
                "Near-identical tests often diverge silently — copy-paste errors slip in when one copy is updated but not the other.",
                `Extract the common steps into a shared helper or parameterise the difference; keep only one copy of the logic.`,
                bb.startLine, fa.name,
              ));
            }
          }
        }
      }
    }
  }

  // ── Check 3: Repeated setup blocks ────────────────────────────────────────
  const SETUP_KINDS = new Set(["beforeEach", "afterEach", "beforeAll", "afterAll",
    "test.beforeEach", "test.afterEach"]);

  const setupMap = {}; // hash → { files: string[], block }

  for (const { name, blocks } of fileBlocks) {
    for (const block of blocks) {
      if (!SETUP_KINDS.has(block.kind)) continue;
      if (block.lineCount < 3) continue;

      const h = hashStr(block.normalized);
      if (!setupMap[h]) setupMap[h] = { files: [], block };
      // Record each file only once per hash
      if (!setupMap[h].files.includes(name)) {
        setupMap[h].files.push(name);
        setupMap[h].block = block; // keep last seen (startLine may differ per file)
      }
    }
  }

  for (const { files: matchFiles, block } of Object.values(setupMap)) {
    if (matchFiles.length < 2) continue;

    for (const name of matchFiles) {
      const others = matchFiles
        .filter((f) => f !== name)
        .map((f) => f.split("/").pop())
        .join(", ");

      add(name, makeFinding(
        "DUP-SETUP-001", "warning",
        "Repeated setup block across files",
        `A \`${block.kind}()\` block is identical in ${matchFiles.length} files (also: ${others}).`,
        "Repeated setup means each file must be updated independently; a missed update causes inconsistent test behaviour.",
        `Move the shared setup into a Playwright fixture via \`test.extend()\` and import it in all affected files.`,
        block.startLine, matchFiles.find((f) => f !== name) || "",
      ));
    }
  }

  // ── Check 4: Duplicate XPaths across files ────────────────────────────────
  const XPATH_RE = /(?:locator|page\.locator)\s*\(\s*['"`](\/[^'"`]{4,}|xpath=[^'"`]+)['"`]/g;

  /** Extract all unique XPath strings from a file's content with first line number. */
  const fileXpaths = files.map((f) => {
    const xpaths = {}; // xpath → first line
    const lines = f.content.split("\n");
    lines.forEach((line, idx) => {
      let m;
      const re = new RegExp(XPATH_RE.source, XPATH_RE.flags);
      while ((m = re.exec(line)) !== null) {
        const x = m[1].trim();
        if (!xpaths[x]) xpaths[x] = idx + 1;
      }
    });
    return { name: f.name, short: f.name.split("/").pop(), xpaths };
  });

  // Build a map: xpath → list of files that use it
  const xpathFileMap = {};
  for (const { name, xpaths } of fileXpaths) {
    for (const xpath of Object.keys(xpaths)) {
      if (!xpathFileMap[xpath]) xpathFileMap[xpath] = [];
      if (!xpathFileMap[xpath].includes(name)) xpathFileMap[xpath].push(name);
    }
  }

  for (const [xpath, matchFiles] of Object.entries(xpathFileMap)) {
    if (matchFiles.length < 2) continue;
    const short = xpath.length > 55 ? xpath.slice(0, 55) + "…" : xpath;

    for (const { name, short: shortName, xpaths } of fileXpaths) {
      if (!matchFiles.includes(name)) continue;
      const others = matchFiles
        .filter((f) => f !== name)
        .map((f) => f.split("/").pop())
        .join(", ");

      add(name, makeFinding(
        "DUP-XPATH-001", "warning",
        "Duplicate XPath used across files",
        `XPath "${short}" is also used in: ${others}.`,
        "Shared XPaths create a hidden dependency — a DOM change breaks all files at once; each must be fixed separately.",
        `Extract the shared XPath into a shared Page Object or a constants file and import it where needed.`,
        xpaths[xpath], matchFiles.find((f) => f !== name) || "",
      ));
    }
  }

  return findings;
}
