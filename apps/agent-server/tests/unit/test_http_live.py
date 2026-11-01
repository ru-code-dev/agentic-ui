"""HTTP API while a turn runs (stub sessions): cancel from a second request, progress polling, models, logs."""

import io
import logging
import threading
import time
import unittest

from agentic_ui_server.conversation.service import MODELS_PROBE_CHAT
from agentic_ui_server.http.contract import ROUTES
from agentic_ui_server.log import LOGGER_NAME, register_secret, setup_logging
from agentic_ui_server.resources import contract_version
from agentic_ui_server.settings import LogSettings

from ..support.http_client import call, stub_app
from ..support.stub_session import MODELS, again, broken, reply


def in_background(url: str, path: str, body: dict) -> tuple[threading.Thread, list]:
    result: list = []
    thread = threading.Thread(target=lambda: result.append(call(url, path, body)))
    thread.start()
    return thread, result


def fields(path: str) -> set[str]:
    return {f.name for f in next(r for r in ROUTES if r.path == path).response}


class HttpLiveTest(unittest.TestCase):
    def test_cancel_from_a_second_request_while_prompt_waits(self) -> None:
        """[SV-C6, P6-http] /cancel on another connection reaches the running turn; /prompt returns cancelled."""
        app, _ = stub_app(self, {"c": [("hang", 10)]})
        thread, result = in_background(app.url, "/prompt", {"chatId": "c", "text": "x"})
        time.sleep(0.2)
        started = time.monotonic()
        status, body, _ = call(app.url, "/cancel", {"chatId": "c"})
        self.assertEqual(
            (status, body), (200, {"chatId": "c", "cancelled": True, "contractVersion": contract_version()})
        )
        thread.join(5)
        status, outcome, _ = result[0]
        self.assertEqual(
            (status, outcome["status"], outcome["fallback"], outcome["messages"]), (200, "cancelled", False, [])
        )
        self.assertLess(time.monotonic() - started, 2)
        self.assertEqual(call(app.url, "/cancel", {"chatId": "idle"})[1]["cancelled"], False)

    def test_progress_polled_during_a_repair(self) -> None:
        """[SV-C20] GET /progress while /prompt waits: attempt n of max, errors, elapsed; then done."""
        app, _ = stub_app(self, {"p": [reply(broken()), ("hang", 0.6), reply(again())]})
        self.assertEqual(call(app.url, "/progress?chatId=p")[0], 404)
        thread, result = in_background(app.url, "/prompt", {"chatId": "p", "text": "x"})
        time.sleep(0.25)
        status, live, _ = call(app.url, "/progress?chatId=p")
        self.assertEqual(status, 200)
        self.assertEqual(set(live), fields("/progress"))
        self.assertEqual(
            (live["state"], live["attempt"], live["maxAttempts"], live["errorCount"]), ("repairing", 2, 4, 1)
        )
        self.assertIn("bogus", live["errors"][0])
        self.assertGreater(live["elapsedMs"], 100)
        thread.join(5)
        self.assertEqual(result[0][1]["status"], "ok")
        self.assertEqual(call(app.url, "/progress?chatId=p")[1]["state"], "done")
        self.assertEqual(call(app.url, "/progress")[0], 400)

    def test_models_listed_and_chat_model_applies_to_prompt_and_action(self) -> None:
        """[SV-C25, SV-C15] GET /models (CLI list, default, chat's current); POST /model applies to the chat's
        next turns, /action included; that is why it is its own endpoint and not a /prompt field."""
        app, sessions = stub_app(self, {"m": [reply(again()), reply(again())]})
        status, offered, _ = call(app.url, "/models")
        self.assertEqual(status, 200)
        self.assertEqual(set(offered), fields("/models"))
        self.assertEqual([m["id"] for m in offered["models"]], [m["modelId"] for m in MODELS["availableModels"]])
        self.assertEqual((offered["default"], offered["current"]), ("model-a", "model-a"))
        status, body, _ = call(app.url, "/model", {"chatId": "m", "model": "model-b"})
        self.assertEqual(
            (status, body), (200, {"chatId": "m", "model": "model-b", "contractVersion": contract_version()})
        )
        self.assertEqual(call(app.url, "/models?chatId=m")[1]["current"], "model-b")
        call(app.url, "/prompt", {"chatId": "m", "text": "x"})
        call(app.url, "/action", {"chatId": "m", "surfaceId": "s", "event": {"name": "go"}})
        self.assertEqual(sessions["m"].models_used, ["model-b", "model-b"])
        status, body, _ = call(app.url, "/model", {"chatId": "m", "model": "<not-offered>"})
        self.assertEqual((status, body["error"]), (400, "unknown_model"))
        self.assertEqual(call(app.url, "/model", {"chatId": "m", "model": ""})[1]["model"], "")
        self.assertEqual(call(app.url, "/models?chatId=m")[1]["current"], "model-a")

    def test_models_probe_never_shares_a_client_chat(self) -> None:
        """[SV-C11, SV-C19] the /models probe session has a chat id no client can send: a client chat named like
        the probe gets its own session (before, chat "__models__" reused the probe's agent process)."""
        app, sessions = stub_app(self, {"__models__": [reply(again())]})
        call(app.url, "/models")
        self.assertEqual(call(app.url, "/prompt", {"chatId": "__models__", "text": "x"})[1]["status"], "ok")
        self.assertEqual(len(sessions), 2, "probe and client chat are separate sessions")
        self.assertEqual(call(app.url, "/prompt", {"chatId": MODELS_PROBE_CHAT, "text": "x"})[0], 400)

    def test_requests_logged_without_bodies_or_secrets(self) -> None:
        """[SV-C16] one log line per request (method, path, status, outcome, chat, ms); errors at WARNING with the
        reason; request/response bodies and registered secrets never appear."""
        stream = io.StringIO()
        setup_logging(LogSettings(level="INFO"), stream)
        self.addCleanup(logging.getLogger(LOGGER_NAME).handlers.clear)
        secret = "sk-http-secret-1234567890"
        register_secret(secret)
        app, _ = stub_app(self, {"l": [reply(again())]}, log__level="INFO")
        setup_logging(LogSettings(level="INFO"), stream)
        call(app.url, "/prompt", {"chatId": "l", "text": f"ключ {secret} и ПАСТА-ДАННЫЕ"})
        call(app.url, "/prompt", {"chatId": "l"})
        call(app.url, "/prompt", raw=b"{broken")
        log = stream.getvalue()
        self.assertRegex(log, r"INFO agentic_ui_server\.http: HTTP POST /api/prompt → 200 ok chat=l \d+ms")
        self.assertRegex(
            log, r"WARNING agentic_ui_server\.http: HTTP POST /api/prompt → 400 bad_request chat=l .*'text'"
        )
        self.assertIn("→ 400 bad_json chat=-", log)
        self.assertNotIn(secret, log)
        self.assertNotIn("ПАСТА-ДАННЫЕ", log)
        self.assertNotIn("Готово", log)


if __name__ == "__main__":
    unittest.main()
