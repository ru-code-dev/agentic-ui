"""Run a Node referee script of ``tests/agreement/`` on a JSON input (SV-C13 agreement tests).

The referees import ``@a2ui/agent`` and the contract from ``packages/ui-kit-one-catalog`` (its node_modules), so
the tests skip with a reason when ``node`` or the package dependencies are missing (``pnpm install``).
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
AGREEMENT = Path(__file__).resolve().parents[1] / "agreement"
CATALOG_PKG = REPO / "packages" / "ui-kit-one-catalog"
AGENT_LIB = CATALOG_PKG / "node_modules" / "@a2ui" / "agent" / "src" / "index.js"


def require_node() -> str:
    node = shutil.which("node")
    if node is None:
        raise unittest.SkipTest("node not on PATH")
    if not AGENT_LIB.is_file():
        raise unittest.SkipTest(f"{AGENT_LIB} missing (run pnpm install)")
    return node


def run_referee(script: str, payload: Any, *args: str, timeout: float = 120) -> Any:
    """``node tests/agreement/<script> <input.json>`` → parsed JSON stdout."""
    node = require_node()
    with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False)
    try:
        proc = subprocess.run(
            [node, str(AGREEMENT / script), handle.name, *args],
            cwd=REPO,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            check=False,
        )
    finally:
        Path(handle.name).unlink(missing_ok=True)
    if proc.returncode != 0:
        raise AssertionError(f"{script} exited {proc.returncode}:\n{proc.stderr[-4000:]}")
    return json.loads(proc.stdout)


def same_json(a: Any, b: Any) -> bool:
    """Structural JSON equality: numbers by value (1 == 1.0), booleans never equal numbers."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, int | float) and isinstance(b, int | float):
        return float(a) == float(b)
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same_json(a[k], b[k]) for k in a)
    if isinstance(a, list | tuple) and isinstance(b, list | tuple):
        return len(a) == len(b) and all(same_json(x, y) for x, y in zip(a, b, strict=True))
    return type(a) is type(b) and a == b
