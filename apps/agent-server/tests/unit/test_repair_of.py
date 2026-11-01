"""DEC-064 (A4F-O1): a reply the page rejects after the server accepted it is rolled back by the repair's ``repairOf``.

The chat shows the login form (turn A); the next reply creates the signup surface (turn B, ``ok`` on the server);
the page rejects B (a render error); the page's repair turn re-creates the signup surface. Checked against the
server's state with B in it, that re-create is invalid ("already shown"); after the rollback it is valid at once.
"""

import unittest

from agentic_ui_server.agent.manager import SessionManager
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.conversation.turns import ChatSurfaces
from agentic_ui_server.resources import AgentFiles
from agentic_ui_server.validation import SurfaceState

from ..support.http_client import call, stub_app, stub_settings
from ..support.stub_session import StubSession, example, reply

LOGIN, SIGNUP = example("01-login"), example("02-signup")
REPAIR = "Страница отклонила интерфейс из последнего ответа. Ошибки:\n- Button «send»: render failed"


class RepairOfTest(unittest.IsolatedAsyncioTestCase):
    def service(self, steps: list) -> tuple[ChatService, StubSession]:
        settings = stub_settings()
        session = StubSession("c", steps)
        manager = SessionManager(settings, files=AgentFiles(), session_factory=lambda _c: session)
        self.addAsyncCleanup(manager.shutdown)
        return ChatService(settings, manager), session

    def shown(self, service: ChatService) -> list[str]:
        return sorted(service._chats["c"].surfaces.state.surfaces)

    async def test_repair_of_rolls_back_the_rejected_turn(self) -> None:
        """[DEC-064] repairOf = the rejected turn's turnId: the state goes back to before it, so the repaired reply
        is checked against what the page shows (the re-created signup surface is valid on attempt 1)."""
        service, session = self.service([reply(LOGIN), reply(SIGNUP), reply(SIGNUP)])
        first = await service.prompt("c", "login form")
        rejected = await service.prompt("c", "add a signup form")
        self.assertEqual((first.status, rejected.status), ("ok", "ok"))
        self.assertRegex(rejected.turn_id or "", r"^[0-9a-f]{16}$")
        self.assertNotEqual(first.turn_id, rejected.turn_id)
        self.assertEqual(self.shown(service), ["login", "signup"])
        repaired = await service.prompt("c", REPAIR, repair_of=rejected.turn_id)
        self.assertEqual((repaired.status, repaired.attempts), ("ok", 1), repaired.errors)
        self.assertEqual(self.shown(service), ["login", "signup"])
        self.assertIn("render failed", session.prompts[2])

    async def test_without_repair_of_the_rejected_turn_stays_in_the_state(self) -> None:
        """[DEC-064] control: the same repair without repairOf is checked against the state with turn B in it, so
        re-creating the signup surface is invalid and goes through the repair loop."""
        service, session = self.service([reply(LOGIN), reply(SIGNUP), reply(SIGNUP), reply([])])
        await service.prompt("c", "login form")
        await service.prompt("c", "add a signup form")
        repaired = await service.prompt("c", REPAIR)
        self.assertNotEqual((repaired.status, repaired.attempts), ("ok", 1))
        self.assertIn("signup", session.prompts[3])

    async def test_repair_of_anything_but_the_latest_turn_changes_nothing(self) -> None:
        """[DEC-064] an older turnId or an unknown one: no rollback (the page did not reject the latest turn)."""
        service, _ = self.service([reply(LOGIN), reply(SIGNUP), *[reply([])] * 3])
        first = await service.prompt("c", "login form")
        await service.prompt("c", "add a signup form")
        await service.prompt("c", "x", repair_of=first.turn_id)
        self.assertEqual(self.shown(service), ["login", "signup"])
        await service.prompt("c", "x", repair_of="0123456789abcdef")
        self.assertEqual(self.shown(service), ["login", "signup"])

    def test_chat_surfaces_undo_only_the_latest_unchanged_turn(self) -> None:
        """[DEC-064] ChatSurfaces: accept → rollback restores the state before; a second rollback, an older id, or
        a state replaced since (an action's data model) are ignored."""
        before, after, other = SurfaceState(), SurfaceState(), SurfaceState()
        chat = ChatSurfaces(before)
        turn = chat.accept(after)
        self.assertFalse(chat.rollback("nope"))
        self.assertTrue(chat.rollback(turn))
        self.assertIs(chat.state, before)
        self.assertFalse(chat.rollback(turn))
        turn = chat.accept(after)
        chat.replace(other)
        self.assertFalse(chat.rollback(turn))
        self.assertIs(chat.state, other)
        self.assertFalse(chat.rollback(None))


class RepairOfHttpTest(unittest.TestCase):
    def test_http_turn_id_and_repair_of(self) -> None:
        """[DEC-064] HTTP: an ok outcome carries turnId (a fallback: null); /prompt takes an optional string
        repairOf (another type → 400) and the repair is checked against the rolled-back state."""
        steps = {"h": [reply(LOGIN), reply(SIGNUP), reply(SIGNUP)], "f": ["no ui block"] * 4}
        app, _ = stub_app(self, steps)
        _, first, _ = call(app.url, "/prompt", {"chatId": "h", "text": "login"})
        _, rejected, _ = call(app.url, "/prompt", {"chatId": "h", "text": "signup"})
        self.assertRegex(rejected["turnId"], r"^[0-9a-f]{16}$")
        status, bad, _ = call(app.url, "/prompt", {"chatId": "h", "text": "x", "repairOf": 5})
        self.assertEqual((status, bad["error"]), (400, "bad_request"))
        body = {"chatId": "h", "text": REPAIR, "repairOf": rejected["turnId"]}
        status, repaired, _ = call(app.url, "/prompt", body)
        self.assertEqual((status, repaired["status"], repaired["attempts"]), (200, "ok", 1), repaired["errors"])
        _, fallback, _ = call(app.url, "/prompt", {"chatId": "f", "text": "x"})
        self.assertEqual((fallback["status"], fallback["turnId"]), ("fallback", None))
        self.assertNotEqual(first["turnId"], rejected["turnId"])


if __name__ == "__main__":
    unittest.main()
