"""Tier 2: the HTTP API end to end on the ru-code fake ACP agent (real processes, real sockets on 127.0.0.1).

/prompt with an invalid first reply repaired in the same session while /progress is polled; /cancel from a second
request while /prompt waits on a turn that never ends by itself (HOLD).
"""

import threading
import time
import unittest

from agentic_ui_server.agent.manager import SessionManager
from agentic_ui_server.agent.session import AgentSession
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.resources import AgentFiles
from agentic_ui_server.serve import App

from ..support.http_client import call
from ..support.stub_session import again, broken, example, reply
from ..support.tiers import FAKE_ACP, base_environ, make_settings, require, temp_dir
from .test_service_fake_qwen import ScriptedFlowSession


class HttpFakeQwenTest(unittest.TestCase):
    def setUp(self) -> None:
        require(2, FAKE_ACP)
        self.tmp = temp_dir(self)

    def app(self, scenario: str, replies: list | None = None) -> App:
        control = self.tmp / "control.json"
        values = {
            "agent.bin": str(FAKE_ACP),
            "agent.base_args": "",
            "agent.acp_flag": "",
            "timeouts.start_s": "20",
            "timeouts.turn_s": "15",
            "timeouts.cancel_grace_s": "1.5",
            "server.port": "0",
            "agent.env": f"RU_CODE_FAKE_ACP={scenario},RU_CODE_FAKE_CONTROL_FILE={control}",
        }
        settings = make_settings(self.tmp, values, base_environ(self.tmp))

        def factory(chat_id: str) -> AgentSession:
            if replies is None:
                return AgentSession(settings, chat_id, files=AgentFiles())
            session = ScriptedFlowSession(settings, chat_id, files=AgentFiles())
            session.replies, session.control, session.sent = list(replies), str(control), []
            return session

        app = App(settings, lambda s: ChatService(s, SessionManager(s, files=AgentFiles(), session_factory=factory)))
        self.addCleanup(app.close)
        return app.start()

    def background(self, app: App, path: str, body: dict) -> tuple[threading.Thread, list]:
        result: list = []
        thread = threading.Thread(target=lambda: result.append(call(app.url, path, body)))
        thread.start()
        return thread, result

    def test_http_prompt_repaired_while_progress_is_polled(self) -> None:
        """[P6-http, SV-C6, SV-C20] fake qwen over HTTP: invalid reply → repair (slow) → valid UI; /progress shows
        attempt 2 of 4 with the error while /prompt waits."""
        slow_fix = {"responseText": reply(example()), "delayMs": 2500}
        app = self.app("FLOW", [reply(broken()), slow_fix])
        thread, result = self.background(app, "/prompt", {"chatId": "h2", "text": "Покажи форму входа"})
        seen, deadline = [], time.monotonic() + 15
        while thread.is_alive() and time.monotonic() < deadline:
            status, live, _ = call(app.url, "/progress?chatId=h2")
            if status == 200:
                seen.append((live["state"], live["attempt"], live["maxAttempts"], live["errorCount"]))
            time.sleep(0.2)
        thread.join(5)
        status, body, _ = result[0]
        self.assertEqual((status, body["status"], body["attempts"], body["messages"]), (200, "ok", 2, example()))
        self.assertIn(("repairing", 2, 4, 1), seen)
        self.assertEqual(call(app.url, "/progress?chatId=h2")[1]["state"], "done")

    def test_http_cancel_from_a_second_request(self) -> None:
        """[SV-C6, P6-http] fake qwen HOLD: /cancel on a second connection ends the waiting /prompt as cancelled."""
        app = self.app("HOLD")
        thread, result = self.background(app, "/prompt", {"chatId": "h2c", "text": "long"})
        time.sleep(1.5)
        started = time.monotonic()
        status, body, _ = call(app.url, "/cancel", {"chatId": "h2c"})
        self.assertEqual((status, body["cancelled"]), (200, True))
        thread.join(10)
        status, outcome, _ = result[0]
        self.assertEqual((status, outcome["status"], outcome["fallback"]), (200, "cancelled", False))
        self.assertLess(time.monotonic() - started, 4)

    def test_http_repair_of_rolls_back_a_page_rejected_turn(self) -> None:
        """[DEC-064] fake qwen over HTTP: login (ok), signup (ok, the page rejects it: render error), the page's
        repair with repairOf = its turnId re-creates signup: valid on attempt 1 against the rolled-back state; the
        same repair without repairOf is invalid against the state with the rejected turn in it."""
        login, signup = example("01-login"), example("02-signup")
        app = self.app("FLOW", [reply(login), reply(signup), reply(signup), reply(signup), reply(again("02-signup"))])
        call(app.url, "/prompt", {"chatId": "h2r", "text": "login"})
        _, rejected, _ = call(app.url, "/prompt", {"chatId": "h2r", "text": "signup"})
        self.assertEqual(rejected["status"], "ok")
        repair = {"chatId": "h2r", "text": "Страница отклонила интерфейс: Button «send» render failed"}
        status, body, _ = call(app.url, "/prompt", repair | {"repairOf": rejected["turnId"]})
        self.assertEqual((status, body["status"], body["attempts"], body["messages"]), (200, "ok", 1, signup))
        status, control, _ = call(app.url, "/prompt", repair)
        self.assertEqual((status, control["status"], control["attempts"]), (200, "ok", 2))


if __name__ == "__main__":
    unittest.main()
