"""HTTP API over a real socket with stub agent sessions: routes, response shape, status codes, CORS, base path."""

import sys
import threading
import time
import unittest

from agentic_ui_server.agent.manager import ManagerClosed
from agentic_ui_server.config import ConfigError, load_settings
from agentic_ui_server.conversation.fallback import FALLBACK
from agentic_ui_server.http.contract import OUTCOME, ROUTES, route_prefix
from agentic_ui_server.serve import App

from ..support.http_client import call, stub_app, stub_settings
from ..support.stub_session import broken, example, reply

OUTCOME_KEYS = {f.name for f in OUTCOME} | {"contractVersion"}  # DEC-056: in every answer


class FailingService:
    """Raises ``error`` from every use case (500 / 503 paths)."""

    def __init__(self, error: BaseException) -> None:
        self.error = error

    async def prompt(self, *args):
        raise self.error

    async def action(self, *args):
        raise self.error


class HttpApiTest(unittest.TestCase):
    def test_prompt_returns_the_outcome_json(self) -> None:
        """[P6-http, SV-C6] POST {base}/prompt waits for the turn (+ repair) and returns one JSON outcome."""
        app, sessions = stub_app(self, {"c1": [reply(broken()), reply(example())]})
        status, body, headers = call(app.url, "/prompt", {"chatId": "c1", "text": "Имя,Сумма\nАнна,1"})
        self.assertEqual(status, 200)
        self.assertEqual(set(body), OUTCOME_KEYS)
        self.assertEqual((body["chatId"], body["status"], body["attempts"], body["fallback"]), ("c1", "ok", 2, False))
        self.assertEqual(body["messages"], example())
        self.assertIn("application/json", headers["Content-Type"])
        self.assertIn("Анна", sessions["c1"].prompts[0])

    def test_action_turn_and_fallback_shape(self) -> None:
        """[P6-http, SV-C9] /action runs an action turn; used-up attempts give the fallback body (200, fallback)."""
        app, sessions = stub_app(self, {"c2": [reply(example()), *[reply(broken())] * 4]})
        call(app.url, "/prompt", {"chatId": "c2", "text": "x"})
        action = {"chatId": "c2", "surfaceId": "s", "event": {"name": "save", "context": {"a": 1}}, "dataModel": {}}
        status, body, _ = call(app.url, "/action", action)
        self.assertEqual(
            (status, body["status"], body["fallback"], body["messages"]), (200, "fallback", True, FALLBACK)
        )
        self.assertEqual((body["attempts"], body["reason"]), (4, "invalid"))
        self.assertIn('"name": "save"', sessions["c2"].prompts[1])

    def test_bad_requests_name_the_problem(self) -> None:
        """[P6-http] 400 bad JSON / missing or mistyped fields, 404 unknown path, 405 wrong method."""
        app, _ = stub_app(self, {})
        cases = [
            ("/prompt", {"raw": b"{nope"}, 400, "bad_json"),
            ("/prompt", {"raw": b"[1]"}, 400, "bad_request"),
            ("/prompt", {"body": {"chatId": "c"}}, 400, "bad_request"),
            ("/prompt", {"body": {"chatId": "c", "text": 5}}, 400, "bad_request"),
            ("/prompt", {"body": {"chatId": "", "text": "x"}}, 400, "bad_request"),
            ("/action", {"body": {"chatId": "c", "surfaceId": "s", "event": {}}}, 400, "bad_request"),
            ("/nope", {"body": {}}, 404, "not_found"),
            ("/prompt", {"method": "GET"}, 405, "method_not_allowed"),
        ]
        for path, kwargs, code, error in cases:
            with self.subTest(path=path, kwargs=kwargs):
                status, body, _ = call(app.url, path, **kwargs)
                self.assertEqual((status, body["error"]), (code, error))
        self.assertIn("'text'", call(app.url, "/prompt", {"chatId": "c"})[1]["message"])
        self.assertEqual(call(app.url.removesuffix("/api"), "/other/prompt", {})[0], 404)

    def test_body_over_the_limit_is_413(self) -> None:
        """[P6-http] server.max_body_bytes caps the request body."""
        app, _ = stub_app(self, {}, server__max_body_bytes="200")
        status, body, _ = call(app.url, "/prompt", {"chatId": "c", "text": "x" * 500})
        self.assertEqual((status, body["error"]), (413, "too_large"))

    def test_queue_full_is_429(self) -> None:
        """[P6-http] a second request for a busy chat beyond limits.max_queue_per_chat → 429."""
        app, _ = stub_app(self, {"q": [("hang", 1.0)]}, limits__max_queue_per_chat="0")
        first = threading.Thread(target=call, args=(app.url, "/prompt", {"chatId": "q", "text": "x"}))
        first.start()
        time.sleep(0.2)
        status, body, _ = call(app.url, "/prompt", {"chatId": "q", "text": "y"})
        first.join()
        self.assertEqual((status, body["error"]), (429, "queue_full"))

    def test_server_error_is_500_with_the_fallback_body(self) -> None:
        """[P6-http, SV-C9] an unexpected error → 500 whose body is the fallback outcome; shutdown → 503."""
        app = App(stub_settings(), lambda s: FailingService(RuntimeError("boom"))).start()
        self.addCleanup(app.close)
        status, body, _ = call(app.url, "/prompt", {"chatId": "e", "text": "x"})
        self.assertEqual(
            (status, body["status"], body["reason"], body["messages"]), (500, "fallback", "server_error", FALLBACK)
        )
        self.assertEqual(set(body), OUTCOME_KEYS)
        closed = App(stub_settings(), lambda s: FailingService(ManagerClosed("down"))).start()
        self.addCleanup(closed.close)
        self.assertEqual(call(closed.url, "/prompt", {"chatId": "e", "text": "x"})[:2][0], 503)

    def test_health(self) -> None:
        """[P6-http] /health: 200 when agent.bin resolves, 503 degraded when it does not."""
        app, _ = stub_app(self, {}, agent__bin=sys.executable)
        status, body, _ = call(app.url, "/health")
        self.assertEqual((status, body["status"], body["agentFound"], body["liveSessions"]), (200, "ok", True, 0))
        missing, _ = stub_app(self, {}, agent__bin="/nonexistent/qwen")
        status, body, _ = call(missing.url, "/health")
        self.assertEqual((status, body["status"], body["agentFound"]), (503, "degraded", False), "P6-D5")

    def test_base_path_absolute_url_or_path_and_host_port(self) -> None:
        """[SV-C12] server.base_path takes a path or an absolute URL (its path); host/port from config."""
        self.assertEqual(route_prefix("https://someserver.com/agent-api/"), "/agent-api")
        self.assertEqual((route_prefix("/some-path/api"), route_prefix("/")), ("/some-path/api", ""))
        app, _ = stub_app(self, {}, server__base_path="https://someserver.com/agent-api", agent__bin=sys.executable)
        self.assertTrue(app.url.endswith("/agent-api"))
        self.assertEqual(call(app.url, "/health")[0], 200)
        root, _ = stub_app(self, {}, server__base_path="/", agent__bin=sys.executable)
        self.assertEqual(call(root.url, "/health")[0], 200)
        self.assertEqual(root.http.server_address[0], "127.0.0.1")
        self.assertNotEqual(root.http.port, 0)
        with self.assertRaises(ConfigError):
            load_settings(["--set", "server.base_path=api"], {"HOME": "/h"})

    def test_cors_only_for_configured_origins(self) -> None:
        """[P6-http] CORS headers and the 204 preflight only for server.cors_origins."""
        origin = {"Origin": "https://someserver.com"}
        app, _ = stub_app(self, {}, server__cors_origins="https://someserver.com", agent__bin=sys.executable)
        status, _, headers = call(app.url, "/health", headers=origin)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "https://someserver.com")
        status, _, headers = call(app.url, "/prompt", method="OPTIONS", headers=origin)
        self.assertEqual((status, headers.get("Access-Control-Allow-Methods")), (204, "GET, POST, OPTIONS"))
        plain, _ = stub_app(self, {}, agent__bin=sys.executable)
        self.assertNotIn("Access-Control-Allow-Origin", call(plain.url, "/health", headers=origin)[2])

    def test_every_route_is_served(self) -> None:
        """[P6-http, SV-C23] every documented route reaches its handler (no 404/405)."""
        app, _ = stub_app(self, {"r": [reply(example())]}, agent__bin=sys.executable)
        bodies = {
            "prompt": {"chatId": "r", "text": "x"},
            "action": {"chatId": "r", "surfaceId": "s", "event": {"name": "n"}},
        }
        for route in ROUTES:
            body = bodies.get(route.handler, {"chatId": "r", "model": ""}) if route.method == "POST" else None
            status = call(app.url, f"{route.path}?chatId=r", body, method=route.method)[0]
            with self.subTest(route=route.path):
                self.assertNotIn(status, (404, 405))


if __name__ == "__main__":
    unittest.main()
