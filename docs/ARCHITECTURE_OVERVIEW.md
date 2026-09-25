# cqs — architecture overview

Audience: engineers and architects picking this up for the first time.
Covers what the system is, how a file flows through it, where to extend it, and
what is genuinely unfinished.

---

## 1. What it is

A static quality analyser for test and application code. **530 rules across 18
stacks** (Playwright, Cypress, Selenium, Appium, TOSCA, REST Assured, Karate,
pytest, Postman, TypeScript, Java, Python).

It ships through four channels off one rule engine:

| Channel | Entry point | Notes |
|---|---|---|
| CLI | `cli/bin/cqs.entry.js` → `dist/cqs.js` | `npm i -g cqs-audit` |
| MCP server | `cli/bin/cqs-mcp.entry.js` → `dist/cqs-mcp.js` | 6 tools for Claude Code / Cursor |
| Web app | `src/main.jsx` (Vite + React 19) | `npm run dev` |
| Standalone binary | `cli/build-binary.mjs` | Node SEA, ~107 MB, no Node needed |

---

## 2. The one design decision that explains everything

**Rules are regex heuristics over raw text. There is no AST, no parser, no type
information.**

Consequences, good and bad:

- One analyser handles any language — Java, C#, Python, XML and TypeScript are
  all just strings. That is why 18 stacks exist with no per-language toolchain.
- Zero runtime dependencies in the CLI. The whole engine bundles to a single
  self-contained file, which is what makes the MCP server and the standalone
  binary cheap to ship.
- Analysis is offline and deterministic. No network, no telemetry.
- **But** rules cannot reason about scope, types or control flow. A rule sees
  lines, not semantics. Anything needing real analysis — "is this variable
  actually unused", "does this promise escape" — is approximated with
  proximity heuristics and brace counting, and will have edge cases.

If a future requirement genuinely needs semantic analysis, that is an engine
change, not a rule change. Budget for it accordingly.

---

## 3. How a file flows

```
cqs ./tests/
  └─ collectFiles(path, stackId)        walk dir, filter by stack filePattern
  └─ detectStack(files)                 if --stack omitted: score stacks by extension hits
  └─ discoverRulesFile(path)            walk UP to repo root looking for cqs-rules.json
  └─ for each file:
       ├─ runner(filename, content, { disabledRuleIds })     the stack analyzer
       │    └─ ~N independent regex checks → pushFinding(...)
       ├─ runFileRules(projectRules, ...)                    custom rules appended
       └─ buildAuditResult(...)                              scores computed
  └─ output: pretty | json | summary | html
  └─ optional: runAiReview(...)                              only with --ai
```

Each rule is independent and order-free. There is no rule engine, no DSL and no
registration step — a rule is a regex plus a `pushFinding` call.

### Scoring

In `src/analyzers/analyzerUtils.js`:

```
categoryScore = 100 − (18 × critical) − (10 × warning) − (4 × info)   clamped 0..100
overallScore  = mean(categoryScores)          // unweighted across the stack's categories
```

Two things to know before changing this: the mean is **unweighted**, so a stack
with ten categories dilutes a single bad category more than a stack with five;
and scores are per-file, with the CLI reporting the mean across files.

---

## 4. Module map

```
src/
  localAnalyzer.js          Playwright rules (67) — historical, not under analyzers/
  analyzers/
    <stack>.js              one file per stack, each exports analyse<Stack>Locally
    analyzerUtils.js        lineMatches, countMatches, pushFinding, scoreFromFindings
    crossFileAnalyzer.js    duplicate detection — needs ALL files, so shaped differently
    index.js                web-app entry: adds localStorage custom rules
  stacks/definitions.js     18 stack definitions: icon, filePattern, categories
  rules/
    fileRules.js            cqs-rules.json — discovery, validation, execution
    customRulesStorage.js   localStorage rules (web app only)
    verifyFix.js            re-audit a proposed fix, diff findings before/after
    remediate.js            fix prompt, code extraction, accept/reject decision
    catalog.js              Rules-tab metadata
  services/ai/              provider adapters + AI features (web app)
cli/
  bin/cqs.entry.js          CLI
  bin/cqs-mcp.entry.js      MCP server
  build*.mjs                esbuild bundlers
```

**Two entry paths, and they differ.** The CLI and MCP import each analyzer
**directly**. The web app goes through `analyzers/index.js`, which additionally
applies localStorage custom rules. Anything wired only into `index.js` is
invisible to CLI and CI — this has been the source of three separate gaps.

---

## 5. Extension points

**Add a rule** — edit one analyzer file. Pick an unused ID in that stack's
prefix, write the regex, call `pushFinding` with a category valid for that stack
(see `stacks/definitions.js`; an invalid category silently breaks scoring).

**Add a stack** — add an entry to `AUDIT_STACKS`, create
`src/analyzers/<stack>.js`, register it in the `RUNNERS` map in *three* places:
`cli/bin/cqs.entry.js`, `cli/bin/cqs-mcp.entry.js`, `src/analyzers/index.js`.

**Add a project rule** — no code. Drop a `cqs-rules.json` in the repo.

**Add an MCP tool** — `ListToolsRequestSchema` handler for the schema, then a
branch in the `CallToolRequestSchema` handler.

### Rule quality bar

Every rule must be verified **two ways**: it fires on a fixture containing the
defect, and it stays silent on clean idiomatic code. The second half is not
optional — during development, four rules that looked correct were flagging
correct code, including one that rejected the standard JUnit `@AfterAll`
teardown.

A helper harness checks all 18 stacks for duplicate IDs, invalid categories,
bad severities, empty fields and runtime crashes.

---

## 6. Current state — be honest with reviewers

### Working
530 rules · CLI · MCP server (6 tools) · web app · standalone binary ·
`cqs-rules.json` project rules · AI review across 4 providers · per-finding AI
fix · rule-suggestion agent · cross-file duplicate detection.

### Partial or missing

| Item | State |
|---|---|
| Remediation agent (bulk auto-fix) | In progress. Core + verification done; CLI `remediate` wired, not yet end-to-end tested |
| PR review bot | **Not built.** `.github/workflows/quality-pr.yml` calls `@cqs/qcbot`, which 404s on npm. That workflow fails on any PR |
| `src/rules/catalog.js` | ~200 rules missing, incl. all 77 Selenium. They run fine but cannot be toggled in the Rules tab |
| `crossFileAnalyzer.js` | Web app only — CLI and MCP never run duplicate detection |
| `customRulesStorage.js` | Web app only. Superseded by `fileRules.js` for CLI/MCP; two systems now coexist |
| `cli/python/` | Stale qcBot-era wrapper pointing at a dead package name |
| **Automated tests** | **None.** No test script, no test directory. Rules are verified manually against fixtures |

The missing test suite is the most significant gap for anyone taking this
further. The rule-integrity harness covers structural faults but not behaviour;
there is no regression net for the 530 rules.

### Known risks

- **Regex ceiling** (§2) — some rules will always be approximations.
- **Triple registration** — adding a stack means editing three `RUNNERS` maps.
  Easy to half-wire.
- **`index.js` divergence** — features added there silently skip CLI and CI.
- **Scoring is unweighted** — cross-stack score comparisons are not meaningful.

### On splitting `localAnalyzer.js`

The obvious tidy-up is to move Playwright's 65 rules into `src/analyzers/` like
the other 17 stacks. **Measure before attempting it.** The rules are not
independent: 14 function-scope variables span more than 200 lines, and several
— `xpathLocators`, `hardWaits`, `totalTests`, `hasUserFacingLocators` — are
computed by early rules and consumed 1000+ lines later by the metrics,
`positives` and `summary` blocks.

Splitting therefore means threading a shared context through all 65 rules, or
recomputing those values per file where they will drift. That is a restructure,
not a file move, and with no regression tests there is nothing to prove it
behaved identically afterwards.

Build the golden-master test first (snapshot every finding across a real suite,
assert unchanged output). Then the split becomes verifiable — and optional.

---

## 7. Operational notes

- Node 18+ to run; **build the binary with an nvm Node**. Some builds ship the
  SEA fuse string twice and injection fails with an opaque error — the build
  script checks this up front.
- `.env` was committed in the first commit and pushed. The value is a short stub,
  not a working key, but it is in the history.
- AI is strictly opt-in. Without `--ai`, nothing leaves the machine. With it,
  code snippets around flagged lines go to the chosen provider.
