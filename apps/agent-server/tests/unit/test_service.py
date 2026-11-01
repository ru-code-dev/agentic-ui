"""conversation/service.py over a real SessionManager with stub sessions: progress, cancel, models, retry, deadline."""

import asyncio
import unittest

from agentic_ui_server.agent.manager import QueueFull, SessionManager
from agentic_ui_server.config import load_settings
from agentic_ui_server.conversation.fallback import FALLBACK, RETRY_EVENT
from agentic_ui_server.conversation.service import MODELS_PROBE_CHAT, ChatService, UnknownModel
from agentic_ui_server.resources import AgentFiles

from ..support.stub_session import StubSession, again, broken, reply


class ServiceTest(unittest.IsolatedAsyncioTestCase):
    def make(self, steps: dict[str, list], **sets: str) -> ChatService:
        argv = [a for k, v in sets.items() for a in ("--set", f"{k.replace('__', '.')}={v}")]
        settings = load_settings(argv, {"HOME": "/home/t", "XDG_STATE_HOME": "/nonexistent/state"})
        self.sessions: dict[str, StubSession] = {}

        def factory(chat_id: str) -> StubSession:
            self.sessions[chat_id] = StubSession(chat_id, steps.get(chat_id, []))
            return self.sessions[chat_id]

        manager = SessionManager(settings, files=AgentFiles(), session_factory=factory)
        self.addAsyncCleanup(manager.shutdown)
        return ChatService(settings, manager)

    async def test_prompt_runs_in_the_chats_own_session(self) -> None:
        """[P5-service] each chat has its own session; the outcome carries messages and attempts."""
        service = self.make({"a": [reply(again())], "b": [reply(broken()), reply(again())]})
        a, b = await asyncio.gather(service.prompt("a", "данные A"), service.prompt("b", "данные B"))
        self.assertEqual((a.status, a.attempts, b.status, b.attempts), ("ok", 1, "ok", 2))
        self.assertIn("данные A", self.sessions["a"].prompts[0])
        self.assertEqual(a.to_dict()["fallback"], False)

    async def test_progress_during_a_repair(self) -> None:
        """[SV-C20] state, attempt n of max, last errors and elapsed ms while the repair turn runs."""
        service = self.make({"c": [reply(broken()), ("hang", 0.3), reply(again())]})
        task = asyncio.create_task(service.prompt("c", "x"))
        await asyncio.sleep(0.1)
        live = service.progress("c")
        self.assertEqual(
            (live["state"], live["attempt"], live["maxAttempts"], live["errorCount"]), ("repairing", 2, 4, 1)
        )
        self.assertIn("bogus", live["lastErrors"][0])
        self.assertGreaterEqual(live["elapsedMs"], 50)
        outcome = await task
        self.assertEqual((outcome.status, service.progress("c")["state"]), ("ok", "done"))

    async def test_cancel_ends_the_request_without_fallback(self) -> None:
        """[P5-service] cancel reaches the running turn; the request ends cancelled."""
        service = self.make({"c": [("hang", 5)]})
        task = asyncio.create_task(service.prompt("c", "x"))
        await asyncio.sleep(0.05)
        self.assertTrue(await service.cancel("c"))
        outcome = await task
        self.assertEqual((outcome.status, service.progress("c")["state"]), ("cancelled", "cancelled"))

    async def test_progress_is_the_running_request_never_a_rejected_one(self) -> None:
        """[SV-C20, SV-C11] a 429 (QueueFull) or a queued request does not replace the running one's progress; the
        chat's progress ends final (it stayed 'running', attempt 0, forever after a 429)."""
        service = self.make({"q": [("hang", 0.3), reply(again()), reply(again())]}, limits__max_queue_per_chat="1")
        first = asyncio.create_task(service.prompt("q", "1"))
        await asyncio.sleep(0.05)
        second = asyncio.create_task(service.prompt("q", "2"))
        await asyncio.sleep(0.05)
        with self.assertRaises(QueueFull):
            await service.prompt("q", "3")
        self.assertEqual((service.progress("q")["state"], service.progress("q")["attempt"]), ("running", 1))
        await first
        self.assertEqual((await second).status, "ok")
        self.assertEqual(service.progress("q")["state"], "done")

    async def test_cancel_reaches_the_running_request_and_spares_the_queued_one(self) -> None:
        """[SV-C11, P5-service] /cancel ends the running turn; the request queued behind it still runs."""
        service = self.make({"q": [("hang", 5), reply(again())]})
        first = asyncio.create_task(service.prompt("q", "1"))
        await asyncio.sleep(0.05)
        second = asyncio.create_task(service.prompt("q", "2"))
        await asyncio.sleep(0.05)
        self.assertTrue(await service.cancel("q"))
        self.assertEqual(((await first).status, (await second).status), ("cancelled", "ok"))

    async def test_repair_attempts_come_from_settings(self) -> None:
        """[SV-C8] repair.max_attempts=1 (a setting, not an argument): 2 agent replies, then the fallback."""
        service = self.make({"c": [reply(broken()), reply(broken()), reply(again())]}, repair__max_attempts="1")
        outcome = await service.prompt("c", "x")
        self.assertEqual((outcome.status, outcome.reason, outcome.attempts), ("fallback", "invalid", 2))
        self.assertEqual(len(self.sessions["c"].prompts), 2)

    async def test_request_deadline_gives_the_fallback(self) -> None:
        """[SV-C9, SV-C16] timeouts.request_s bounds the whole request; then the fallback is returned and logged
        with the chat label."""
        service = self.make({"c": [("hang", 5)]}, timeouts__request_s="0.2")
        with self.assertLogs("agentic_ui_server.conversation.repair", level="WARNING") as logs:
            outcome = await service.prompt("c", "x")
        self.assertEqual((outcome.status, outcome.reason, outcome.messages), ("fallback", "timeout", FALLBACK))
        self.assertRegex(logs.output[0], r"^WARNING:[\w.]+:\[c\] fallback \(timeout\) after 1 attempt\(s\)")

    async def test_models_and_per_chat_model(self) -> None:
        """[SV-C25] models from session/new via a probe session; a chat's model is passed to its next turns."""
        service = self.make({"c": [reply(again()), reply(again())]})
        offered = await service.models()
        self.assertEqual(
            offered,
            {
                "models": [
                    {"id": "model-a", "name": "Model A", "description": None},
                    {"id": "model-b", "name": "model-b", "description": None},
                ],
                "current": "model-a",
            },
        )
        self.assertIn(MODELS_PROBE_CHAT, self.sessions)
        await service.set_model("c", "model-b")
        await service.prompt("c", "x")
        with self.assertRaises(UnknownModel):
            await service.set_model("c", "other-model")
        await service.set_model("c", "")
        await service.prompt("c", "y")
        self.assertEqual(self.sessions["c"].models_used, ["model-b", None])

    async def test_retry_action_resends_the_last_prompt(self) -> None:
        """[SV-C9, P5-service] the fallback's agent.retry re-sends the last prompt; other actions go as JSON."""
        service = self.make({"c": [reply(again()), reply(again()), reply(again())]})
        await service.prompt("c", "таблица с итогами")
        await service.action("c", "agent-fallback", {"name": RETRY_EVENT})
        await service.action("c", "s1", {"name": "save", "context": {}}, {"a": 1})
        prompts = self.sessions["c"].prompts
        self.assertEqual(prompts[0], prompts[1])
        self.assertIn('"name": "save"', prompts[2])


if __name__ == "__main__":
    unittest.main()
