"""ChatService lifecycle after the A3 review: queued cancel, shutdown, forgetting chats, model truth, duplicates.

Ported from the A3 reproductions (WORKFLOW/review attack/test_cancel_races.py, test_shutdown.py, test_state_leak.py,
test_model_switch.py, playground A3-P07), on stub sessions so they are deterministic.
"""

import asyncio
import time
import unittest

from agentic_ui_server.agent.manager import ManagerClosed, SessionManager
from agentic_ui_server.conversation.progress import Progress
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.resources import AgentFiles

from ..support.http_client import stub_settings
from ..support.stub_session import StubSession, again, broken, reply
from ..support.tiers import temp_dir


class Lifecycle(unittest.IsolatedAsyncioTestCase):
    def service(
        self, steps: dict[str, list], refuse: frozenset[str] = frozenset(), **sets: str
    ) -> tuple[ChatService, dict[str, StubSession]]:
        sessions: dict[str, StubSession] = {}

        def factory(chat_id: str) -> StubSession:
            sessions[chat_id] = StubSession(chat_id, steps.get(chat_id, []))
            sessions[chat_id].refuse_models = chat_id in refuse
            return sessions[chat_id]

        self.settings = stub_settings(**sets)
        self.manager = SessionManager(self.settings, files=AgentFiles(), session_factory=factory)
        self.addAsyncCleanup(self.manager.shutdown)
        return ChatService(self.settings, self.manager), sessions


class QueuedCancelTest(Lifecycle):
    async def test_cancel_while_waiting_for_an_agent_slot(self) -> None:
        """[SV-C6, SV-C20] A3-01: chat B waits for the only agent slot (A is busy); Cancel B answers
        cancelled: true and B ends cancelled at once, no prompt sent (before: cancelled false, then a full turn)."""
        service, sessions = self.service({"A": [("hang", 5)], "B": [reply(again())]}, limits__max_live_agents="1")
        a = asyncio.create_task(service.prompt("A", "x"))
        await asyncio.sleep(0.05)
        b = asyncio.create_task(service.prompt("B", "y"))
        await asyncio.sleep(0.05)
        snap = service.progress("B")
        self.assertEqual((snap["state"], snap["attempt"]), ("running", 0), "queued = running, attempt 0")
        started = time.monotonic()
        self.assertTrue(await service.cancel("B"))
        outcome = await asyncio.wait_for(b, 1)
        self.assertEqual((outcome.status, outcome.attempts), ("cancelled", 0))
        self.assertLess(time.monotonic() - started, 0.5)
        self.assertEqual(sessions["B"].prompts, [])
        self.assertEqual(service.progress("B")["state"], "cancelled")
        await service.cancel("A")
        self.assertEqual((await a).status, "cancelled")

    async def test_cancel_between_two_repair_turns(self) -> None:
        """[SV-C6] A3-23 S12: a cancel in the gap after an invalid reply (the session is idle, only the progress
        flag can stop the request) ends it cancelled with exactly 1 prompt sent; the repair is never sent."""
        service, sessions = self.service({"r": [reply(broken()), ("hang", 1)]})
        original = Progress.invalid

        def invalid_then_cancel(progress: Progress, errors: list[str], total: int | None = None) -> None:
            original(progress, errors, total)
            service.board.request_cancel(progress.chat_id)  # ChatService.cancel's first, synchronous step

        Progress.invalid = invalid_then_cancel
        try:
            outcome = await service.prompt("r", "x")
        finally:
            Progress.invalid = original
        self.assertEqual(outcome.status, "cancelled")
        self.assertEqual(len(sessions["r"].prompts), 1)


class ShutdownTest(Lifecycle):
    async def test_a_turn_stopped_by_shutdown_is_not_a_user_cancel(self) -> None:
        """[SV-C6, SV-C16] A3-10: SIGTERM while /prompt waits: ManagerClosed (HTTP 503 shutting_down), not the
        200 cancelled of a user's Cancel; a request queued for a slot ends the same way."""
        service, _ = self.service({"z": [("hang", 5)], "q": [reply(again())]}, limits__max_live_agents="1")
        running = asyncio.create_task(service.prompt("z", "x"))
        await asyncio.sleep(0.05)
        queued = asyncio.create_task(service.prompt("q", "y"))
        await asyncio.sleep(0.05)
        await self.manager.shutdown()
        for task in (running, queued):
            with self.assertRaises(ManagerClosed):
                await asyncio.wait_for(task, 1)

    async def test_user_cancel_before_shutdown_stays_cancelled(self) -> None:
        """[SV-C6] A3-10: a request the user cancelled is reported cancelled even if the server then shuts down."""
        service, _ = self.service({"u": [("hang", 5)]})
        task = asyncio.create_task(service.prompt("u", "x"))
        await asyncio.sleep(0.05)
        service.board.request_cancel("u")
        await self.manager.shutdown()
        self.assertEqual((await asyncio.wait_for(task, 1)).status, "cancelled")


class ForgetTest(Lifecycle):
    async def test_forgotten_chats_leave_no_state(self) -> None:
        """[SV-C11, SV-C19] A3-03: 300 chats with a 100 KB prompt each, then a reaper pass past forget_after_s: the
        manager, the service (prompt, model, progress) hold nothing (before: 300 prompts, 30 MB, kept forever)."""
        steps = {f"c{i}": [reply(again())] for i in range(300)}
        service, _ = self.service(steps)
        for i in range(300):
            await service.set_model(f"c{i}", "")
            await service.prompt(f"c{i}", "x" * 100_000)
        limits = self.settings.limits
        await self.manager.reap_idle(time.monotonic() + limits.forget_after_s + limits.idle_ttl_s + 1)
        self.assertEqual((len(self.manager._entries), len(service._chats), len(service.board)), (0, 0, 0))

    async def test_the_reaper_removes_a_forgotten_chats_work_dir_only(self) -> None:
        """[SV-C18, SV-C19] A3-03: a forgotten chat's agent cwd (a direct child of agent.work_root) is removed; a
        directory outside the work root is never touched."""
        root, outside = temp_dir(self) / "chats", temp_dir(self) / "elsewhere"
        service, sessions = self.service({"w": [reply(again())], "o": [reply(again())]}, agent__work_root=str(root))
        for chat_id, cwd in (("w", root / "w-dir"), ("o", outside)):
            await service.prompt(chat_id, "x")
            sessions[chat_id].cwd = cwd
            cwd.mkdir(parents=True)
            (cwd / "QWEN.md").write_text("x", encoding="utf-8")
        await self.manager.reap_idle(time.monotonic() + self.settings.limits.forget_after_s + 1)
        self.assertFalse((root / "w-dir").exists())
        self.assertTrue((outside / "QWEN.md").exists())

    async def test_a_model_choice_without_a_session_is_kept_until_idle(self) -> None:
        """[SV-C25] A3-03: a chat that only chose a model (no session yet) keeps it across reaper passes until it
        was idle for forget_after_s."""
        service, _ = self.service({})
        await service.set_model("m", "model-b")
        await self.manager.reap_idle()
        self.assertEqual(service.chat_model("m"), "model-b")
        await self.manager.reap_idle(time.monotonic() + self.settings.limits.forget_after_s + 1)
        self.assertIsNone(service.chat_model("m"))


class ModelTruthTest(Lifecycle):
    async def test_a_refused_model_is_not_reported_as_applied(self) -> None:
        """[SV-C25, SV-C15] A3-12: the agent refuses the chosen model: the outcome's model and /models current
        name what the turn really ran (the CLI default), not the choice; an accepted one is reported."""
        service, sessions = self.service({"m": [reply(again()), reply(again())]}, refuse=frozenset({"m"}))
        await service.set_model("m", "model-b")
        self.assertEqual(service.chat_model("m"), "model-b", "chosen, no turn yet")
        self.assertIsNone((await service.prompt("m", "x")).model)
        self.assertIsNone(service.chat_model("m"), "the CLI default (the API reports `default`)")
        sessions["m"].refuse_models = False
        self.assertEqual((await service.prompt("m", "x")).model, "model-b")
        self.assertEqual(service.chat_model("m"), "model-b")


class DuplicateTest(Lifecycle):
    async def test_a_duplicate_retry_joins_the_running_prompt(self) -> None:
        """[SV-C11] A3-19: the client retried after a proxy 504 while the first request still runs: the retry
        joins it (one agent turn, both get its outcome); another text waits behind it (FIFO)."""
        slow = ("slow", 0.3, reply(again()))
        service, sessions = self.service({"d": [slow, reply(again())]})
        first = asyncio.create_task(service.prompt("d", "same"))
        await asyncio.sleep(0.05)
        retry = asyncio.create_task(service.prompt("d", "same"))
        other = asyncio.create_task(service.prompt("d", "different"))
        outcomes = await asyncio.gather(first, retry, other)
        self.assertEqual([o.status for o in outcomes], ["ok", "ok", "ok"])
        self.assertIs(outcomes[0], outcomes[1])
        self.assertEqual(len(sessions["d"].prompts), 2, "same text once, the other text once")


if __name__ == "__main__":
    unittest.main()
