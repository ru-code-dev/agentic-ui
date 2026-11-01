"""Test tiers (PLAN §1): ``AGENTIC_UI_TEST_TIERS`` selects tiers (default ``1,2,3``); tier 4 is opt-in.

Each integration test calls ``require(tier, ...)``, which skips with a reason when the tier is off or a
prerequisite is missing; with ``AGENTIC_UI_TEST_STRICT=1`` (``scripts/server-tests.sh``, i.e. ``pnpm check``)
a missing prerequisite of an enabled tier fails instead, so proofs never turn into silent skips.
Also builds isolated ``Settings`` whose writes stay inside a temp dir.
"""

import json
import os
import platform
import shlex
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

from agentic_ui_server.config import load_settings
from agentic_ui_server.settings import Settings

APP_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = APP_DIR / "src"
SCRIPTED_AGENT = Path(__file__).with_name("scripted_agent.py")
# The owner's read-only ru-code checkout next to this repo (<parent>/t3-ru-code, INTENT §5).
FAKE_ACP = Path(
    os.environ.get(
        "AGENTIC_UI_TEST_FAKE_ACP",
        str(APP_DIR.parents[2] / "t3-ru-code/ru-code/apps/server/src/ru-code/tests/qwen/fake-acp/fake-acp-server.ts"),
    )
)
# Project-local dev environment (SV-C18, scripts/setup-workflow.sh): everything under <repo>/WORKFLOW/.
WORKFLOW_DIR = APP_DIR.parents[1] / "WORKFLOW"
WORKFLOW_TOOLS = WORKFLOW_DIR / "tools" / f"{platform.system().lower()}-{platform.machine()}"
QWEN_CLI = Path(os.environ.get("AGENTIC_UI_TEST_QWEN_CLI", str(WORKFLOW_TOOLS / "qwen-code/dist/cli.js")))
QWEN_HOME = Path(os.environ.get("AGENTIC_UI_TEST_QWEN_HOME", str(WORKFLOW_DIR / "qwen-home")))
# Machine-local test LLM endpoint (base URL, key, models, default) — gitignored, generic variable names only.
LLM_ENV = Path(os.environ.get("AGENTIC_UI_TEST_LLM_ENV", str(WORKFLOW_DIR / "llm.env")))
NODE = os.environ.get("AGENTIC_UI_TEST_NODE", "node")


def enabled_tiers() -> set[str]:
    return {t.strip() for t in os.environ.get("AGENTIC_UI_TEST_TIERS", "1,2,3").split(",") if t.strip()}


def strict() -> bool:
    return os.environ.get("AGENTIC_UI_TEST_STRICT", "") == "1"


def require(tier: int, *paths: Path) -> None:
    """Skip the calling test unless ``tier`` is enabled and every path exists (strict: a missing path fails)."""
    if str(tier) not in enabled_tiers():
        raise unittest.SkipTest(f"tier {tier} not in AGENTIC_UI_TEST_TIERS={','.join(sorted(enabled_tiers()))}")
    for path in paths:
        if path.exists():
            continue
        if strict():
            raise AssertionError(
                f"tier {tier} prerequisite missing: {path} (AGENTIC_UI_TEST_STRICT=1: an enabled tier must run; "
                "install it, or set AGENTIC_UI_TEST_STRICT=0 to skip it knowingly)"
            )
        raise unittest.SkipTest(f"tier {tier} prerequisite missing: {path}")


def temp_dir(test: unittest.TestCase) -> Path:
    """A fresh temp dir removed when the test ends (tests write nowhere else)."""
    path = Path(tempfile.mkdtemp(prefix="agentic-ui-test-"))  # tempfile.tempdir = WORKFLOW/tmp (tests/__init__.py)
    test.addCleanup(shutil.rmtree, path, True)
    return path


def base_environ(tmp: Path) -> dict[str, str]:
    """A minimal process env for tests: no inherited secrets, HOME inside the temp dir."""
    home = tmp / "home"
    home.mkdir(parents=True, exist_ok=True)
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(home),
        "LANG": "C.UTF-8",
        "TMPDIR": str(tmp),
        "NO_PROXY": "127.0.0.1,localhost",
    }


def make_settings(tmp: Path, sets: dict[str, str] | None = None, environ: dict[str, str] | None = None) -> Settings:
    """Settings with work/cache dirs in ``tmp``, no env inheritance, plus ``--set`` overrides."""
    values = {
        "agent.work_root": str(tmp / "work"),
        "agent.cache_dir": str(tmp / "cache"),
        "agent.inherit_env": "false",
        "log.level": "WARNING",
    }
    values.update(sets or {})
    argv = [arg for key, value in values.items() for arg in ("--set", f"{key}={value}")]
    return load_settings(argv, environ if environ is not None else base_environ(tmp))


def llm_env() -> dict[str, str]:
    """The machine-local test LLM settings from ``LLM_ENV`` (``AGENTIC_UI_LLM_*``); empty when the file is absent."""
    if not LLM_ENV.exists():
        return {}
    out: dict[str, str] = {}
    for line in LLM_ENV.read_text(encoding="utf-8").splitlines():
        name, sep, value = line.strip().removeprefix("export ").partition("=")
        if sep and name.strip().startswith("AGENTIC_UI_LLM"):
            out[name.strip()] = value.strip().strip("'\"")
    return out


def llm_provider_args(env: dict[str, str]) -> list[str]:
    """``--auth-type openai --model <default> --openai-base-url <base>`` from an ``llm_env()`` mapping."""
    return [
        "--auth-type",
        "openai",
        "--model",
        env.get("AGENTIC_UI_LLM_DEFAULT", ""),
        "--openai-base-url",
        env.get("AGENTIC_UI_LLM_BASE_URL", ""),
    ]


def llm_endpoint_up(env: dict[str, str], timeout: float = 2.0) -> bool:
    """True when the test LLM base URL answers ``GET /models`` (tier-4 gate: skip when the endpoint is down)."""
    import urllib.error
    import urllib.request

    base = env.get("AGENTIC_UI_LLM_BASE_URL", "").rstrip("/")
    key = env.get("AGENTIC_UI_LLM_KEY", "")
    if not base:
        return False
    request = urllib.request.Request(f"{base}/models", headers={"Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        return False


def scripted_settings(tmp: Path, script: dict, sets: dict[str, str] | None = None) -> tuple[Settings, Path]:
    """Settings that run ``scripted_agent.py`` with ``script``; returns them plus the record file path."""
    record = tmp / "record.jsonl"
    script_path = tmp / "script.json"
    script_path.write_text(json.dumps({"record": str(record), **script}), encoding="utf-8")
    values = {
        "agent.bin": sys.executable,
        "agent.base_args": shlex.join(["-I", str(SCRIPTED_AGENT)]),
        "agent.acp_flag": "",
        "agent.auth_method": "",
        "agent.env": f"SCRIPTED_AGENT_SCRIPT={script_path}",
        "timeouts.start_s": "10",
        "timeouts.turn_s": "10",
        "timeouts.cancel_grace_s": "1",
        "timeouts.kill_grace_s": "1",
    }
    values.update(sets or {})
    return make_settings(tmp, values), record


def read_record(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def boot_sessions(path: Path) -> list[str]:
    """The session id each scripted agent process announced at boot (its ``session/new`` answer), in spawn order."""
    return [entry["sessionId"] for entry in read_record(path) if entry.get("event") == "boot"]


def methods(path: Path) -> list[str]:
    return [entry["method"] for entry in read_record(path) if "method" in entry]
