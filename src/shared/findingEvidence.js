/**
 * The few lines of your file that a finding is actually about.
 *
 * The exported report carries results but no source, so a card could show the
 * recommended pattern and nothing else — "here is the fix" with no sign of
 * what was wrong. In the live app the snippet is recovered from the loaded
 * file; in a report there is nothing to recover it from, so the CLI attaches
 * it at build time.
 *
 * Deliberately a window, not the file. A report gets emailed around, and a
 * handful of lines per finding is the evidence you need to act on it without
 * turning the attachment into a copy of the repository.
 */

/** Lines either side of the offending one. Enough for context, not a listing. */
const CONTEXT = 2;

/**
 * @param content  the file's source
 * @param line     1-based line the finding points at
 * @returns {{ startLine, text }} or null
 */
export function evidenceFor(content, line) {
  if (!content || !line || line < 1) return null;
  const lines = String(content).split("\n");
  if (line > lines.length) return null;

  const from = Math.max(0, line - 1 - CONTEXT);
  const to = Math.min(lines.length, line + CONTEXT);
  const text = lines.slice(from, to).join("\n");
  if (!text.trim()) return null;

  return { startLine: from + 1, text, line };
}

/** Attach `evidence` to every finding that points at a line. */
export function withEvidence(findings = [], content) {
  if (!content) return findings;
  return findings.map((f) => {
    if (f.evidence || f.line == null) return f;
    const evidence = evidenceFor(content, f.line);
    return evidence ? { ...f, evidence } : f;
  });
}
