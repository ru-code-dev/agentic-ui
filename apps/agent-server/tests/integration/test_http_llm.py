"""Tier 4 (opt-in): one real HTTP turn and one follow-up action on qwen-code + the machine's test LLM endpoint (at
most 3 model calls: each request may repair once, the two together use at most 3 replies).

The served ``App`` with the default service, same isolation as ``test_service_llm.py`` (temp qwen home copy, key
only in the child env, provider flags composed from ``WORKFLOW/llm.env``). GET /models → POST /model (the default
id, applied via the SV-C15 model call) → POST /prompt → GET /progress → POST /action on the created surface
(SV-C28: the reply is checked merged into the chat's surfaces). Run it alone:
``AGENTIC_UI_TEST_TIERS=4 "$WORKFLOW_PYTHON" -m unittest tests.integration.test_http_llm -v``.
"""

import json
import sys
import unittest

from agentic_ui_server.serve import App
from agentic_ui_server.validation import SurfaceState, validate_payload, validate_step

from ..support.http_client import call
from ..support.tiers import make_settings, temp_dir
from .test_real_qwen_llm import PASSTHROUGH, QWEN_CLI, require_llm, tier4_environ
from .test_service_llm import PASTE


class HttpLlmTest(unittest.TestCase):
    def setUp(self) -> None:
        self.llm = require_llm()
        self.tmp = temp_dir(self)
        environ = tier4_environ(self.tmp, self.llm)
        sets = {
            "agent.bin": str(QWEN_CLI),
            "agent.env_passthrough": PASSTHROUGH,
            "timeouts.turn_s": "180",
            "timeouts.start_s": "60",
            "repair.max_attempts": "1",  # a sanity turn: at most 2 LLM calls (first reply + 1 repair, SV-C17 budget)
            "server.port": "0",
            "server.base_path": "https://someserver.com/agent-api",
        }
        self.settings = make_settings(self.tmp, sets, environ)
        self.model = self.llm["AGENTIC_UI_LLM_DEFAULT"]
        self.assertIn(self.model, self.settings.agent.extra_args, "flags from llm.env")

    def test_one_real_http_turn(self) -> None:
        """[P6-http, SV-C6, SV-C25, SV-C7, SV-C28] real default model over HTTP: models, chat model set, pasted data →
        valid UI, then a follow-up action → a reply valid against the chat's merged surfaces."""
        app = App(self.settings).start()
        self.addCleanup(app.close)
        status, offered, _ = call(app.url, "/models")
        self.assertEqual(status, 200, offered)
        model = next(m["id"] for m in offered["models"] if m["id"].startswith(self.model))
        status, chosen, _ = call(app.url, "/model", {"chatId": "chat-tier4-http", "model": model})
        self.assertEqual((status, chosen["model"]), (200, model))

        status, body, _ = call(app.url, "/prompt", {"chatId": "chat-tier4-http", "text": PASTE})
        summary = {k: v for k, v in body.items() if k != "messages"} | {"messageCount": len(body.get("messages", []))}
        progress = call(app.url, "/progress?chatId=chat-tier4-http")[1]
        report = {"models": offered, "prompt": summary, "progress": progress}
        print(f"\n[tier4-http] {json.dumps(report, ensure_ascii=False)}", file=sys.stderr)
        self.assertEqual((status, body["status"]), (200, "ok"), body.get("errors"))
        self.assertEqual(validate_payload(body["messages"]), [])
        self.assertEqual(progress["state"], "done")
        state = validate_step(body["messages"], SurfaceState()).state
        sid = next(iter(state.surfaces))
        event = {"name": "refresh", "context": {"note": "show the totals in bold"}}
        status, action, _ = call(
            app.url, "/action", {"chatId": "chat-tier4-http", "surfaceId": sid, "event": event, "dataModel": None}
        )
        print(
            f"[tier4-http] action {json.dumps({k: v for k, v in action.items() if k != 'messages'})}", file=sys.stderr
        )
        self.assertEqual((status, action["status"]), (200, "ok"), action.get("errors"))
        self.assertEqual(validate_step(action["messages"], state).issues, [], "the follow-up fits the shown surfaces")
        self.assertLessEqual(body["attempts"] + action["attempts"], 3, "SV-C17 budget: at most 3 LLM calls")


if __name__ == "__main__":
    unittest.main()
