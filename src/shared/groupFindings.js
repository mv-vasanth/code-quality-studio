/**
 * Collapse repeated findings into one entry per rule per file.
 *
 * A single spec with five hard waits produced five near-identical cards,
 * titled "occurrence 1/5" … "occurrence 5/5". Every one carried the same
 * explanation, the same risk paragraph and the same deep-dive text, so the
 * page became that rule repeated five times and the other problems in the
 * file scrolled off the screen. The repetition is a *count*, not five
 * separate things to read.
 *
 * Pure and framework-free: the React app and the exported HTML report both
 * render from this, so a file cannot look like 5 problems in one and 1 in the
 * other.
 */

/** "Hard wait (waitForTimeout) — occurrence 3/5" → "Hard wait (waitForTimeout)" */
export function baseTitle(title) {
  return String(title ?? "").replace(/\s*[—-]\s*occurrence\s+\d+\s*\/\s*\d+\s*$/i, "").trim();
}

/**
 * @param findings  flat list, in display order
 * @returns [{ lead, occurrences, count, lines, title }]
 *          `lead` is the first finding — the one whose code snippet is shown.
 */
export function groupFindings(findings = []) {
  const byKey = new Map();
  const order = [];

  for (const f of findings) {
    const title = baseTitle(f.title);
    // Severity is part of the key: the same rule firing at two severities is
    // two different verdicts and must not be averaged into one card.
    const key = [f.fileName ?? "", f.ruleId ?? title, f.severity ?? "", title].join("\u0000");
    if (!byKey.has(key)) {
      byKey.set(key, { title, lead: f, occurrences: [] });
      order.push(key);
    }
    byKey.get(key).occurrences.push(f);
  }

  return order.map((k) => {
    const g = byKey.get(k);
    const lines = g.occurrences.map((o) => o.line).filter((n) => n != null);
    return {
      ...g,
      count: g.occurrences.length,
      // Sorted and de-duplicated: the chips are a map of the file, so they
      // should read top-to-bottom even if the rules did not emit them in order.
      lines: [...new Set(lines)].sort((a, b) => a - b),
    };
  });
}
