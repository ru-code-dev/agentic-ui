"""P7 zipapp: build from the current tree, then run the single file from an empty dir (scripted ACP agent)."""

import hashlib
import json
import sys
import unittest
import zipfile

from agentic_ui_server.resources import contract_version, read_data_text

from ..support.http_client import call
from ..support.pyz import ServerProcess, build_into, build_script, run_pyz
from ..support.stub_session import example, reply
from ..support.tiers import SCRIPTED_AGENT, base_environ, temp_dir

SECRET = "sk-pyz-secret-0987654321"
DATA = {f"agentic_ui_server/data/{n}" for n in ("catalog.json", "system-prompt.md", "common_types.json")}


class BuildPyzTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = temp_dir(self)
        self.pyz = build_into(self.tmp)
        self.env = base_environ(self.tmp)

    def agent_args(self, chunk: str) -> list[str]:
        script = self.tmp / "script.json"
        script.write_text(json.dumps({"prompts": [[{"chunk": chunk}]]}), encoding="utf-8")
        sets = {
            "agent.base_args": f"-I {SCRIPTED_AGENT}",
            "agent.acp_flag": "",
            "agent.auth_method": "",
            "agent.env": f"SCRIPTED_AGENT_SCRIPT={script},OPENAI_API_KEY={SECRET}",
            "agent.inherit_env": "false",
        }
        return ["--agent-bin", sys.executable, *[a for k, v in sets.items() for a in ("--set", f"{k}={v}")]]

    def test_one_file_with_code_and_generated_data(self) -> None:
        """[SV-C2, P7-cli] the pyz = shebang + package code + data/ (catalog, prompt, schemas), no caches, no tests;
        the --check verdict flags a stale entry."""
        self.assertEqual(self.pyz.read_bytes().split(b"\n", 1)[0], b"#!/usr/bin/env python3")
        with zipfile.ZipFile(self.pyz) as archive:
            names = set(archive.namelist())
            self.assertIn("agentic_ui_server.__main__", archive.read("__main__.py").decode())
            entries = {n: archive.read(n) for n in names if not n.endswith("/")}
        self.assertLessEqual(DATA, names)
        self.assertIn("agentic_ui_server/http/server.py", names)
        self.assertFalse([n for n in names if "__pycache__" in n or n.endswith(".pyc") or n.startswith("tests")])
        build = build_script()
        self.assertEqual(build.check(self.pyz), [])
        stale = self.tmp / "stale.pyz"
        with zipfile.ZipFile(stale, "w") as archive:
            for name, data in entries.items():
                archive.writestr(name, b"{}" if name.endswith("data/catalog.json") else data)
        self.assertEqual(build.check(stale), ["agentic_ui_server/data/catalog.json: stale"])
        self.assertEqual(build.check(self.tmp / "none.pyz")[0].split(": ")[1], "missing (run pnpm run server:build)")

    def test_version_and_print_config_from_an_empty_dir(self) -> None:
        """[P7-cli] --version shows the bundled contract: the catalogId and the sha256 of the catalog.json inside the
        zip, computed here from the zip (P7-D3); --print-config prints the effective settings as JSON with secrets
        masked and a non-secret flag such as --auth-type readable (P7-D4)."""
        with zipfile.ZipFile(self.pyz) as archive:
            catalog = archive.read("agentic_ui_server/data/catalog.json")
        expected = f"{json.loads(catalog)['catalogId']} sha256:{hashlib.sha256(catalog).hexdigest()[:12]}"
        proc = run_pyz(self.pyz, "--version", env=self.env)
        self.assertEqual(proc.stdout.strip(), f"agentic-ui-server 0.1.0 ({expected})")
        self.assertEqual(expected, contract_version(), "the pyz bundles the catalog of the source tree")
        flags = f"agent.extra_args=--auth-type openai --openai-api-key {SECRET}"
        proc = run_pyz(self.pyz, "--print-config", *self.agent_args("x"), "--set", flags, env=self.env)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        config = json.loads(proc.stdout)
        self.assertEqual(config["agent"]["extra_args"], ["--auth-type", "openai", "--openai-api-key", "***"])
        self.assertEqual(config["agent"]["env"]["OPENAI_API_KEY"], "***")
        self.assertEqual(config["server"]["base_path"], "/api")
        self.assertNotIn(SECRET, proc.stdout + proc.stderr)

    def test_check_agent_from_the_pyz(self) -> None:
        """[SV-C2, P7-cli] --check-agent from the single file; the agent gets the bundled system prompt."""
        proc = run_pyz(self.pyz, "--check-agent", *self.agent_args("OK"), env=self.env)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual((json.loads(proc.stdout)["ok"], json.loads(proc.stdout)["text"]), (True, "OK"))
        prompts = list((self.tmp / "home/.cache/agentic-ui-server").glob("*/system.md"))
        self.assertEqual([p.read_text(encoding="utf-8") for p in prompts], [read_data_text("system-prompt.md")])
        self.assertEqual([p.name for p in self.pyz.parent.iterdir()], [self.pyz.name], "nothing written beside it")

    def test_serves_one_http_turn_from_the_pyz(self) -> None:
        """[SV-C2, P7-cli] python3 agentic-ui-server.pyz serves: one /prompt → valid UI validated by the bundled
        catalog inside the zip; SIGTERM → exit 0."""
        argv = [sys.executable, "-I", str(self.pyz), "--port", "0", *self.agent_args(reply(example()))]
        server = ServerProcess(self, argv, self.env, self.pyz.parent)
        status, body, _ = call(server.url, "/prompt", {"chatId": "pyz", "text": "форма входа"})
        self.assertEqual((status, body["status"], body["messages"]), (200, "ok", example()))
        code, log = server.stop()
        self.assertEqual(code, 0, log)
        self.assertNotIn(SECRET, log)


if __name__ == "__main__":
    unittest.main()
