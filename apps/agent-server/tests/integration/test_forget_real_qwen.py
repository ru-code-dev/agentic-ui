"""A4-11 tier 3 (real qwen-code + the fake LLM, no real LLM call): a forgotten chat leaves no transcript.

Reviewer reproduction (attack/server/test_forget_qwen_home.py): the reaper removed the chat's cwd, but qwen keeps the
conversation (the pasted data) under the agent HOME: .qwen/projects/<cwd slug>/chats/<session>.jsonl.
"""

import shlex
import time
import unittest
from pathlib import Path

from agentic_ui_server.serve import App
from agentic_ui_server.settings import EXCLUDED_TOOLS

from ..support.fake_llm import FakeLlm
from ..support.http_client import call
from ..support.stub_session import example, reply
from ..support.tiers import QWEN_CLI, QWEN_HOME, base_environ, make_settings, require, temp_dir
from .test_http_real_qwen import dev_qwen_home

SECRET_ROW = "Анна-A4-PII,1200"


class ForgetRealQwenTest(unittest.TestCase):
    def test_a_forgotten_chat_leaves_no_transcript(self) -> None:
        """[A4-11, SV-C28] after the reaper forgets the chat: its cwd, qwen's project dir (transcript with the
        pasted row) and tmp dir under the agent HOME are gone; nothing in the HOME holds the pasted row."""
        require(3, QWEN_CLI, QWEN_HOME / ".qwen" / "settings.json")
        tmp = temp_dir(self)
        llm = FakeLlm([{"content": reply(example()), "chunks": 2}]).start()
        self.addCleanup(llm.stop)
        sets = {
            "agent.bin": str(QWEN_CLI),
            "agent.base_args": shlex.join(["--core-tools", "none", "--exclude-tools", EXCLUDED_TOOLS]),
            "agent.env": "AGENTIC_UI_LLM_KEY=fake-key,OPENAI_API_KEY=fake-key,"
            f"OPENAI_BASE_URL={llm.base_url},QWEN_SANDBOX=false",
            "timeouts.start_s": "60",
            "timeouts.turn_s": "60",
            "server.port": "0",
        }
        environ = base_environ(tmp)
        home = Path(environ["HOME"])
        dev_qwen_home(home, llm.base_url)
        app = App(make_settings(tmp, sets, environ)).start()
        self.addCleanup(app.close)
        status, body, _ = call(app.url, "/prompt", {"chatId": "pii", "text": f"Имя,Сумма\n{SECRET_ROW}\n\nТаблица"})
        self.assertEqual((status, body["status"]), (200, "ok"), body)
        cwd = app.service.manager.session("pii").cwd
        kept = [p for p in (home / ".qwen").rglob("*.jsonl") if SECRET_ROW in p.read_text(errors="replace")]
        self.assertTrue(kept, "qwen wrote the transcript (the test sees what it removes)")
        app.loop.run(app.service.manager.reap_idle(time.monotonic() + 10**7))
        self.assertFalse(cwd.exists())
        left = [p for p in (home / ".qwen").rglob("*.jsonl") if SECRET_ROW in p.read_text(errors="replace")]
        self.assertEqual(left, [], "the forgotten chat's pasted data stays in the agent HOME")
        self.assertEqual([p for p in (home / ".qwen").rglob("*") if cwd.name in p.name], [])


if __name__ == "__main__":
    unittest.main()
