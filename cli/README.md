# cqz — Code Quality Zone CLI

Audit your test and application code from the terminal. **544 rules across 18
stacks** — Playwright, Cypress, Selenium, Appium, TOSCA, REST Assured, Karate,
pytest, Postman, TypeScript, Java and Python.

No API key, no network, no telemetry. Every rule runs locally.

---

## Install

```bash
npm install -g cqz-audit
cqz --help
```

### Upgrade to the latest

```bash
npm install -g cqz-audit@latest
```

Check what you're on, and what's published:

```bash
cqz --help | head -2          # your installed version
npm view cqz-audit version    # latest on npm
```

> **Using nvm?** Global packages are installed **per Node version**. If you
> switch versions and `cqz` disappears or looks out of date, re-run the install
> under that version. `node --version` tells you which one you're on.

### Build from source

```bash
# from a checkout of the repository
cd code-quality-studio
npm install && npm run build     # builds the web app — needed for reports
cd cli
npm install
npm run build:all                # bundles the CLI and the MCP server
npm install -g .
```

Build the web app first. The CLI inlines it so `cqz --open` can emit a working
copy; without it, reports fall back to a flat HTML document.

---

## Quick start

```bash
cqz ./tests/
```

That's it. You get findings in the terminal **and** a full report opens in your
browser automatically.

---

## The report

`cqz` writes the entire Code Quality Zone UI into **one self-contained HTML
file** — no server, no internet. Email it to a colleague and it works on their
machine.

It carries every view: Overview, Files, Findings, Rule Settings, Coverage
Radar, Roadmap and the practices checklist.

```bash
cqz ./tests/                 # report opens automatically
cqz ./tests/ --no-report     # terminal output only
cqz ./tests/ --open          # force it even when piped or in CI
```

Reports are skipped automatically for `--output json` / `--output summary` and
when output isn't a terminal, so pipelines stay clean.

---

## The studio, on your machine

The CLI carries the full web app inside it, so one command runs both:

```bash
cd ~/my-project
cqz serve --open
```

That starts a local server on `http://127.0.0.1:4000` and opens the studio it
serves. The page arrives already signed in — there is no token to copy and no
second port, because the app and the API share an origin.

From there you can scan a folder straight off disk instead of picking files
through the browser, and read findings grouped by rule with the offending lines
shown in context.

| | |
|---|---|
| `cqz serve --open` | server **and** studio |
| `cqz serve` | just the API, for scripts and `curl` |
| `cqz serve --port 4005` | when 4000 is taken |
| `cqz serve --allow-write` | let the agents edit files — off by default |

**Which paths it can scan.** Relative paths resolve from *where you started
`serve`*, not from the repo or the browser; absolute paths reach anywhere on the
machine. `~/tests` will not work — your shell expands `~`, and the API never
sees a shell.

**Safe by default:** bound to `127.0.0.1` only, a random token per run required
on every request except `/health`, an origin allowlist, and no writes unless you
ask for them.

## Usage

```
cqz [path...] [options]
cqz remediate [path...]      AI-fix findings, verifying each fix before keeping it
cqz pr-review                Review a pull request with inline GitHub comments
```

| Option | Description |
|---|---|
| `-s, --stack <id>` | Force a stack (default: auto-detected) |
| `-S, --severity <level>` | Filter: `all` · `critical` · `warning` · `info` |
| `-c, --category <id>` | Filter by category id |
| `-o, --output <fmt>` | `pretty` (default) · `json` · `summary` |
| `--open` | Force the report even when piped or in CI |
| `--no-report` | Skip the report for this run |
| `--rules <file>` | Use a specific `cqz-rules.json` |
| `--no-rules` | Ignore any project rules file |
| `--no-color` | Disable ANSI colours |
| `--list-stacks` | Print all stack IDs and exit |
| `-r, --read-report <file>` | Summarise a saved JSON report |
| `-h, --help` | Show help |

---

## Examples

```bash
# Analyse the current folder (auto-detects the stack)
cqz .

# Force a stack
cqz ./tests/ --stack cypress

# Only the things that matter today
cqz ./e2e/ --severity critical

# One category
cqz ./tests/ --category reliability

# Machine-readable, for CI artefacts
cqz ./tests/ --output json > report.json

# One line, for CI logs
cqz ./tests/ --output summary

# Several paths at once
cqz ./src/tests/ ./e2e/ --stack playwright
```

Filters apply to every output mode, including `summary`.

---

## Agents

Two agents go beyond reporting. Both need an AI provider key.

```bash
# Fix critical findings automatically. Every edit is re-audited before it is
# kept — an edit that introduces a new critical is rejected.
cqz remediate ./tests/ --ai anthropic --dry-run

# Review a pull request, leaving inline comments on the changed lines
cqz pr-review --repo owner/name --pr 42 --token "$GITHUB_TOKEN" --ai anthropic
```

Add `--commit` to have `remediate` commit its accepted fixes, `--max-files` to
bound a run. Without `--dry-run` it writes to your working tree, so run it on a
clean checkout.

---

## Use it from your AI assistant (MCP)

An MCP server ships in the same package, so Claude Desktop, Claude Code or
Cursor can run audits for you:

```bash
claude mcp add cqz node "$(npm root -g)/cqz-audit/dist/cqz-mcp.js"
```

Seven tools: `cqz_audit`, `cqz_report`, `cqz_list_stacks`, `cqz_list_rules`,
`cqz_validate_rules`, `cqz_test_rule`, `cqz_read_report`. `cqz_report` writes
the same self-contained report the CLI does.

A full walkthrough for every client ships with the source, in
`docs/MCP_GUIDE.md`.

---

## What gets audited

This is a test-quality tool, so **test automation is audited by default** and
application code is opt-in. On a real monorepo the application code
outnumbers the tests several times over — one has 926 test files against
3,176 application files — and auditing everything buries the findings you
came for.

```bash
cqz .              # test automation only (default)
cqz . --app        # tests plus application code
cqz . --app-only   # application code only
```

Skipped files are reported rather than hidden, so you always know what was
left out:

```
3176 application file(s) not audited (TypeScript · Frontend (React), …) — add --app to include them.
```

Naming a stack explicitly always wins: `cqz ./src --stack ts_frontend`.

## Adopting it on an existing suite

A real suite does not start clean. Gate on *new* findings instead of all of
them:

```bash
cqz ./tests --baseline-write .cqz-baseline.json   # accept today's reality
cqz ./tests --baseline .cqz-baseline.json         # fails only on new findings
```

Commit the baseline file. Existing debt stays visible but non-blocking; the
suite cannot get worse. When someone fixes debt, the run reports it so you can
re-record and lock the gain in.

Findings are keyed by file and rule, counted — not by line number, which moves
whenever anyone edits above a finding. So it can tell you a file gained a third
hard wait, but not which occurrence is new.

### Audit only what changed

```bash
cqz --changed                     # vs origin/main
cqz --changed --since develop
```

Covers committed, staged, unstaged and untracked files. Pairs naturally with
the baseline for a pull-request gate:

```bash
cqz --changed --baseline .cqz-baseline.json
```

## CI integration

`cqz` exits `1` when critical findings exist, so it plugs straight in:

```yaml
- name: Audit test quality
  run: cqz ./tests/ --output summary
```

```bash
# Pre-commit hook (.git/hooks/pre-commit)
cqz . --severity critical --output summary || exit 1
```

Filtering the display never hides a failing build: criticals set the exit code
even when you filter the output to something else.

---

## Project rules

Drop a `cqz-rules.json` beside your tests to add team-specific checks. `cqz`
discovers it by walking up from the audited path, stopping at `.git`.

```json
{
  "rules": [{
    "id": "TEAM-001",
    "stack": "playwright",
    "severity": "warning",
    "category": "selectors",
    "pattern": "getByTestId\\(['\"]tmp-",
    "title": "Temporary test id left in a locator",
    "fix": "Replace tmp-* ids with a stable role or label."
  }]
}
```

Validate and try rules before committing them with `cqz_validate_rules` and
`cqz_test_rule` over MCP.

---

## Stacks

`cqz --list-stacks` prints them all.

| ID | Stack |
|---|---|
| `playwright` | Playwright TS/JS |
| `playwright_java` | Playwright Java |
| `playwright_python` | Playwright Python |
| `cypress` | Cypress TS/JS |
| `selenium_java` | Selenium Java |
| `selenium_csharp` | Selenium C# |
| `appium_java` | Appium Java |
| `tosca_xml` | TOSCA XML export |
| `restassured` | REST Assured (Java) |
| `karate` | Karate (API DSL) |
| `pytest_api` | pytest (API) |
| `postman` | Postman collection |
| `java_api` | Java API |
| `java_frontend` | Java (core) |
| `typescript` | TypeScript |
| `ts_frontend` | TypeScript frontend |
| `python_api` | Python API |
| `python_frontend` | Python frontend |

---

## Output formats

**`pretty`** (default) — coloured terminal output plus the browser report.

**`json`** — `{ stack, files, avgScore, summary, results[] }`.

**`summary`** — one line:
`cqz 🎭 Playwright (TS / JS) · 76 files · score 90 · 288 critical · 60 warning`

---

## Documentation

Shipped inside the package, so they are available offline after install — look
in `node_modules/cqz-audit/docs/`, or read them on GitHub:

| Guide | Covers |
|---|---|
| [MCP_GUIDE.md](https://github.com/mv-vasanth/code-quality-studio/blob/main/docs/MCP_GUIDE.md) | Driving cqz from an AI assistant, written from scratch |
| [CURSOR_SETUP.md](https://github.com/mv-vasanth/code-quality-studio/blob/main/docs/CURSOR_SETUP.md) | Step-by-step Cursor setup, with the nvm and PATH traps |
| [SCORING.md](https://github.com/mv-vasanth/code-quality-studio/blob/main/docs/SCORING.md) | How scores and category scores are calculated |
| [MULTI_STACK.md](https://github.com/mv-vasanth/code-quality-studio/blob/main/docs/MULTI_STACK.md) | How files are routed to stacks in a polyglot repo |
| [CUSTOM_RULES_PROPOSAL.md](https://github.com/mv-vasanth/code-quality-studio/blob/main/docs/CUSTOM_RULES_PROPOSAL.md) | Writing and testing your own rules |
| [ARCHITECTURE_OVERVIEW.md](https://github.com/mv-vasanth/code-quality-studio/blob/main/docs/ARCHITECTURE_OVERVIEW.md) | How the analysis engine works, and its limits |

A longer handbook (32 pages, PDF) lives in the repository under `docs/` — it is
not shipped in the package to keep the install small.

To find the docs after installing:

```bash
ls "$(npm root -g)/cqz-audit/docs"
```

## Links

- [Repository](https://github.com/mv-vasanth/code-quality-studio)
- [Issues](https://github.com/mv-vasanth/code-quality-studio/issues)
