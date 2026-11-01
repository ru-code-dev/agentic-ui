"""P5-D5 with a real agent process: the request deadline abandons the turn, kills the agent, returns the fallback."""

import asyncio
import time
import unittest

from agentic_ui_server.agent.manager import SessionManager
from agentic_ui_server.conversation.fallback import FALLBACK
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.resources import AgentFiles

from ..support.tiers import read_record, scripted_settings, temp_dir
from .test_session import alive


class ServiceDeadlineTest(unittest.IsolatedAsyncioTestCase):
    async def test_the_request_deadline_kills_the_agent_and_gives_the_fallback(self) -> None:
        """[SV-C9, P5-service] timeouts.request_s=1 over an agent that never answers: the fallback (reason
        timeout) comes back within the deadline, the agent process is killed (turn abandoned) and logged."""
        tmp = temp_dir(self)
        settings, record = scripted_settings(tmp, {"prompts": [[{"hang": True}]]}, {"timeouts.request_s": "1"})
        manager = SessionManager(settings, files=AgentFiles())
        self.addAsyncCleanup(manager.shutdown)
        service = ChatService(settings, manager)
        started = time.monotonic()
        with self.assertLogs("agentic_ui_server", level="INFO") as logs:
            outcome = await service.prompt("c-deadline", "x")
        self.assertLess(time.monotonic() - started, 4)
        self.assertEqual((outcome.status, outcome.reason, outcome.messages), ("fallback", "timeout", FALLBACK))
        self.assertIn("request exceeded 1.0s", outcome.errors[-1])
        [pid] = [entry["pid"] for entry in read_record(record) if entry.get("event") == "boot"]
        for _ in range(50):
            if not alive(pid):
                break
            await asyncio.sleep(0.05)
        self.assertFalse(alive(pid), "the abandoned turn's agent is killed")
        self.assertIn("[c-deadline] caller abandoned the turn, killing the agent", "\n".join(logs.output))


if __name__ == "__main__":
    unittest.main()
