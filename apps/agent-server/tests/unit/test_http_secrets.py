"""SV-C16: agent-originated text (RPC errors, start errors, validation problems quoting the reply) is redacted in HTTP
bodies like in the log: a registered secret never reaches a client (before, only the log was redacted)."""

import json
import unittest

from agentic_ui_server.acp.jsonrpc import RpcError
from agentic_ui_server.agent.errors import AgentStartError
from agentic_ui_server.log import register_secret
from agentic_ui_server.serve import App

from ..support.http_client import call, stub_app, stub_settings
from ..support.stub_session import broken, reply
from .test_http_api import FailingService

SECRET = "sk-http-body-secret-5550123"


class HttpSecretsTest(unittest.TestCase):
    def setUp(self) -> None:
        register_secret(SECRET)

    def test_outcome_and_progress_bodies_are_redacted(self) -> None:
        """[SV-C16] the fallback `errors`, the reply `text` and /progress `errors` never carry a registered secret."""
        steps = [reply(broken({f"x{SECRET}": 1}), text=f"key {SECRET}"), RpcError(-32603, f"auth failed for {SECRET}")]
        app, _ = stub_app(self, {"r": steps})
        status, body, _ = call(app.url, "/prompt", {"chatId": "r", "text": "x"})
        self.assertEqual((status, body["reason"]), (200, "agent_error"))
        self.assertNotIn(SECRET, json.dumps(body))
        self.assertIn("auth failed for ***", body["errors"][-1])
        status, progress, _ = call(app.url, "/progress?chatId=r")
        self.assertEqual(status, 200)
        self.assertNotIn(SECRET, json.dumps(progress))
        self.assertTrue(progress["errors"])

    def test_error_messages_are_redacted(self) -> None:
        """[SV-C16] a start error quoting the agent's message → 503 whose message is redacted."""
        app = App(stub_settings(), lambda s: FailingService(AgentStartError("rpc", f"-32000: {SECRET}"))).start()
        self.addCleanup(app.close)
        status, body, _ = call(app.url, "/prompt", {"chatId": "e", "text": "x"})
        self.assertEqual(status, 503)
        self.assertNotIn(SECRET, body["message"])


if __name__ == "__main__":
    unittest.main()
