"""SV-C16 "zero silence": the log line of each agent lifecycle event, with its level, chat id and numbers."""

import asyncio
import unittest

from agentic_ui_server.agent.manager import QueueFull, SessionManager
from agentic_ui_server.agent.session import AgentCrashed, TurnTimeout
from agentic_ui_server.resources import AgentFiles

from ..support.tiers import scripted_settings, temp_dir
from .test_session import SessionCase


class SessionLogsTest(SessionCase):
    async def logged(self, coro) -> str:
        with self.assertLogs("agentic_ui_server", "DEBUG") as logs:
            await coro
        return "\n".join(logs.output)

    async def test_turn_start_and_end_with_duration(self) -> None:
        """[SV-C16] turn start (prompt size) and turn end (stopReason, duration, updates, reply size) at INFO."""
        session = self.make({"prompts": [[{"chunk": "hello"}]]})
        out = await self.logged(session.run_turn("12345"))
        self.assertRegex(out, r"INFO:agentic_ui_server\.agent\.session:\[chat-1\] turn start \(5 chars\)")
        self.assertRegex(
            out,
            r"INFO:agentic_ui_server\.agent\.session:\[chat-1\] turn end: stop=end_turn duration=\d+ms "
            r"updates=1 chars=5",
        )

    async def test_turn_timeout(self) -> None:
        """[SV-C16] a turn timeout is a WARNING naming the limit, followed by the cancel."""
        session = self.make({"prompts": [[{"hang": True}]]}, {"timeouts.turn_s": "0.3"})

        async def turn() -> None:
            with self.assertRaises(TurnTimeout):
                await session.run_turn("x")

        out = await self.logged(turn())
        self.assertIn("WARNING:agentic_ui_server.agent.session:[chat-1] turn timed out after 0.3s, cancelling", out)
        self.assertIn("[chat-1] cancelling the running turn", out)

    async def test_cancel_ignored_then_killed(self) -> None:
        """[SV-C16] cancel at INFO; an agent ignoring it → WARNING with the grace, then the SIGKILL of its group."""
        session = self.make({"on_cancel": "ignore", "prompts": [[{"hang": True}]]}, {"timeouts.cancel_grace_s": "0.3"})
        await session.start()
        turn = asyncio.create_task(session.run_turn("x"))
        await asyncio.sleep(0.2)
        out = await self.logged(session.cancel())
        await turn
        self.assertIn("INFO:agentic_ui_server.agent.session:[chat-1] cancelling the running turn", out)
        self.assertIn("WARNING:agentic_ui_server.agent.session:[chat-1] agent ignored session/cancel for 0.3s", out)
        self.assertRegex(out, r"INFO:agentic_ui_server\.agent\.process:\[chat-1 pid=\d+\] SIGKILL process group")

    async def test_crash_and_restart(self) -> None:
        """[SV-C16] a crash mid-turn is an ERROR with the exit code; the next turn logs the restart + resume."""
        session = self.make({"runs": [{"prompts": [[{"exit": 4}]]}, {"prompts": [[{"chunk": "back"}]]}]})

        async def crash() -> None:
            with self.assertRaises(AgentCrashed):
                await session.run_turn("x")

        out = await self.logged(crash())
        self.assertIn("ERROR:agentic_ui_server.agent.session:[chat-1] agent crashed mid-turn (exit code 4)", out)
        out = await self.logged(session.run_turn("y"))
        self.assertIn("INFO:agentic_ui_server.agent.session:[chat-1] restarting the agent, resuming session", out)
        self.assertRegex(out, r"\[chat-1\] ready: session=\S+ resumed=True pid=\d+")


class ManagerLogsTest(unittest.IsolatedAsyncioTestCase):
    def make(self, script: dict, sets: dict[str, str]) -> SessionManager:
        settings, _ = scripted_settings(temp_dir(self), script, sets)
        manager = SessionManager(settings, files=AgentFiles())
        self.addAsyncCleanup(manager.shutdown)
        return manager

    async def turn(self, manager: SessionManager, chat_id: str) -> None:
        async with manager.turn(chat_id) as session:
            await session.run_turn("go")

    async def test_queue_full(self) -> None:
        """[SV-C16] a rejected turn (HTTP 429) is a WARNING with the waiting count and the limit."""
        manager = self.make({"prompts": [[{"sleep": 0.4}]]}, {"limits.max_queue_per_chat": "1"})
        running = [asyncio.create_task(self.turn(manager, "c")) for _ in range(2)]
        await asyncio.sleep(0.1)
        with self.assertLogs("agentic_ui_server.agent.manager", "WARNING") as logs, self.assertRaises(QueueFull):
            await self.turn(manager, "c")
        await asyncio.gather(*running)
        self.assertIn("[c] queue full: 1 turns already waiting (limit 1)", "\n".join(logs.output))

    async def test_lru_eviction(self) -> None:
        """[SV-C16] the evicted chat and the cap are logged when a new chat needs a slot."""
        manager = self.make({"prompts": [[{"chunk": "x"}]]}, {"limits.max_live_agents": "1"})
        await self.turn(manager, "a")
        with self.assertLogs("agentic_ui_server.agent.manager", "INFO") as logs:
            await self.turn(manager, "b")
        self.assertIn(
            "INFO:agentic_ui_server.agent.manager:[a] evicting idle agent (LRU, cap 1 live agents)", logs.output
        )


if __name__ == "__main__":
    unittest.main()
