"""Tier 2: ChatService + repair loop against the ru-code fake ACP agent (FLOW control file per turn)."""

import asyncio
import json
import unittest
from pathlib import Path

from agentic_ui_server.agent.manager import SessionManager
from agentic_ui_server.agent.session import AgentSession
from agentic_ui_server.conversation.fallback import FALLBACK
from agentic_ui_server.conversation.prompts import NO_QUESTIONS
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.resources import AgentFiles

from ..support.stub_session import broken, example, reply
from ..support.tiers import FAKE_ACP, base_environ, make_settings, require, temp_dir


class ScriptedFlowSession(AgentSession):
    """Writes the next scripted reply into the fake's control file before each turn."""

    replies: list[str | dict]
    """Reply texts, or full FLOW control objects (``{"responseText", "delayMs"}``)."""
    control: str
    sent: list[str]

    async def run_turn(self, text: str, model: str | None = None):
        self.sent.append(text)
        step = self.replies.pop(0)
        control = json.dumps(step if isinstance(step, dict) else {"responseText": step}, ensure_ascii=False)
        await asyncio.to_thread(Path(self.control).write_text, control, "utf-8")
        return await super().run_turn(text, model)


class ServiceFakeQwenTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        require(2, FAKE_ACP)
        self.tmp = temp_dir(self)

    def service(self, replies: list[str]) -> tuple[ChatService, list[str]]:
        control, sent = self.tmp / "control.json", []
        values = {
            "agent.bin": str(FAKE_ACP),
            "agent.base_args": "",
            "agent.acp_flag": "",
            "timeouts.start_s": "20",
            "timeouts.turn_s": "15",
            "agent.env": f"RU_CODE_FAKE_ACP=FLOW,RU_CODE_FAKE_CONTROL_FILE={control}",
        }
        settings = make_settings(self.tmp, values, base_environ(self.tmp))

        def factory(chat_id: str) -> AgentSession:
            session = ScriptedFlowSession(settings, chat_id, files=AgentFiles())
            session.replies, session.control, session.sent = list(replies), str(control), sent
            return session

        manager = SessionManager(settings, files=AgentFiles(), session_factory=factory)
        self.addAsyncCleanup(manager.shutdown)
        return ChatService(settings, manager), sent

    async def test_invalid_reply_repaired_in_the_same_session(self) -> None:
        """[SV-C8, P5-service] fake qwen: invalid UI → repair with the exact error → valid UI, one process."""
        service, sent = self.service([reply(broken()), reply(example())])
        outcome = await service.prompt("chat-fake", "Покажи форму входа")
        self.assertEqual((outcome.status, outcome.attempts, outcome.messages), ("ok", 2, example()))
        self.assertIn("unknown property 'bogus'", sent[1])

    async def test_questions_end_in_the_fallback(self) -> None:
        """[SV-C14, SV-C9] fake qwen asks a question every time → no-questions repairs → fallback."""
        service, sent = self.service(["Что именно показать?"] * 4)
        outcome = await service.prompt("chat-fake-q", "данные")
        self.assertEqual((outcome.status, outcome.messages, sent[1:]), ("fallback", FALLBACK, [NO_QUESTIONS] * 3))


if __name__ == "__main__":
    unittest.main()
