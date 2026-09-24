"""
runner.py — Core subprocess bridge from Python to the Node.js qcBot CLI.

All heavy lifting (rule engine, analysis, report building) stays in Node.js.
This module only shells out and parses the JSON result back into Python objects.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class Finding:
    rule_id: str
    severity: str          # "critical" | "warning" | "info"
    title: str
    category: str
    line: int | None
    description: str
    file: str = ""

    @staticmethod
    def from_dict(d: dict, file: str = "") -> "Finding":
        return Finding(
            rule_id=d.get("ruleId", ""),
            severity=d.get("severity", "info"),
            title=d.get("title", ""),
            category=d.get("category", ""),
            line=d.get("line"),
            description=d.get("description", ""),
            file=file,
        )


@dataclass
class FileResult:
    name: str
    path: str
    score: int
    findings: list[Finding] = field(default_factory=list)

    @property
    def critical_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "critical")

    @staticmethod
    def from_dict(d: dict) -> "FileResult":
        findings = [Finding.from_dict(f, file=d.get("name", "")) for f in d.get("findings", [])]
        return FileResult(
            name=d.get("name", ""),
            path=d.get("path", ""),
            score=d.get("score", 0),
            findings=findings,
        )


@dataclass
class Summary:
    critical: int
    warnings: int
    total: int
    files: int

    @staticmethod
    def from_dict(d: dict) -> "Summary":
        return Summary(
            critical=d.get("critical", 0),
            warnings=d.get("warnings", 0),
            total=d.get("total", 0),
            files=d.get("files", 0),
        )


@dataclass
class PwQualityResult:
    """Structured result returned by check()."""
    project_name: str
    stack_id: str
    run_at: str
    score: int
    grade: str
    passed: bool
    threshold: int
    summary: Summary
    files: list[FileResult]
    report_path: str | None = None
    json_path: str | None = None

    @property
    def findings(self) -> list[Finding]:
        """Flat list of all findings across all files."""
        return [f for fr in self.files for f in fr.findings]

    @property
    def critical_findings(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "critical"]

    @staticmethod
    def from_dict(d: dict) -> "PwQualityResult":
        return PwQualityResult(
            project_name=d.get("projectName", ""),
            stack_id=d.get("stackId", ""),
            run_at=d.get("runAt", ""),
            score=d.get("score", 0),
            grade=d.get("grade", ""),
            passed=d.get("passed", False),
            threshold=d.get("threshold", 80),
            summary=Summary.from_dict(d.get("summary", {})),
            files=[FileResult.from_dict(f) for f in d.get("files", [])],
        )


class PwQualityError(RuntimeError):
    """Raised when the qcBot CLI exits with an unexpected error."""
    pass


# ── Node.js bootstrap ─────────────────────────────────────────────────────────

def _find_node() -> str:
    """Return the path to node, or raise PwQualityError."""
    node = shutil.which("node")
    if not node:
        raise PwQualityError(
            "Node.js not found. Install Node.js 18+ from https://nodejs.org "
            "and make sure it is on your PATH."
        )
    # Version check (need ≥ 18)
    try:
        out = subprocess.check_output([node, "--version"], text=True).strip()
        major = int(out.lstrip("v").split(".")[0])
        if major < 18:
            raise PwQualityError(
                f"Node.js 18+ required; found {out}. "
                "Upgrade at https://nodejs.org"
            )
    except (ValueError, subprocess.CalledProcessError):
        pass  # can't parse — proceed anyway
    return node


def _find_npx() -> str:
    """Return path to npx, or raise PwQualityError."""
    npx = shutil.which("npx")
    if not npx:
        raise PwQualityError(
            "npx not found. Install Node.js 18+ (it bundles npx) "
            "from https://nodejs.org"
        )
    return npx


# ── Public API ────────────────────────────────────────────────────────────────

def check(
    path: str | os.PathLike,
    *,
    stack: str = "playwright",
    threshold: int = 80,
    parallel: int = 4,
    report: bool = False,
    output_dir: str | None = None,
    no_cross_file: bool = False,
    project: str | None = None,
    npm_package: str = "@cqs/qcbot",
    verbose: bool = False,
) -> PwQualityResult:
    """
    Analyse test files in *path* and return a :class:`PwQualityResult`.

    Parameters
    ----------
    path:           Directory or glob containing test files to analyse.
    stack:          Rule set id (e.g. 'playwright', 'typescript', 'pytest_api').
    threshold:      Minimum passing score 0–100.
    parallel:       Maximum files analysed simultaneously.
    report:         If True, also write a self-contained HTML report.
    output_dir:     Where to write HTML/JSON reports (default: ./qcbot-report).
    no_cross_file:  Skip cross-file duplicate detection.
    project:        Project name shown in the HTML report header.
    npm_package:    The npm package name (override for private registry).
    verbose:        Print the raw CLI output to stdout while running.

    Returns
    -------
    PwQualityResult with score, passed, findings, per-file breakdown, etc.

    Raises
    ------
    PwQualityError  if Node.js is not found or the CLI crashes unexpectedly.
    """
    _find_node()
    npx = _find_npx()
    abs_path = str(Path(path).resolve())

    # We always write JSON so we can parse the result back
    tmp_json = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
    tmp_json.close()
    json_file = tmp_json.name

    cmd = [
        npx, "--yes", npm_package,
        "check", abs_path,
        "--stack", stack,
        "--threshold", str(threshold),
        "--parallel", str(parallel),
        "--json", json_file,
        "--summary",                    # keep terminal output quiet; Python caller has the object
    ]
    if report:
        cmd.append("--report")
    if output_dir:
        cmd += ["--output", output_dir]
    if no_cross_file:
        cmd.append("--no-cross-file")
    if project:
        cmd += ["--project", project]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=not verbose,
            text=True,
        )
    except FileNotFoundError as exc:
        raise PwQualityError(f"Failed to run npx: {exc}") from exc

    # Exit codes: 0 = passed, 1 = failed (score < threshold) — both are valid
    if proc.returncode not in (0, 1):
        stderr = proc.stderr or ""
        raise PwQualityError(
            f"qcBot exited with code {proc.returncode}.\n{stderr[:800]}"
        )

    try:
        raw = json.loads(Path(json_file).read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError) as exc:
        raise PwQualityError(f"Could not read JSON report: {exc}") from exc
    finally:
        try:
            os.unlink(json_file)
        except OSError:
            pass

    result = PwQualityResult.from_dict(raw)

    if report:
        out = output_dir or "./qcbot-report"
        result.report_path = str(Path(out) / "report.html")
        result.json_path = str(Path(out) / "report.json")

    return result


def stacks(npm_package: str = "@cqs/qcbot") -> list[dict]:
    """
    Return the list of supported stacks from the CLI.

    Returns a list of dicts: [{"id": "playwright", "name": "...", "hint": "..."}, ...]
    """
    _find_node()
    npx = _find_npx()
    try:
        out = subprocess.check_output(
            [npx, "--yes", npm_package, "stacks"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError as exc:
        raise PwQualityError(f"Could not list stacks: {exc}") from exc

    results = []
    for line in out.splitlines():
        line = line.strip()
        if not line or line.startswith("Supported"):
            continue
        # Strip ANSI codes
        import re
        clean = re.sub(r"\x1b\[[0-9;]*m", "", line).strip()
        if clean:
            parts = clean.split()
            if parts:
                results.append({"id": parts[0], "label": " ".join(parts[1:])})
    return results
