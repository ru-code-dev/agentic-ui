"""Tier 2: the built pyz from an empty dir against the ru-code fake qwen: --check-agent, one HTTP turn."""

import json
import sys
import unittest

from ..support.http_client import call
from ..support.pyz import ServerProcess, build_into, run_pyz
from ..support.stub_session import example, reply
from ..support.tiers import FAKE_ACP, base_environ, require, temp_dir


class PyzFakeQwenTest(unittest.TestCase):
    def setUp(self) -> None:
        require(2, FAKE_ACP)
        self.tmp = temp_dir(self)
        self.pyz = build_into(self.tmp)
        self.control = self.tmp / "control.json"

    def args(self, scenario: str) -> list[str]:
        sets = {
            "agent.bin": str(FAKE_ACP),
            "agent.base_args": "",
            "agent.acp_flag": "",
            "agent.inherit_env": "false",
            "agent.env": f"RU_CODE_FAKE_ACP={scenario},RU_CODE_FAKE_CONTROL_FILE={self.control}",
            "timeouts.start_s": "20",
        }
        return [a for k, v in sets.items() for a in ("--set", f"{k}={v}")]

    def test_check_agent_on_the_fake(self) -> None:
        """[SV-C2, P7-cli] pyz --check-agent against the ru-code fake (OK scenario)."""
        proc = run_pyz(self.pyz, "--check-agent", *self.args("OK"), env=base_environ(self.tmp))
        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = json.loads(proc.stdout)
        self.assertEqual((report["ok"], report["text"], report["stopReason"]), (True, "Готово.", "end_turn"))

    def test_one_http_turn_on_the_fake(self) -> None:
        """[SV-C2, P7-cli] the served pyz: /prompt → the fake's FLOW reply → valid UI over HTTP."""
        self.control.write_text(json.dumps({"responseText": reply(example())}, ensure_ascii=False), encoding="utf-8")
        argv = [sys.executable, "-I", str(self.pyz), "--port", "0", *self.args("FLOW")]
        server = ServerProcess(self, argv, base_environ(self.tmp), self.pyz.parent)
        status, body, _ = call(server.url, "/prompt", {"chatId": "pyz-fake", "text": "форма входа"})
        self.assertEqual((status, body["status"], body["attempts"], body["messages"]), (200, "ok", 1, example()))
        code, log = server.stop()
        self.assertEqual(code, 0, log)


if __name__ == "__main__":
    unittest.main()
