/**
 * Self-contained app report.
 *
 * The flat HTML report (buildCompleteReport) is a document: good for printing
 * and emailing, but it can only ever approximate the app. This builds the
 * other thing — the real React app inlined into one file, with the analysis
 * injected as a workspace so it restores through the same path a saved
 * session does. Sidebar, Overview, Files, Findings, Rule Settings, Radar and
 * Roadmap all work offline, because it *is* the app.
 *
 * The caller supplies the built assets; this module stays free of any
 * filesystem or build-tool assumptions so the web app could emit one too.
 */

/** Characters that must not appear raw inside a <script> block. */
function safeJson(value) {
  // Build the line-separator pattern from escapes: a literal U+2028 inside a
  // regex source is itself a line terminator and will not parse.
  const LINE_SEPS = new RegExp("[\\u2028\\u2029]", "g");
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(LINE_SEPS, (c) => "\\u" + c.charCodeAt(0).toString(16));
}

/**
 * @param {object}  opts
 * @param {string}  opts.appJs      The built application bundle (ESM).
 * @param {string}  opts.appCss     The built stylesheet.
 * @param {object}  opts.workspace  Same shape saveWorkspace persists.
 * @param {string} [opts.title]
 */
export function buildAppHtmlReport({ appJs, appCss, workspace, title = "Code Quality Studio" }) {
  if (!appJs) throw new Error("buildAppHtmlReport: appJs is required");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${String(title).replace(/[<&]/g, (c) => ({ "<": "&lt;", "&": "&amp;" }[c]))}</title>
<style>${appCss || ""}</style>
</head>
<body>
<div id="root"></div>
<script>
  // Picked up by loadWorkspace() before it reaches IndexedDB.
  window.__CQS_WORKSPACE__ = ${safeJson(workspace)};
  // Offline copy: no dev server, so nothing should try to reach one.
  window.__CQS_OFFLINE__ = true;
</script>
<script type="module">
${appJs}
</script>
</body>
</html>`;
}

/**
 * Shape the CLI's results into the workspace the app already knows how to restore.
 * Mirrors what saveWorkspace() writes, minus anything only a live session needs.
 */
export function workspaceFromResults({ stackId, projectName, results, folderHint = "" }) {
  return {
    stackId,
    projectName,
    resultsView: "local",
    folderHint,
    savedAt: new Date().toISOString(),
    files: results.map(({ file, result }) => ({
      name: typeof file === "string" ? file : String(file),
      status: "done",
      resultLocal: result,
      resultsAi: {},
      errorsAi: {},
    })),
  };
}
