"""Build the zipapp into a temp dir and run it (or the package) as a real server process (P7 smoke tests)."""

import importlib.util
import re
import shutil
import signal
import subprocess
import sys
import threading
import unittest
from pathlib import Path

from .tiers import APP_DIR

BUILD_SCRIPT = APP_DIR / "scripts" / "build_pyz.py"


def build_script():
    spec = importlib.util.spec_from_file_location("build_pyz", BUILD_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_into(tmp: Path) -> Path:
    """A fresh pyz built from the current tree, copied alone into an empty ``tmp/run`` dir."""
    built = build_script().build(tmp / "build" / "agentic-ui-server.pyz")
    run = tmp / "run"
    run.mkdir()
    return Path(shutil.copy2(built, run / built.name))


def run_pyz(pyz: Path, *args: str, env: dict[str, str], timeout: float = 60) -> subprocess.CompletedProcess:
    """``python -I app.pyz …`` from the pyz's own (otherwise empty) dir: no PYTHONPATH, no site, no source tree."""
    argv = [sys.executable, "-I", str(pyz), *args]
    return subprocess.run(argv, capture_output=True, text=True, env=env, cwd=pyz.parent, timeout=timeout, check=False)


class ServerProcess:
    """A serving process; ``url`` from its "listening on" log line; ``stop()`` = SIGTERM, returns (exit, stderr)."""

    def __init__(self, test: unittest.TestCase, argv: list[str], env: dict[str, str], cwd: Path) -> None:
        self.proc = subprocess.Popen(argv, stderr=subprocess.PIPE, text=True, env=env, cwd=cwd)
        test.addCleanup(self.proc.stderr.close)
        test.addCleanup(self.proc.kill)
        timer = threading.Timer(60, self.proc.kill)
        timer.start()
        test.addCleanup(timer.cancel)
        self.lines: list[str] = []
        while not (match := re.search(r"listening on (http://\S+)", "".join(self.lines))):
            line = self.proc.stderr.readline()
            test.assertTrue(line, "server exited before listening:\n" + "".join(self.lines))
            self.lines.append(line)
        self.url = match.group(1)

    def stop(self) -> tuple[int, str]:
        self.proc.send_signal(signal.SIGTERM)
        rest = self.proc.stderr.read()
        return self.proc.wait(15), "".join(self.lines) + rest
