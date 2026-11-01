"""Tier 4 (opt-in): real qwen-code + the machine's test LLM endpoint (INTENT §7, PLAN §3.2). Exactly 3 small model
calls on the default model.

Runs only when ``4`` is in ``AGENTIC_UI_TEST_TIERS`` and ``WORKFLOW/llm.env`` exists with a reachable endpoint
(see ``tiers.require_llm``). Uses a temp copy of the qwen home (history excluded); the API key is read from
``llm.env`` and reaches only the child env via ``Settings.environ`` + passthrough (never ``agent.env``, never
printed). Provider flags (base URL + default model) are composed from ``llm.env`` and passed via
``AGENTIC_UI_AGENT_EXTRA_ARGS`` (SV-C15: never code defaults). No ``agent.mode`` is set.
"""

import asyncio
import io
import logging
import shlex
import shutil
import subprocess
import sys
import time
import unittest
from pathlib import Path

from agentic_ui_server.agent.session import AgentSession
from agentic_ui_server.log import LOGGER_NAME, RedactingFilter
from agentic_ui_server.resources import agent_files

from ..support.tiers import (
    APP_DIR,
    LLM_ENV,
    QWEN_CLI,
    QWEN_HOME,
    SRC_DIR,
    base_environ,
    llm_endpoint_up,
    llm_env,
    llm_provider_args,
    make_settings,
    require,
    temp_dir,
)

DEV_CONFIG = APP_DIR / "config.dev.toml"
# The key env var qwen reads (modelProviders envKey) and the names passed through to the child.
LLM_KEY_VAR = "AGENTIC_UI_LLM_KEY"
PASSTHROUGH = f"PATH,HOME,LANG,TMPDIR,NO_PROXY,{LLM_KEY_VAR}"


def require_llm() -> dict[str, str]:
    """Skip unless tier 4 is enabled, the qwen CLI + home exist, and ``llm.env`` is present and reachable."""
    require(4, QWEN_CLI, QWEN_HOME, LLM_ENV)
    env = llm_env()
    if not env.get("AGENTIC_UI_LLM_KEY") or not env.get("AGENTIC_UI_LLM_BASE_URL"):
        raise unittest.SkipTest(f"{LLM_ENV} missing AGENTIC_UI_LLM_KEY or AGENTIC_UI_LLM_BASE_URL")
    if not llm_endpoint_up(env):
        raise unittest.SkipTest(f"test LLM endpoint not reachable ({LLM_ENV})")
    return env


def tier4_environ(tmp: Path, llm: dict[str, str]) -> dict[str, str]:
    """A child env with a temp qwen home copy, the API key and the composed provider flags (nothing else leaks)."""
    environ = base_environ(tmp)
    shutil.copytree(
        QWEN_HOME / ".qwen",
        Path(environ["HOME"]) / ".qwen",
        ignore=shutil.ignore_patterns("projects", "usage*", "tmp"),
    )
    environ[LLM_KEY_VAR] = llm["AGENTIC_UI_LLM_KEY"]
    environ["AGENTIC_UI_CONFIG"] = str(DEV_CONFIG)
    environ["AGENTIC_UI_AGENT_EXTRA_ARGS"] = shlex.join(llm_provider_args(llm))
    return environ


class RealQwenLlmTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.llm = require_llm()
        self.model = self.llm["AGENTIC_UI_LLM_DEFAULT"]
        self.tmp = temp_dir(self)
        self.key = self.llm["AGENTIC_UI_LLM_KEY"]
        self.environ = tier4_environ(self.tmp, self.llm)
        self.sets = {
            "agent.bin": str(QWEN_CLI),
            "agent.env_passthrough": PASSTHROUGH,
            "timeouts.turn_s": "90",
            "timeouts.start_s": "60",
        }

    def session(self) -> AgentSession:
        settings = make_settings(self.tmp, self.sets, self.environ)
        self.assertIn(self.model, settings.agent.extra_args, "provider flags composed from llm.env")
        session = AgentSession(settings, "chat-tier4", files=agent_files(settings.agent))
        self.addAsyncCleanup(session.close)
        return session

    def capture_logs(self) -> io.StringIO:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.addFilter(RedactingFilter())
        logger = logging.getLogger(LOGGER_NAME)
        logger.addHandler(handler)
        previous = logger.level
        logger.setLevel(logging.DEBUG)
        self.addCleanup(logger.removeHandler, handler)
        self.addCleanup(logger.setLevel, previous)
        return stream

    async def test_1_reply_ok_and_cancel(self) -> None:
        logs = self.capture_logs()
        session = self.session()
        result = await session.run_turn("Reply with exactly: OK")
        self.assertIn("OK", result.text)
        self.assertEqual(result.stop_reason, "end_turn")
        self.assertTrue(result.usage and result.usage.get("inputTokens"), "usage present")
        print(
            f"\n[tier4] turn1 kinds={result.kinds} usage={result.usage} model={session.models.get('currentModelId')} "
            f"mode={session.modes.get('currentModeId')}",
            file=sys.stderr,
        )

        turn = asyncio.create_task(session.run_turn("Count from 1 to 400, one number per line, no other text."))
        await asyncio.sleep(3.0)
        started = time.monotonic()
        await session.cancel()
        cancelled = await asyncio.wait_for(turn, 10)
        latency = time.monotonic() - started
        self.assertEqual(cancelled.stop_reason, "cancelled")
        print(
            f"[tier4] turn2 kinds={cancelled.kinds} cancel_latency={latency:.3f}s chars={len(cancelled.text)}",
            file=sys.stderr,
        )
        self.assertNotIn(self.key, logs.getvalue(), "the key never reaches our logs")

    def test_2_check_agent_cli(self) -> None:
        import json

        args = [
            a
            for k, v in {
                **self.sets,
                "agent.work_root": str(self.tmp / "w"),
                "agent.cache_dir": str(self.tmp / "c"),
                "agent.inherit_env": "false",
            }.items()
            for a in ("--set", f"{k}={v}")
        ]
        proc = subprocess.run(
            [sys.executable, "-m", "agentic_ui_server", "--check-agent", *args],
            capture_output=True,
            text=True,
            env={**self.environ, "PYTHONPATH": str(SRC_DIR)},
            timeout=180,
        )
        self.assertNotIn(self.key, proc.stdout + proc.stderr)
        self.assertEqual(proc.returncode, 0, proc.stdout[-1500:] + proc.stderr[-1500:])
        report = json.loads(proc.stdout)
        self.assertEqual((report["agentInfo"]["name"], report["stopReason"]), ("qwen-code", "end_turn"))
        self.assertIn("OK", report["text"])
        print(
            f"\n[tier4] check-agent model={report['model']} kinds={report['updateKinds']} "
            f"durationMs={report['durationMs']} modes={report['modes']}",
            file=sys.stderr,
        )


if __name__ == "__main__":
    unittest.main()
