"""__main__: ``--check-agent`` end to end against the scripted agent, as a real subprocess; config errors."""

import json
import subprocess
import sys
import unittest
from pathlib import Path

from ..support.http_client import call
from ..support.pyz import ServerProcess
from ..support.tiers import SCRIPTED_AGENT, SRC_DIR, base_environ, temp_dir

SECRET = "sk-main-secret-0987654321"


def run_main(tmp: Path, *args: str, env_extra: dict[str, str] | None = None) -> subprocess.CompletedProcess:
    env = {**base_environ(tmp), "PYTHONPATH": str(SRC_DIR), **(env_extra or {})}
    return subprocess.run(
        [sys.executable, "-m", "agentic_ui_server", *args], capture_output=True, text=True, env=env, cwd=tmp, timeout=30
    )


class MainTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = temp_dir(self)
        self.script = self.tmp / "script.json"
        self.script.write_text(json.dumps({"prompts": [[{"chunk": "OK"}, {"usage": {"inputTokens": 1}}]]}))

    def check_args(self) -> list[str]:
        return [
            "--check-agent",
            "--agent-bin",
            sys.executable,
            "--set",
            f"agent.base_args=-I {SCRIPTED_AGENT}",
            "--set",
            "agent.acp_flag=",
            "--set",
            "agent.auth_method=",
            "--set",
            f"agent.env=SCRIPTED_AGENT_SCRIPT={self.script},OPENAI_API_KEY={SECRET}",
            "--set",
            "agent.inherit_env=false",
        ]

    def test_check_agent_reports_json(self) -> None:
        proc = run_main(self.tmp, *self.check_args())
        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = json.loads(proc.stdout)
        self.assertTrue(report["ok"])
        self.assertIn("effective config:", proc.stderr, "SV-C16 startup log")
        self.assertIn("turn end: stop=end_turn", proc.stderr)
        self.assertNotIn(SECRET, proc.stderr + proc.stdout)
        self.assertEqual(report["agentInfo"]["name"], "scripted-agent")
        self.assertEqual(report["authMethods"], ["openai"])
        self.assertEqual(report["modes"], {"current": "default", "available": ["default", "plan"]})
        self.assertEqual((report["stopReason"], report["text"]), ("end_turn", "OK"))
        self.assertEqual(report["usage"], {"inputTokens": 1})
        self.assertTrue((self.tmp / "home/.local/state/agentic-ui-server/chats").is_dir(), "writes stay under HOME")
        self.assertTrue((self.tmp / "home/.cache/agentic-ui-server").is_dir())

    def test_check_agent_failure_exit_code(self) -> None:
        self.script.write_text(json.dumps({"methods": {"session/new": {"exit": 5, "stderr": "no auth"}}}))
        proc = run_main(self.tmp, *self.check_args())
        self.assertEqual(proc.returncode, 1)
        report = json.loads(proc.stdout)
        self.assertEqual((report["ok"], report["error"], report["exitCode"]), (False, "start:exited", 5))
        self.assertIn("no auth", report["stderrTail"])

    def test_config_error_exit_code_2(self) -> None:
        proc = run_main(self.tmp, "--check-agent", "--set", "agent.nope=1")
        self.assertEqual(proc.returncode, 2)
        self.assertIn("agent.nope: unknown setting", proc.stderr)

    def test_no_mode_serves_http_until_sigterm(self) -> None:
        """[P6-http, SV-C12] no mode flag = serve: listens on server.host/port under the base path, answers
        /health, and SIGTERM stops it cleanly (exit 0, agents closed)."""
        env = {**base_environ(self.tmp), "PYTHONPATH": str(SRC_DIR)}
        argv = [sys.executable, "-m", "agentic_ui_server", "--port", "0", "--agent-bin", sys.executable]
        argv += ["--set", "server.base_path=/agent-api"]
        server = ServerProcess(self, argv, env, self.tmp)
        self.assertRegex(server.url, r"^http://127\.0\.0\.1:\d+/agent-api$")
        status, body, _ = call(server.url, "/health")
        self.assertEqual((status, body["status"]), (200, "ok"))
        code, rest = server.stop()
        self.assertEqual(code, 0, rest)
        self.assertIn("HTTP GET /agent-api/health → 200 ok", rest)
        self.assertIn("server stopped", rest)

    def test_env_config_source(self) -> None:
        proc = run_main(self.tmp, "--check-agent", env_extra={"AGENTIC_UI_PORT": "nope"})
        self.assertEqual(proc.returncode, 2)
        self.assertIn("server.port", proc.stderr)


if __name__ == "__main__":
    unittest.main()
