# qcBot — Python package

> **Python interface for the qcBot test quality analyser.**
> The rule engine runs in **Node.js** (via `npx @cqs/qcbot`).
> Node.js 18+ must be on your PATH — the package checks for it at call time.

---

## Why Python?

The rule engine is written in JavaScript/TypeScript and runs in Node.js.
This Python package is a **thin subprocess bridge** — the same pattern
Playwright itself uses for its Python SDK.

- Zero rule duplication — one engine, many language wrappers
- Returns structured Python objects (`PwQualityResult`, `FileResult`, `Finding`)
- CLI (`qcbot-py check`) produces the same colour output as the Node.js CLI
- Works in Python 3.9+

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Python | 3.9+ |
| Node.js + npx | **18+** (checked at runtime) |

---

## Installation

```bash
# Library only (use as import)
pip install qcbot

# Library + command-line tool
pip install "qcbot[cli]"
```

---

## Quickstart — CLI

```bash
# Analyse a folder, fail if score < 80, generate HTML report
qcbot-py check ./functional-tests --threshold 80 --report

# List all supported stacks
qcbot-py stacks

# Get JSON output (pipe into jq, scripts, etc.)
qcbot-py check ./tests --json | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['score'], r['passed'])"
```

---

## Quickstart — Python API

```python
from pw_quality import check

# Basic check
result = check("./functional-tests", threshold=80)

print(result.score)        # 87
print(result.passed)       # True
print(result.grade)        # "Good"
print(result.summary)      # Summary(critical=12, warnings=34, total=284, files=168)

# Per-file breakdown
for file in result.files:
    print(f"{file.score:3}  {file.name}  ({file.critical_count} critical)")

# All findings
for finding in result.findings:
    print(f"[{finding.severity}] {finding.title} — {finding.file}:{finding.line}")

# Critical findings only
criticals = result.critical_findings
```

---

## API Reference

### `check(path, *, stack, threshold, ...) → PwQualityResult`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | str / Path | — | Directory with test files |
| `stack` | str | `"playwright"` | Rule set id (`"typescript"`, `"pytest_api"`, …) |
| `threshold` | int | `80` | Minimum passing score |
| `parallel` | int | `4` | Parallel workers |
| `report` | bool | `False` | Write HTML report to disk |
| `output_dir` | str | `None` | Override report output directory |
| `no_cross_file` | bool | `False` | Skip cross-file duplicate detection |
| `project` | str | `None` | Project name in HTML report |
| `npm_package` | str | `"@cqs/qcbot"` | Override for private npm registry |
| `verbose` | bool | `False` | Print raw CLI output to stdout |

### `PwQualityResult`

| Attribute | Type | Description |
|-----------|------|-------------|
| `score` | int | Average quality score 0–100 |
| `passed` | bool | True if score ≥ threshold |
| `grade` | str | "Excellent" / "Good" / "Fair" / "Needs work" |
| `threshold` | int | Threshold used for this run |
| `summary` | Summary | `.critical`, `.warnings`, `.total`, `.files` |
| `files` | list[FileResult] | Per-file breakdown |
| `findings` | list[Finding] | All findings (flat, all files) |
| `critical_findings` | list[Finding] | Only severity=critical |
| `report_path` | str or None | Path to HTML report if `report=True` |

---

## CI / CD Integration

### GitHub Actions

```yaml
- name: Install qcbot
  run: pip install "qcbot[cli]"

- name: Quality Gate
  run: qcbot-py check ./tests --threshold 80 --report

- name: Upload report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: quality-report
    path: qcbot-report/report.html
```

### pytest integration

```python
# conftest.py — add quality gate as a pytest fixture / session hook
import pytest
from pw_quality import check, PwQualityError

def pytest_sessionfinish(session, exitstatus):
    try:
        result = check("./tests", threshold=80)
        if not result.passed:
            print(f"\n⚠  Quality gate FAILED — score {result.score} < 80")
    except PwQualityError as e:
        print(f"\n⚠  qcBot not available: {e}")
```

### Django / Flask API endpoint

```python
from pw_quality import check, PwQualityResult

@app.post("/api/quality-gate")
def quality_gate():
    data = request.json
    result: PwQualityResult = check(
        data["path"],
        stack=data.get("stack", "playwright"),
        threshold=data.get("threshold", 80),
    )
    return {
        "score":    result.score,
        "passed":   result.passed,
        "grade":    result.grade,
        "critical": result.summary.critical,
        "findings": [
            {"rule": f.rule_id, "severity": f.severity, "title": f.title, "line": f.line}
            for f in result.findings
        ],
    }
```

### Jenkins (Python-based pipeline)

```python
# Jenkinsfile (python-pipeline plugin) or a build script
from pw_quality import check

result = check("./functional-tests", threshold=80, report=True)
print(f"Quality score: {result.score} — {'PASSED' if result.passed else 'FAILED'}")
if not result.passed:
    raise SystemExit(1)   # Fails the Jenkins step
```

---

## Supported stacks

```bash
qcbot-py stacks
```

Includes: `playwright`, `typescript`, `java_api`, `restassured`, `karate`,
`pytest_api`, `postman`, `python_api`, `ts_frontend`, `python_frontend`,
`playwright_java`, `playwright_python`, and more.

---

## Error handling

```python
from pw_quality import check, PwQualityError

try:
    result = check("./tests")
except PwQualityError as e:
    print(f"Analysis failed: {e}")
    # Common causes:
    # - Node.js not found  → install Node 18+
    # - npx not available  → ships with Node; re-install
    # - Unknown stack      → run qcbot-py stacks
```

---

## FAQ

**Q: Does it send my code anywhere?**
> No. All rule-based analysis runs locally in Node.js. Only if you pass `--llm` to the underlying CLI does it contact an AI provider, using your own API key.

**Q: Do I need to install `@cqs/qcbot` separately?**
> No — `npx` downloads and caches it automatically on first run.

**Q: Can I use a private npm registry?**
> Yes: `check(path, npm_package="@cqs/qcbot")` and set `NPM_TOKEN` in your environment.

---

## Licence

MIT — © Your Company
