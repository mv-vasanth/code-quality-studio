"""
pw_quality — Python interface for the qcBot CLI.

The rule engine lives in Node.js (npm: @cqs/qcbot).
This package is a thin wrapper that:
  1. Checks Node.js ≥ 18 is available
  2. Optionally bootstraps the npm package via npx
  3. Calls the CLI as a subprocess and returns structured Python objects

Usage
-----
from pw_quality import check, stacks

result = check("./functional-tests", threshold=80, report=True)
print(result.score, result.passed, result.findings)
"""

from .runner import check, stacks, PwQualityResult, PwQualityError

__all__ = ["check", "stacks", "PwQualityResult", "PwQualityError"]
__version__ = "1.0.0"
