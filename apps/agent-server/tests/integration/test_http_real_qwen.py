"""Tier 3: one HTTP turn on real qwen-code 0.21.1 + the stdlib fake LLM (the served ``App`` with the default service).

GET /models (qwen's session/new list), POST /prompt → valid UI in one LLM call, GET /progress, GET /health.
The agent's HOME holds the dev qwen-home's ``settings.json`` (``scripts/setup-workflow.sh``) with its preset
providers pointed at the fake LLM, so /models is the dev list (SV-C25, SV-C17) and no request leaves the machine.
"""

import json
import shlex
import unittest
from pathlib import Path

from agentic_ui_server.serve import App
from agentic_ui_server.settings import EXCLUDED_TOOLS

from ..support.fake_llm import FakeLlm
from ..support.http_client import call
from ..support.stub_session import example, reply
from ..support.tiers import QWEN_CLI, QWEN_HOME, base_environ, llm_env, make_settings, require, temp_dir

# The dev qwen-home's models come from WORKFLOW/llm.env (generic ids); qwen 0.21.1 names a model "<id>(<authType>)".
DEV_MODELS = [m for m in llm_env().get("AGENTIC_UI_LLM_MODELS", "").split(",") if m]
QWEN_IDS = [f"{model}(openai)" for model in DEV_MODELS]


def dev_qwen_home(home: Path, base_url: str) -> None:
    """``<home>/.qwen/settings.json`` = the dev qwen-home's, every provider's baseUrl → ``base_url``."""
    settings = json.loads((QWEN_HOME / ".qwen" / "settings.json").read_text(encoding="utf-8"))
    for providers in settings["modelProviders"].values():
        for provider in providers:
            provider["baseUrl"] = base_url
    (home / ".qwen").mkdir(parents=True, exist_ok=True)
    (home / ".qwen" / "settings.json").write_text(json.dumps(settings), encoding="utf-8")


class HttpRealQwenTest(unittest.TestCase):
    def setUp(self) -> None:
        require(3, QWEN_CLI, QWEN_HOME / ".qwen" / "settings.json")
        self.tmp = temp_dir(self)

    def test_one_http_turn(self) -> None:
        """[P6-http, SV-C6, SV-C25, SV-C17] real qwen + fake LLM over HTTP: /models is exactly the dev models
        (the default current), pasted data → valid UI."""
        if not QWEN_IDS:
            self.skipTest("WORKFLOW/llm.env has no AGENTIC_UI_LLM_MODELS")
        llm = FakeLlm([{"content": reply(example()), "chunks": 4}]).start()
        self.addCleanup(llm.stop)
        sets = {
            "agent.bin": str(QWEN_CLI),
            "agent.base_args": shlex.join(["--core-tools", "none", "--exclude-tools", EXCLUDED_TOOLS]),
            "agent.env": f"AGENTIC_UI_LLM_KEY=fake-key,OPENAI_API_KEY=fake-key,OPENAI_BASE_URL={llm.base_url},"
            "QWEN_SANDBOX=false",
            "timeouts.start_s": "60",
            "timeouts.turn_s": "60",
            "server.port": "0",
        }
        environ = base_environ(self.tmp)
        dev_qwen_home(Path(environ["HOME"]), llm.base_url)
        app = App(make_settings(self.tmp, sets, environ)).start()
        self.addCleanup(app.close)

        status, offered, _ = call(app.url, "/models")
        self.assertEqual(status, 200, offered)
        self.assertEqual([m["id"] for m in offered["models"]], QWEN_IDS, "exactly the dev presets, in order")
        self.assertEqual((offered["default"], offered["current"]), (QWEN_IDS[0], QWEN_IDS[0]))
        status, body, _ = call(app.url, "/prompt", {"chatId": "h3", "text": "Имя,Сумма\nАнна,1200\n\nФорма входа"})
        self.assertEqual((status, body["status"], body["attempts"]), (200, "ok", 1), body)
        self.assertEqual(body["messages"], example())
        self.assertEqual(len(llm.chat_requests()), 1, "one LLM call, no follow-up")
        self.assertEqual(call(app.url, "/progress?chatId=h3")[1]["state"], "done")
        health = call(app.url, "/health")[1]
        self.assertGreaterEqual(health["liveSessions"], 1)


if __name__ == "__main__":
    unittest.main()
