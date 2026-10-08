# Source layout

The app entry point is thin; feature code is grouped by role.

```
src/
  App.jsx                          # Re-exports PlaywrightQualityStudio
  main.jsx                         # React bootstrap

  studio/
    PlaywrightQualityStudio.jsx    # Main UI shell, tabs, state

  constants/
    categories.js                  # CATEGORIES, SEV, grade()
    aiSystemPrompt.js              # AI audit system prompt (optional mode)

  config/
    analysisConfig.js              # Local vs AI mode flags

  services/
    runFileAnalysis.js             # Single file: local rules or Anthropic API

  components/
    charts/                        # ScoreRing, MiniBar, RadarChart
    findings/                      # FindingCard
    files/                         # FileTree

  report/
    buildPayload.js                # Normalised report data
    buildMarkdownReport.js         # Shareable .md
    buildHtmlReport.js             # Shareable .html (default download)
    reportUtils.js                 # Helpers

  exportFindingsReport.js          # downloadReport() facade
  localAnalyzer.js                 # Standard rule checks (no API)
  bestPracticesGuide.js            # Practice reference content
  …                                # Best practices checklist UI
```

## Adding a new standard check

1. Add rule logic in `localAnalyzer.js`.
2. Map to a practice in `bestPracticesGuide.js` (and docs).
3. Reports pick up new findings automatically via `report/buildPayload.js`.

---

## Outside `src/`

| Path | What it is |
|---|---|
| `cli/` | The `cqs` CLI, MCP server and `cqs serve`. Bundled by esbuild into single files with **no runtime dependencies** — a stray package import once shipped in three releases and killed every command, so `embedApp.mjs` fails the build on one. |
| `ai/` | `cqs-ai`, a **separate npm package**. The offline classifier and its ONNX dependency live here so they cannot break the audit CLI. Nothing in `cli/` imports it; the server installs it into `~/.cqs/addons` and talks to it over HTTP. |
| `server/` | Vite dev middleware for Vertex only. |

Both `cli/` and `ai/` import freely from `src/` — the rule engine is shared, and duplicating it
is how the CLI and the app came to disagree about which stack owned a file.
