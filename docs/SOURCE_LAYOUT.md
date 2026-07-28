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
