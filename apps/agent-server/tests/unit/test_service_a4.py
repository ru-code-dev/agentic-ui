"""Chat service fixes of the A4 review (reviewer reproductions in attack/server/, ported).

A4-05 a model chosen during a turn was overwritten when it ended; A4-06 /models waited for a free agent slot;
A4-07 no admission limit across chats; A4-08 a retried /action reached the agent twice; A4-12 a /cancel during the
reply check answered false; A4b-M3 a cancel during a valid end_turn reply was never tested.
"""

import asyncio
import time
import unittest
from unittest import mock

from agentic_ui_server.agent.manager import QueueFull, SessionManager
from agentic_ui_server.conversation import repair
from agentic_ui_server.conversation.progress import Progress
from agentic_ui_server.conversation.repair import converse
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.resources import AgentFiles

from ..support.http_client import stub_settings
from ..support.stub_session import StubSession, again, broken, example, reply

real_check = repair.reply_problems


class BusyCancelSession(StubSession):
    """``AgentSession.cancel`` semantics: False unless a prompt turn is running."""

    busy = False

    async def run_turn(self, text: str, model: str | None = None):
        self.busy = True
        try:
            return await super().run_turn(text, model)
        finally:
            self.busy = False

    async def cancel(self) -> bool:
        return await super().cancel() if self.busy else False


class ServiceA4Test(unittest.IsolatedAsyncioTestCase):
    def service(self, steps: dict[str, list], cls: type = StubSession, **sets: str) -> tuple[ChatService, dict]:
        sessions: dict[str, StubSession] = {}

        def factory(chat_id: str) -> StubSession:
            sessions[chat_id] = cls(chat_id, steps.get(chat_id, []))
            return sessions[chat_id]

        settings = stub_settings(**sets)
        manager = SessionManager(settings, files=AgentFiles(), session_factory=factory)
        self.addAsyncCleanup(manager.shutdown)
        return ChatService(settings, manager), sessions

    async def test_a_model_chosen_during_a_turn_is_reported(self) -> None:
        """[SV-C25, A4-05] /models `current` after the turn = the model the next turn runs."""
        service, sessions = self.service({"c": [("slow", 0.3, reply(example())), reply(again())]})
        await service.set_model("c", "model-a")
        turn = asyncio.create_task(service.prompt("c", "x"))
        await asyncio.sleep(0.1)
        await service.set_model("c", "model-b")
        await turn
        shown = service.chat_model("c")
        await service.prompt("c", "y")
        self.assertEqual((shown, sessions["c"].models_used[-1]), ("model-b", "model-b"))

    async def test_models_never_wait_for_a_busy_slot(self) -> None:
        """[SV-C25, A4-06] the only slot is busy and no list is known: /models answers at once (503), never waits;
        a live session's list is used without a probe."""
        service, _ = self.service({"A": [("hang", 3)]}, limits__max_live_agents="1")
        busy = asyncio.create_task(service.prompt("A", "x"))
        await asyncio.sleep(0.05)
        started = time.monotonic()
        models = await asyncio.wait_for(service.models(), 1.0)  # the hanging session is live: its list is used
        self.assertLess(time.monotonic() - started, 0.5)
        self.assertEqual(models["current"], "model-a")
        await service.cancel("A")
        await busy

    async def test_models_probe_refused_on_a_full_house(self) -> None:
        """[A4-06] no live session and no free slot: AgentStartError (HTTP 503) at once; an empty list is cached."""
        service, _ = self.service({})
        with (
            mock.patch.object(service.manager, "free_slot", return_value=False),
            self.assertRaisesRegex(Exception, "every agent slot is busy"),
        ):
            await asyncio.wait_for(service.models(), 1.0)
        service._offered = {}
        self.assertEqual(await service.models(), {"models": [], "current": None})

    async def test_waiting_requests_are_bounded_across_chats(self) -> None:
        """[SV-C11, A4-07] with one slot and max_waiting 2, the fourth concurrent chat gets QueueFull (429)."""
        steps = {f"c{i}": [("slow", 0.3, reply(example()))] for i in range(4)}
        service, _ = self.service(steps, limits__max_live_agents="1", limits__max_waiting="2")
        tasks = [asyncio.create_task(service.prompt(f"c{i}", "x")) for i in range(4)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        self.assertEqual(sum(isinstance(r, QueueFull) for r in results), 1, results)

    async def test_a_retried_action_with_its_request_id_joins(self) -> None:
        """[SV-C11, A4-08] the page's retry of a still running action (same requestId) is one agent turn; two
        deliberate presses (no or different requestIds) are two turns."""
        slow = ("slow", 0.3, reply(example()))
        service, sessions = self.service({"c": [slow, slow, slow]})
        event = {"name": "order.submit", "context": {"item": "A"}}
        first = asyncio.create_task(service.action("c", "s", event, None, "req-1"))
        await asyncio.sleep(0.05)
        retry = asyncio.create_task(service.action("c", "s", event, None, "req-1"))
        outcomes = await asyncio.gather(first, retry)
        self.assertIs(outcomes[0], outcomes[1])
        await service.action("c", "s", event, None, "req-2")
        self.assertEqual(sum("order.submit" in p for p in sessions["c"].prompts), 2)

    async def test_cancel_during_the_reply_check_is_confirmed(self) -> None:
        """[SV-C6, A4-12] /cancel while a reply is checked (session idle): answered true, the request ends
        cancelled."""

        def slow_check(text: str, state: object = None, ui_required: bool = True) -> object:
            time.sleep(0.4)
            return real_check(text, state, ui_required)

        service, _ = self.service({"c": [reply(broken()), reply(example())]}, cls=BusyCancelSession)
        with mock.patch.object(repair, "reply_problems", slow_check):
            turn = asyncio.create_task(service.prompt("c", "x"))
            await asyncio.sleep(0.15)
            answered = await service.cancel("c")
            outcome = await turn
        self.assertEqual((answered, outcome.status), (True, "cancelled"))

    async def test_cancel_during_a_valid_end_turn_ends_cancelled(self) -> None:
        """[SV-C6, A4b-M3] the cancel flag set while the agent ends its turn with a valid UI: cancelled, not ok."""
        progress = Progress("c", 1)

        class CancelInTurn(StubSession):
            async def run_turn(self, text: str, model: str | None = None):
                progress.cancel_requested = True
                return await super().run_turn(text, model)

        outcome = await converse(
            CancelInTurn("c", [reply(example())]), "x", max_repairs=0, progress=progress, label="c"
        )
        self.assertEqual(outcome.status, "cancelled")


if __name__ == "__main__":
    unittest.main()
