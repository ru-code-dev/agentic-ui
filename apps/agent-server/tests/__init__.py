"""Test package: puts ``src/`` on ``sys.path`` so ``agentic_ui_server`` imports without installation.

Temp files go to ``<repo>/WORKFLOW/tmp/tests`` (SV-C18: nothing written outside the project) unless ``TMPDIR``
already points into the repo.
Package logs are silenced unless ``AGENTIC_UI_TEST_LOG`` is set (expected failures log tracebacks).
"""

import logging
import os
import sys
import tempfile
from pathlib import Path

_SRC = str(Path(__file__).resolve().parents[1] / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

if not os.environ.get("AGENTIC_UI_TEST_LOG"):
    _logger = logging.getLogger("agentic_ui_server")
    _logger.addHandler(logging.NullHandler())
    _logger.propagate = False

_REPO = Path(__file__).resolve().parents[3]
if not str(Path(tempfile.gettempdir()).resolve()).startswith(str(_REPO)):
    _TMP = _REPO / "WORKFLOW" / "tmp" / "tests"
    _TMP.mkdir(parents=True, exist_ok=True)
    tempfile.tempdir = str(_TMP)
