"""
cli.py — Click-based command-line interface for the pw_quality Python package.

Installed as `qcbot-py` by pyproject.toml.
Thin shell over runner.py — all analysis runs in Node.js via npx.
"""

import sys

try:
    import click
except ImportError:
    print(
        "ERROR: 'click' is required. Install it with:  pip install qcbot[cli]",
        file=sys.stderr,
    )
    sys.exit(1)

from . import runner


# ── Formatting helpers ────────────────────────────────────────────────────────

def _grade_color(score: int) -> str:
    if score >= 90: return "bright_green"
    if score >= 75: return "cyan"
    if score >= 60: return "yellow"
    return "red"


def _sev_color(sev: str) -> str:
    return {"critical": "red", "warning": "yellow"}.get(sev, "cyan")


def _bar(score: int, width: int = 20) -> str:
    filled = round(score / 100 * width)
    return "█" * filled + "░" * (width - filled)


# ── CLI definition ────────────────────────────────────────────────────────────

@click.group()
@click.version_option("1.0.0", prog_name="qcbot-py")
def cli():
    """qcBot — Playwright & multi-stack test quality analyser (Python interface).\n
    The rule engine runs in Node.js (via npx @cqs/qcbot).
    Node.js 18+ must be available on your PATH.
    """


@cli.command()
@click.argument("path")
@click.option("-s", "--stack",       default="playwright", show_default=True, help="Rule set id.  Run `qcbot-py stacks` for options.")
@click.option("-t", "--threshold",   default=80, show_default=True, type=int,  help="Fail if score is below this (0–100).")
@click.option("-p", "--parallel",    default=4,  show_default=True, type=int,  help="Max files analysed in parallel.")
@click.option("--report",            is_flag=True,                             help="Generate self-contained HTML report.")
@click.option("--output",            default=None,                             help="Output directory for HTML/JSON reports.")
@click.option("--no-cross-file",     is_flag=True,                             help="Skip cross-file duplicate detection.")
@click.option("--project",           default=None,                             help="Project name shown in the HTML report header.")
@click.option("--json",   "json_out",is_flag=True,                             help="Print the full JSON result to stdout instead of the summary table.")
@click.option("--package",           default="@cqs/qcbot",             help="Override npm package name (for private registries).")
def check(path, stack, threshold, parallel, report, output, no_cross_file, project, json_out, package):
    """Analyse test files in PATH and report quality findings.

    PATH is a directory or glob that contains the spec/test files.

    \b
    Examples:
      qcbot-py check ./functional-tests
      qcbot-py check ./tests --stack pytest_api --threshold 75 --report
      qcbot-py check ./src/tests --json | jq '.score'
    """
    click.echo(f"\n⚡ qcBot  ·  stack: {stack}  ·  threshold: {threshold}\n")

    try:
        result = runner.check(
            path,
            stack=stack,
            threshold=threshold,
            parallel=parallel,
            report=report,
            output_dir=output,
            no_cross_file=no_cross_file,
            project=project,
            npm_package=package,
            verbose=False,
        )
    except runner.PwQualityError as exc:
        click.secho(f"✗ Error: {exc}", fg="red", err=True)
        sys.exit(2)

    if json_out:
        import json as _json, dataclasses
        def _serial(obj):
            if dataclasses.is_dataclass(obj):
                return dataclasses.asdict(obj)
            raise TypeError(f"Not serialisable: {type(obj)}")
        click.echo(_json.dumps(dataclasses.asdict(result), indent=2, default=_serial))
        sys.exit(0 if result.passed else 1)

    # ── Pretty terminal output ────────────────────────────────────────────────
    gc = _grade_color(result.score)
    click.echo("Results")
    click.echo("─" * 52)
    click.secho(f"  Score    {_bar(result.score)}  {result.score}  {result.grade}", fg=gc, bold=True)
    click.echo(f"  Files    {result.summary.files}")
    crit_color = "red" if result.summary.critical > 0 else "green"
    warn_color = "yellow" if result.summary.warnings > 0 else "green"
    click.secho(f"  Critical {result.summary.critical}", fg=crit_color, nl=False)
    click.echo("  ", nl=False)
    click.secho(f"Warnings {result.summary.warnings}", fg=warn_color, nl=False)
    click.echo(f"  Total {result.summary.total}")
    status_color = "green" if result.passed else "red"
    status_text  = "✓ PASSED" if result.passed else "✗ FAILED"
    click.secho(f"  Status   {status_text}  (threshold {threshold})", fg=status_color, bold=True)
    click.echo("─" * 52)

    # Per-file
    click.echo()
    click.echo("File breakdown")
    for fr in result.files:
        fc = _grade_color(fr.score)
        crit = fr.critical_count
        crit_label = click.style(f"{crit} crit  ", fg="red") if crit > 0 else click.style("✓      ", fg="green")
        click.echo(
            f"  {click.style(str(fr.score).rjust(3), fg=fc)}  "
            f"{_bar(fr.score, 14)}  "
            f"{crit_label}"
            f"{click.style(fr.name, fg='bright_black')}"
        )

    # Top findings
    top = [f for f in result.findings if f.severity in ("critical", "warning")][:10]
    if top:
        click.echo()
        click.echo("Top findings")
        for f in top:
            click.secho(f"  {f.severity.upper():<9}", fg=_sev_color(f.severity), bold=True, nl=False)
            click.echo(f" {f.title}")
            loc = f.file or ""
            if f.line:
                loc += f":{f.line}"
            click.secho(f"  {loc}  {f.rule_id}", fg="bright_black")

    # Report link
    if result.report_path:
        click.echo()
        click.secho(f"✓ HTML report → {result.report_path}", fg="green")
        click.echo(f"  Open: open {result.report_path}")

    click.echo()
    sys.exit(0 if result.passed else 1)


@cli.command()
@click.option("--package", default="@cqs/qcbot", help="Override npm package name.")
def stacks(package):
    """List all supported stacks (language/framework rule sets)."""
    try:
        all_stacks = runner.stacks(npm_package=package)
    except runner.PwQualityError as exc:
        click.secho(f"✗ Error: {exc}", fg="red", err=True)
        sys.exit(2)

    click.echo("\nSupported stacks\n")
    for s in all_stacks:
        click.secho(f"  {s['id']:<22}", fg="cyan", bold=True, nl=False)
        click.echo(s.get("label", ""))
    click.echo()


def main():
    cli()


if __name__ == "__main__":
    main()
