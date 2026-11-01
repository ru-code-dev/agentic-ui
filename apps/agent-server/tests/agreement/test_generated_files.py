"""The server's Python-generated files in the build (A3-24, A3-29): refused when invalid, stale-checked like data/.

A3-24 (review attack/remap/r01): REMAP recipe 4 narrowed Text.textAlign to left/right; ``pnpm build`` exited 0 and
shipped a fallback naming ``textAlign: "center"`` (invalid UI as the bundle's own "sorry" surface).
A3-29 (attack/remap/r06): check:generated never compared validator-cases/cases.json, fallback.json or
SERVER-CONTRACT.md, so a stale or hand-edited copy (and its hand-over copy) passed.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from ..support.node import REPO, require_node

APP = REPO / "apps" / "agent-server"


def _without(node: object, token: str) -> None:
    """Drop ``token`` from every ``textAlign`` enum of a catalog (the recipe-4 edit)."""
    if isinstance(node, dict):
        if "textAlign" in node.get("properties", {}):
            enum = node["properties"]["textAlign"].get("enum")
            if isinstance(enum, list) and token in enum:
                enum.remove(token)
        for value in node.values():
            _without(value, token)
    elif isinstance(node, list):
        for item in node:
            _without(item, token)


class GeneratedFilesTest(unittest.TestCase):
    def test_invalid_fallback_stops_the_build(self) -> None:
        """[SV-C9, SV-C23] A3-24: with "center" gone from the contract, ``fallback --write`` (and so ``pnpm build``,
        via server-generate.sh) exits 1 naming textAlign and writes nothing; contract_doc refuses the same."""
        with tempfile.TemporaryDirectory(dir=REPO / "WORKFLOW" / "tmp") as tmp:
            src = Path(tmp) / "src"
            shutil.copytree(APP / "src", src, ignore=shutil.ignore_patterns("__pycache__"))
            catalog_file = src / "agentic_ui_server" / "data" / "catalog.json"
            catalog = json.loads(catalog_file.read_text(encoding="utf-8"))
            _without(catalog, "center")
            catalog_file.write_text(json.dumps(catalog), encoding="utf-8")
            env = {**os.environ, "PYTHONPATH": str(src)}
            for module in ("agentic_ui_server.conversation.fallback", "agentic_ui_server.http.contract_doc"):
                with self.subTest(module):
                    run = subprocess.run(
                        [sys.executable, "-m", module, "--write"], cwd=tmp, env=env, capture_output=True, text=True
                    )
                    self.assertEqual(run.returncode, 1, run.stderr)
                    self.assertIn("textAlign", run.stderr)
                    self.assertIn("invalid against the bundled contract", run.stderr)
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()), ["src"], "nothing written")

    def test_check_generated_compares_the_python_generated_files(self) -> None:
        """[SV-C23, DEC-034] A3-29: a hand edit of cases.json, fallback.json or SERVER-CONTRACT.md fails
        ``check:generated`` (the agent-server part) naming the file; restored afterwards."""
        node = require_node()
        for name in ("validator-cases/cases.json", "fallback.json", "SERVER-CONTRACT.md"):
            with self.subTest(name):
                path = APP / name
                original = path.read_bytes()
                try:
                    path.write_bytes(original + b"\n")
                    run = subprocess.run(
                        [node, str(APP / "scripts" / "check-generated.mjs")],
                        cwd=REPO,
                        capture_output=True,
                        text=True,
                        timeout=300,
                        check=False,
                    )
                finally:
                    path.write_bytes(original)
                self.assertEqual(run.returncode, 1, run.stdout)
                self.assertIn(name, run.stderr)


if __name__ == "__main__":
    unittest.main()
