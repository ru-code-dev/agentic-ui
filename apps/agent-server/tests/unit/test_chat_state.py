"""SV-C28 in the chat service: every reply is checked merged into what the chat already shows (A4-09, A4-25).

Reviewer reproduction (A4-09, attack/server/test_patch_validation.py): an action reply patching the shown login
surface with a dangling child passed as ``ok`` on attempt 1; the page then rejected the surface.
"""

import unittest

from agentic_ui_server.agent.manager import SessionManager
from agentic_ui_server.conversation.fallback import fallback_payload
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.resources import AgentFiles
from agentic_ui_server.validation import SurfaceState, validate_step

from ..support.http_client import stub_settings
from ..support.stub_session import StubSession, example, reply

BASE = example("01-login")
SID = BASE[0]["createSurface"]["surfaceId"]
V = "v0.9"


def patch(*components: dict, sid: str = SID) -> list:
    return [{"version": V, "updateComponents": {"surfaceId": sid, "components": list(components)}}]


DANGLING = patch({"id": "root", "component": "Box", "children": ["notice"]})
GOOD = patch({"id": "title", "component": "Heading", "text": "Добро пожаловать"})
SUBMIT = {"name": "login.submit", "context": {}}


class ChatStateTest(unittest.IsolatedAsyncioTestCase):
    def service(self, steps: list) -> tuple[ChatService, StubSession, SessionManager]:
        settings = stub_settings()
        session = StubSession("c", steps)
        manager = SessionManager(settings, files=AgentFiles(), session_factory=lambda _c: session)
        self.addAsyncCleanup(manager.shutdown)
        return ChatService(settings, manager), session, manager

    async def test_action_patch_is_checked_against_the_shown_surface(self) -> None:
        """[SV-C28, A4-09] a patch whose root names a child nobody defines is invalid against the shown surface: it
        goes through the repair loop with the exact error and what the page shows; the repaired patch is ok."""
        service, session, _ = self.service([reply(BASE), reply(DANGLING), reply(GOOD)])
        self.assertEqual((await service.prompt("c", "login form")).status, "ok")
        out = await service.action("c", SID, SUBMIT, {})
        self.assertEqual((out.status, out.attempts), ("ok", 2))
        self.assertIn("references non-existent component 'notice'", session.prompts[2])
        self.assertIn(f"The page already shows: '{SID}' (components: root,", session.prompts[2])

    async def test_update_of_a_surface_the_chat_lacks_is_repaired(self) -> None:
        """[SV-C28, A4-25] an update of a surfaceId the chat never showed is invalid (the renderer would throw
        "Surface not found" and drop the rest of the reply)."""
        service, session, _ = self.service(
            [reply(BASE), reply(patch(*GOOD[0]["updateComponents"]["components"], sid="nope")), reply(GOOD)]
        )
        await service.prompt("c", "login form")
        out = await service.action("c", SID, SUBMIT, {})
        self.assertEqual((out.status, out.attempts), ("ok", 2))
        self.assertIn("Surface not found for message: nope", session.prompts[2])

    async def test_first_reply_may_not_update_an_unknown_surface(self) -> None:
        """[SV-C28] a new chat shows nothing: a reply that only patches is invalid (in a fresh chat too)."""
        service, session, _ = self.service([reply(GOOD), reply(BASE)])
        out = await service.prompt("c", "x")
        self.assertEqual((out.status, out.attempts), ("ok", 2))
        self.assertIn(f"Surface not found for message: {SID}", session.prompts[1])

    async def test_state_changes_only_after_a_valid_reply(self) -> None:
        """[SV-C28] a fallback leaves the chat's state as it was: the next patch is checked against the last valid
        UI (the login form), not against the rejected reply."""
        service, _, _ = self.service([reply(BASE), *[reply(DANGLING)] * 4, reply(GOOD)])
        await service.prompt("c", "login form")
        self.assertEqual((await service.action("c", SID, SUBMIT, {})).status, "fallback")
        self.assertEqual((await service.prompt("c", "rename the title")).status, "ok")
        self.assertIn("title", service._chats["c"].surfaces.state.surfaces[SID].components)

    async def test_the_action_data_model_replaces_the_servers_copy(self) -> None:
        """[SV-C28, A4-26] the page's data (inputs included) is what a reply is checked against: the action sends
        /form/email as an object, so a reply keeping the email input bound to it is invalid (bound-value rule)."""
        service, session, _ = self.service([reply(BASE), reply(GOOD), reply(GOOD)])
        await service.prompt("c", "login form")
        page_data = {"form": {"email": {"nested": 1}, "password": "", "remember": True}}
        await service.action("c", SID, SUBMIT, page_data)
        self.assertIn("binds 'value' to '/form/email', which holds an object", session.prompts[2])

    async def test_a_forgotten_chat_forgets_its_surfaces(self) -> None:
        """[SV-C28] the reaper forgets a chat's surfaces with it: a patch after that is an unknown surface."""
        service, session, _ = self.service([reply(BASE), reply(GOOD), reply(BASE)])
        await service.prompt("c", "login form")
        service._forget(0.0, ["c"])
        out = await service.prompt("c", "rename the title")
        self.assertEqual(out.attempts, 2)
        self.assertIn("Surface not found for message", session.prompts[2])

    def test_a_second_fallback_in_a_chat_is_valid(self) -> None:
        """[SV-C28, SV-C9] the fallback deletes its surface first, so it is valid in a chat already showing it."""
        first = validate_step(fallback_payload(), SurfaceState())
        self.assertEqual(first.issues, [])
        self.assertEqual(validate_step(fallback_payload(), first.state).issues, [])


if __name__ == "__main__":
    unittest.main()
