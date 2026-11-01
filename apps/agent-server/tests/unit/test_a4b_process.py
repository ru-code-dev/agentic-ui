"""A4b test-quality guards for the agent process (A4b-M1, M2, M4; reviewer attack/mutation/test_a4b_mutants.py):
process-group close, stderr and traceback redaction, a refused model call in the real AgentSession."""

import asyncio
import io
import json
import logging
import os
import sys
import time
import unittest
from pathlib import Path

from agentic_ui_server.agent.process import AgentProcess
from agentic_ui_server.agent.session import AgentSession
from agentic_ui_server.agent.spawn import SpawnSpec
from agentic_ui_server.log import RedactingFilter, get_logger, register_secret
from agentic_ui_server.resources import AgentFiles
from agentic_ui_server.settings import LimitSettings

from ..support.tiers import SCRIPTED_AGENT, base_environ, scripted_settings, temp_dir


def _dead(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return True
    stat = Path(f"/proc/{pid}/stat")
    return stat.exists() and stat.read_text().split(") ", 1)[1].startswith("Z")


def _wait_dead(pid: int, seconds: float = 5.0) -> bool:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if _dead(pid):
            return True
        time.sleep(0.05)
    return _dead(pid)


WRAPPER = """import json, os, signal, subprocess, sys
if os.environ.get("A4B_IGNORE_TERM"):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)  # an agent that ignores SIGTERM (its children inherit it)
helper = subprocess.Popen(["sleep", "120"], stdin=subprocess.DEVNULL)  # an MCP server / relaunched CLI
agent = subprocess.Popen([sys.executable, "-I", sys.argv[1]])
open(sys.argv[2], "w").write(json.dumps([os.getpid(), helper.pid, agent.pid]))
agent.wait()
"""


class ProcessGroupTest(unittest.IsolatedAsyncioTestCase):
    """process.py doc: the agent is a group leader; terminate/kill signal the whole group and reap grandchildren;
    SIGTERM, then SIGKILL after kill_grace_s (mutants killpg-to-kill, terminate-no-sigkill)."""

    async def _session(self, ignore_term: bool) -> tuple[AgentSession, list[int]]:
        tmp = temp_dir(self)
        wrapper, pids = tmp / "wrapper.py", tmp / "pids.json"
        wrapper.write_text(WRAPPER, encoding="utf-8")
        settings, _ = scripted_settings(
            tmp,
            {},
            {"agent.base_args": f"-I {wrapper} {SCRIPTED_AGENT} {pids}"}
            | ({"agent.env": f"SCRIPTED_AGENT_SCRIPT={tmp / 'script.json'},A4B_IGNORE_TERM=1"} if ignore_term else {}),
        )
        session = AgentSession(settings, "chat-a4b-group", files=AgentFiles())
        self.addAsyncCleanup(session.close)
        await session.run_turn("hi")
        return session, json.loads(pids.read_text())

    async def test_close_reaps_grandchildren(self) -> None:
        """[SV-C19, A4b-M1] close() ends the leader and both grandchildren (killpg, not kill)."""
        session, (leader, helper, agent) = await self._session(ignore_term=False)
        await session.close()
        for name, pid in (("leader", leader), ("helper grandchild", helper), ("agent grandchild", agent)):
            self.assertTrue(await asyncio.to_thread(_wait_dead, pid), f"{name} pid {pid} survived session.close()")

    async def test_sigterm_ignoring_agent_is_killed(self) -> None:
        """[SV-C19, A4b-M1] an agent group ignoring SIGTERM is SIGKILLed after kill_grace_s."""
        session, (leader, helper, agent) = await self._session(ignore_term=True)
        await session.close()
        for name, pid in (("leader", leader), ("helper", helper), ("agent", agent)):
            self.assertTrue(await asyncio.to_thread(_wait_dead, pid), f"{name} pid {pid} ignored SIGTERM and survived")


class RefusedModelTest(unittest.IsolatedAsyncioTestCase):
    """A3-12: only an accepted model call counts as applied (mutant refused-model-counted)."""

    async def test_refused_model_is_not_applied(self) -> None:
        """[SV-C15, A4b-M4] the real AgentSession: both model methods refused (-32601) → applied_model stays None."""
        refuse = {"error": [-32601, "Method not found"]}
        settings, _ = scripted_settings(
            temp_dir(self), {"methods": {"session/set_config_option": refuse, "session/set_model": refuse}}
        )
        session = AgentSession(settings, "chat-a4b-model", files=AgentFiles())
        self.addAsyncCleanup(session.close)
        await session.run_turn("1", model="model-b")
        self.assertIsNone(session.applied_model, "a refused model call was recorded as applied")


class StderrTailTest(unittest.IsolatedAsyncioTestCase):
    """SV-C16: stderr tails are surfaced redacted (selfcheck.py prints session.stderr_tail() as JSON, outside the
    HTTP and log redaction) (mutant stderr-tail-unredacted)."""

    async def test_stderr_tail_is_redacted(self) -> None:
        """[SV-C16, A4b-M2] a secret the child prints on stderr is absent from stderr_tail()."""
        secret = "a4b-stderr-secret-9876543"
        tmp = temp_dir(self)
        env = {**base_environ(tmp), "A4B_API_TOKEN": secret}
        code = f"import sys; sys.stderr.write('auth failed for {secret}\\n')"
        proc = await AgentProcess.start(SpawnSpec((sys.executable, "-c", code), env, str(tmp)), LimitSettings())
        await proc.wait_exit(5)
        tail = proc.stderr_tail()
        self.assertIn("auth failed", tail)
        self.assertNotIn(secret, tail)


class TracebackRedactionTest(unittest.TestCase):
    """SV-C16: a logged traceback is redacted (mutant exc-text-unredacted)."""

    def test_exception_text_is_redacted(self) -> None:
        """[SV-C16, A4b-M2] a secret inside a logged exception is absent from the handler output."""
        secret = "a4b-traceback-secret-12345"
        register_secret(secret)
        logger = get_logger("a4b.traceback")
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.addFilter(RedactingFilter())  # like setup_logging
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        self.addCleanup(logger.removeHandler, handler)
        try:
            raise RuntimeError(f"upstream refused key {secret}")
        except RuntimeError:
            logger.exception("request failed")
        self.assertIn("upstream refused key", stream.getvalue())
        self.assertNotIn(secret, stream.getvalue())


if __name__ == "__main__":
    unittest.main()
