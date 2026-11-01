"""SV-C27 reply modes of the reference server: ``reply.ui`` (always | auto), ``reply.fallback`` (surface | text) and
``reply.surfaces`` (many | single) — text always, UI when needed (docs/architecture/orchestrator-flow.md)."""

import unittest

from agentic_ui_server.agent.manager import SessionManager
from agentic_ui_server.config import ConfigError
from agentic_ui_server.conversation.fallback import FALLBACK
from agentic_ui_server.conversation.prompts import AUTO_RULE, SINGLE_RULE
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.resources import AgentFiles

from ..support.http_client import call, stub_app, stub_settings
from ..support.stub_session import StubSession, again, broken, example, reply


class ReplyModesTest(unittest.IsolatedAsyncioTestCase):
    def service(self, steps: dict[str, list], **sets: str) -> tuple[ChatService, dict[str, StubSession]]:
        sessions: dict[str, StubSession] = {}

        def factory(chat_id: str) -> StubSession:
            sessions[chat_id] = StubSession(chat_id, steps.get(chat_id, []))
            return sessions[chat_id]

        settings = stub_settings(**sets)
        manager = SessionManager(settings, files=AgentFiles(), session_factory=factory)
        self.addAsyncCleanup(manager.shutdown)
        return ChatService(settings, manager), sessions

    async def test_auto_answers_a_prompt_with_text_only(self) -> None:
        """[SV-C27] ui=auto: a text-only reply to /prompt is a normal ok (messages [], no turnId), not repaired."""
        service, sessions = self.service({"c": ["Столица Франции — Париж."]}, reply__ui="auto")
        outcome = await service.prompt("c", "Какая столица Франции")
        self.assertEqual((outcome.status, outcome.messages, outcome.attempts), ("ok", [], 1))
        self.assertEqual((outcome.text, outcome.turn_id), ("Столица Франции — Париж.", None))
        self.assertIn(AUTO_RULE, sessions["c"].prompts[0])

    async def test_auto_still_takes_ui_and_keeps_the_text(self) -> None:
        """[SV-C27] ui=auto: a reply with text + a valid block is ok with both; the state takes the surface."""
        service, _ = self.service({"c": [reply(example(), "Вот форма.")]}, reply__ui="auto")
        outcome = await service.prompt("c", "Форма входа")
        self.assertEqual((outcome.status, outcome.text, outcome.messages), ("ok", "Вот форма.", example()))
        self.assertIsNotNone(outcome.turn_id)

    async def test_auto_requires_ui_for_actions_and_repairs(self) -> None:
        """[SV-C27] ui=auto: UI was requested for an /action and a repairOf repair, so a text-only reply is repaired."""
        service, sessions = self.service(
            {"c": [reply(example()), "Принято.", reply(again()), "Исправил.", reply(again())]}, reply__ui="auto"
        )
        first = await service.prompt("c", "Форма")
        action = await service.action("c", "login", {"name": "submit"}, {"email": "a@b.c"})
        self.assertEqual((action.status, action.attempts), ("ok", 2))
        repaired = await service.prompt("c", "Страница отклонила интерфейс", repair_of=action.turn_id)
        self.assertEqual((repaired.status, repaired.attempts), ("ok", 2))
        self.assertIsNotNone(first.turn_id)
        self.assertIn("has no <a2ui-json> block", sessions["c"].prompts[2])

    async def test_auto_repairs_an_empty_reply(self) -> None:
        """[SV-C27] ui=auto: an empty reply (no text, no UI) is still repaired."""
        service, sessions = self.service({"c": ["", "Ответ."]}, reply__ui="auto")
        outcome = await service.prompt("c", "Вопрос")
        self.assertEqual((outcome.status, outcome.text, outcome.attempts), ("ok", "Ответ.", 2))
        self.assertIn("Your reply is empty", sessions["c"].prompts[1])

    async def test_always_repairs_text_only_and_the_fallback_keeps_the_text(self) -> None:
        """[SV-C27] ui=always (default): a reply without UI is repaired; used-up attempts → fallback surface + text."""
        service, _ = self.service({"c": ["Только текст."] * 4})
        outcome = await service.prompt("c", "Покажи")
        self.assertEqual((outcome.status, outcome.reason, outcome.attempts), ("fallback", "invalid", 4))
        self.assertEqual((outcome.messages, outcome.text), (FALLBACK, "Только текст."))

    async def test_fallback_text_drops_the_json_and_keeps_the_text(self) -> None:
        """[SV-C27] fallback=text: after the repairs fail the answer is the text with messages [] (status fallback)."""
        service, _ = self.service({"c": [reply(broken(), "Таблица ниже.")] * 4}, reply__fallback="text")
        outcome = await service.prompt("c", "Покажи")
        self.assertEqual((outcome.status, outcome.fallback, outcome.messages), ("fallback", True, []))
        self.assertEqual(outcome.text, "Таблица ниже.")
        self.assertTrue(outcome.errors)
        self.assertEqual(service._chats["c"].surfaces.state.surfaces, {})

    async def test_single_surface_rule_is_sent_only_in_single_mode(self) -> None:
        """[SV-C26] surfaces=single adds the one-surface rule to prompts and actions; the default does not."""
        single, one = self.service({"c": [reply(example()), reply(again())]}, reply__surfaces="single")
        await single.prompt("c", "Форма")
        await single.action("c", "login", {"name": "submit"})
        many, other = self.service({"c": [reply(example())]})
        await many.prompt("c", "Форма")
        self.assertTrue(all(SINGLE_RULE in p for p in one["c"].prompts))
        self.assertNotIn(SINGLE_RULE, other["c"].prompts[0])

    def test_modes_are_validated(self) -> None:
        """[SV-C27] an unknown reply mode is a config error naming the setting."""
        for key in ("reply__ui", "reply__fallback", "reply__surfaces"):
            with self.assertRaisesRegex(ConfigError, key.replace("__", ".")):
                stub_settings(**{key: "sometimes"})


class ReplyModesHttpTest(unittest.TestCase):
    def test_text_only_and_text_with_failed_ui_over_http(self) -> None:
        """[SV-C27] over HTTP: ui=auto text-only → 200 ok, messages []; fallback=text → 200 fallback, [] + text."""
        app, _ = stub_app(
            self,
            {"t": ["Просто текст."], "f": [reply(broken(), "Сводка.")] * 4},
            reply__ui="auto",
            reply__fallback="text",
        )
        status, body, _ = call(app.url, "/prompt", {"chatId": "t", "text": "Вопрос"})
        self.assertEqual((status, body["status"], body["messages"], body["text"]), (200, "ok", [], "Просто текст."))
        status, body, _ = call(app.url, "/prompt", {"chatId": "f", "text": "Покажи"})
        self.assertEqual((status, body["status"], body["messages"], body["text"]), (200, "fallback", [], "Сводка."))


if __name__ == "__main__":
    unittest.main()
