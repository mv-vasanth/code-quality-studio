# cqs — Code Quality Studio CLI

Audit your test files from the terminal. Supports every stack the UI supports:
Playwright, Cypress, Selenium, Appium, TOSCA, REST Assured, Postman, and more.

---

## Install

### One-time setup (from the repo)

```bash
cd playwright-quality-studio/cli
npm install          # installs esbuild
npm run build        # bundles everything → dist/cqs.js
npm install -g .     # registers the `cqs` command globally
```

### Upgrade

```bash
cd playwright-quality-studio/cli
npm run build
npm install -g .
```

---

## Usage

```
cqs [path...]  [options]
```

| Option | Description |
|---|---|
| `-s, --stack <id>` | Force a stack (default: auto-detected) |
| `-S, --severity <level>` | Filter: `all` · `critical` · `warning` · `info` |
| `-c, --category <id>` | Filter by category id |
| `-o, --output <fmt>` | `pretty` (default) · `json` · `summary` |
| `--no-color` | Disable ANSI colours |
| `--list-stacks` | Print all stack IDs and exit |
| `-h, --help` | Show help |

---

## Examples

```bash
# Analyse current folder (auto-detects stack)
cqs .

# Analyse a specific folder with a forced stack
cqs ./tests/ --stack cypress

# Show only critical findings
cqs ./e2e/ --severity critical

# Pipe JSON to a file for CI artefacts
cqs ./tests/ --output json > report.json

# Summary line (great for CI logs)
cqs ./tests/ --output summary

# Filter by category
cqs ./tests/ --category reliability

# Multiple paths
cqs ./src/tests/ ./e2e/ --stack playwright
```

---

## Available stacks

Run `cqs --list-stacks` to see all IDs. Quick reference:

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
| `restassured` | REST Assured |
| `karate` | Karate |
| `pytest_api` | pytest (API) |
| `postman` | Postman JSON |
| `java_api` | Java API |
| `typescript` | TypeScript |
| `python_api` | Python API |

---

## CI integration

`cqs` exits with code `1` when critical findings are found — plug it straight into
your pipeline:

```yaml
# GitHub Actions example
- name: Audit test quality
  run: cqs ./tests/ --output summary
  # fails the step if any critical finding exists
```

```bash
# Pre-commit hook  (~/.git/hooks/pre-commit)
cqs . --severity critical --output summary || exit 1
```

---

## Output formats

### `pretty` (default)
Coloured terminal output — file list, per-finding details, category score bars.

### `json`
Machine-readable — `{ stack, files, avgScore, summary, results[] }`.

### `summary`
One-line status: `cqs ⚡ Playwright TS/JS · 12 files · score 74 · 2 critical · 5 warning`
