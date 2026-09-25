/**
 * PR review bot core — pure logic, no network.
 *
 * GitHub rejects an inline comment whose line is not part of the diff (HTTP 422),
 * so the central job here is deciding which findings can be anchored inline and
 * which must be summarised in the review body instead.
 */

/**
 * Parse a unified diff patch and return the set of new-file line numbers that
 * GitHub will accept a RIGHT-side comment on (added lines and context lines).
 */
export function commentableLines(patch) {
  const lines = new Set();
  if (!patch) return lines;
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { newLine = parseInt(hunk[1], 10); continue; }
    if (raw.startsWith("-")) continue;              // removed: LEFT side only
    if (raw.startsWith("\\")) continue;             // "\ No newline at end of file"
    if (raw.startsWith("+") || raw.startsWith(" ")) { lines.add(newLine); newLine++; }
  }
  return lines;
}

/** Lines the PR actually added — used to prioritise findings the author introduced. */
export function addedLines(patch) {
  const lines = new Set();
  if (!patch) return lines;
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { newLine = parseInt(hunk[1], 10); continue; }
    if (raw.startsWith("-") || raw.startsWith("\\")) continue;
    if (raw.startsWith("+")) lines.add(newLine);
    if (raw.startsWith("+") || raw.startsWith(" ")) newLine++;
  }
  return lines;
}

const ICON = { critical: "🔴", warning: "🟡", info: "🔵" };

/** One inline comment body. Kept short — PR comments are read in a narrow column. */
export function commentBody(finding) {
  const parts = [
    `${ICON[finding.severity] ?? ""} **${finding.title}**  \`${finding.ruleId}\``,
    "",
    finding.description,
  ];
  if (finding.impact) parts.push("", `_${finding.impact}_`);
  if (finding.fix) {
    const fix = String(finding.fix).trim();
    parts.push("", "```", fix.length > 600 ? fix.slice(0, 600) + "\n…" : fix, "```");
  }
  return parts.join("\n");
}

/**
 * Split findings into inline comments and leftovers.
 * @param files [{ filename, patch, findings }]
 * @param opts  { onlyAdded, maxComments }
 */
export function buildReview(files, { onlyAdded = false, maxComments = 30 } = {}) {
  const comments = [];
  const outside = [];
  let total = 0;

  for (const file of files) {
    const anchorable = onlyAdded ? addedLines(file.patch) : commentableLines(file.patch);
    for (const f of file.findings ?? []) {
      total++;
      if (f.line && anchorable.has(f.line)) {
        comments.push({ path: file.filename, line: f.line, side: "RIGHT", body: commentBody(f), _severity: f.severity });
      } else {
        outside.push({ file: file.filename, finding: f });
      }
    }
  }

  // Most severe first, so the cap keeps what matters.
  const rank = { critical: 0, warning: 1, info: 2 };
  comments.sort((a, b) => (rank[a._severity] ?? 3) - (rank[b._severity] ?? 3));
  const kept = comments.slice(0, maxComments).map(({ _severity, ...c }) => c);
  const dropped = comments.length - kept.length;

  return { comments: kept, outside, dropped, total };
}

/** The review summary body — what reviewers read first. */
export function reviewSummary({ files, counts, score, threshold, comments, outside, dropped }) {
  const gateFailed = threshold != null && score < threshold;
  const lines = [
    `## cqs quality review`,
    "",
    `**${files}** changed file(s) analysed · score **${score}/100**` +
      (threshold != null ? ` · threshold ${threshold} — ${gateFailed ? "❌ failed" : "✅ passed"}` : ""),
    "",
    `🔴 ${counts.critical} critical · 🟡 ${counts.warning} warning · 🔵 ${counts.info} info`,
  ];

  if (comments > 0) lines.push("", `${comments} finding(s) commented inline.`);
  if (dropped > 0) lines.push(`${dropped} more were omitted to keep the review readable.`);

  if (outside.length) {
    lines.push("", `<details><summary>${outside.length} finding(s) outside this diff</summary>`, "");
    for (const o of outside.slice(0, 40)) {
      lines.push(`- \`${o.file}${o.finding.line ? ":" + o.finding.line : ""}\` **${o.finding.severity}** ${o.finding.title} \`${o.finding.ruleId}\``);
    }
    if (outside.length > 40) lines.push(`- …and ${outside.length - 40} more`);
    lines.push("", "</details>");
  }

  if (counts.critical === 0 && counts.warning === 0) {
    lines.push("", "No critical or warning findings in the changed files.");
  }
  return lines.join("\n");
}
