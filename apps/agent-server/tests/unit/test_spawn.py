"""agent/spawn.py: argv shape per entry type and env layering (registry rows written last)."""

import unittest

from agentic_ui_server.agent.spawn import build_spawn
from agentic_ui_server.config import load_settings
from agentic_ui_server.resources import AgentFiles
from agentic_ui_server.settings import EXCLUDED_TOOLS

from ..support.tiers import temp_dir

ENV = {"HOME": "/home/t", "PATH": "/usr/bin", "QWEN_HOME": "/inherited", "SECRET_TOKEN": "inherited-secret"}


FILES = AgentFiles(system_prompt="/p/system.md", system_settings="/p/system-settings.json")


def spawn(sets: dict[str, str] | None = None, environ: dict[str, str] | None = None, files: AgentFiles = FILES):
    argv = [arg for k, v in (sets or {}).items() for arg in ("--set", f"{k}={v}")]
    return build_spawn(load_settings(argv, environ or ENV), cwd="/w/chat", files=files)


class SpawnTest(unittest.TestCase):
    def test_js_entry_runs_with_node(self) -> None:
        spec = spawn(
            {"agent.bin": "/opt/q/cli.js", "agent.node": "/usr/bin/node", "agent.extra_args": "--model model-a"}
        )
        self.assertEqual(spec.argv[:2], ("/usr/bin/node", "/opt/q/cli.js"))
        self.assertEqual(spec.argv[2:6], ("--core-tools", "none", "--exclude-tools", EXCLUDED_TOOLS))
        self.assertEqual(spec.argv[6:], ("--model", "model-a", "--acp"))
        self.assertEqual(spec.cwd, "/w/chat")
        for suffix in (".mjs", ".cjs"):
            self.assertEqual(spawn({"agent.bin": f"/x/cli{suffix}"}).argv[0], "node")

    def test_default_argv_has_no_provider_or_model_flags(self) -> None:
        argv = spawn().argv
        for flag in ("--auth-type", "--model", "--openai-base-url", "--openai-api-key", "--approval-mode", "--yolo"):
            self.assertNotIn(flag, argv)
        self.assertFalse([arg for arg in argv if arg.startswith(("--model=", "--auth-type="))])

    def test_symlinked_js_entry_runs_from_its_real_path(self) -> None:
        """[SV-C4] a symlinked absolute CLI entry is spawned by its real path (qwen exits silently otherwise)."""
        tmp = temp_dir(self)
        (tmp / "release").mkdir()
        (tmp / "release" / "cli.js").write_text("", encoding="utf-8")
        (tmp / "current").symlink_to(tmp / "release")
        spec = spawn({"agent.bin": str(tmp / "current" / "cli.js")})
        self.assertEqual(spec.argv[1], str((tmp / "release" / "cli.js").resolve()))
        self.assertEqual(spawn({"agent.bin": "cli.js"}).argv[1], "cli.js", "a relative entry stays relative to the cwd")

    def test_ts_entry_uses_strip_types(self) -> None:
        spec = spawn({"agent.bin": "/f/fake-acp-server.ts", "agent.base_args": "", "agent.acp_flag": ""})
        self.assertEqual(spec.argv, ("node", "--experimental-strip-types", "/f/fake-acp-server.ts"))

    def test_bare_command_runs_directly(self) -> None:
        spec = spawn({"agent.acp_flag": "--experimental-acp", "agent.base_args": ""})
        self.assertEqual(spec.argv, ("qwen", "--experimental-acp"))

    def test_registry_rows_written_last(self) -> None:
        spec = spawn(
            {
                "agent.home": "/srv/qwen-home",
                "agent.env": "QWEN_HOME=/from-agent-env,QWEN_CODE_NO_RELAUNCH=false,QWEN_SYSTEM_MD=/x,EXTRA=1",
            }
        )
        self.assertEqual(spec.env["QWEN_HOME"], "/srv/qwen-home")
        self.assertEqual(spec.env["QWEN_CODE_NO_RELAUNCH"], "true")
        self.assertEqual(spec.env["QWEN_SYSTEM_MD"], "/p/system.md")
        self.assertEqual(spec.env["QWEN_CODE_SYSTEM_SETTINGS_PATH"], "/p/system-settings.json")
        self.assertEqual(spec.env["EXTRA"], "1")
        self.assertEqual(spec.env["SECRET_TOKEN"], "inherited-secret", "inherit_env=true keeps the server env")

    def test_agent_env_beats_inherited(self) -> None:
        spec = spawn({"agent.env": "PATH=/custom"})
        self.assertEqual(spec.env["PATH"], "/custom")
        self.assertNotIn("QWEN_SANDBOX", spec.env, "an agent.env override replaces the default table")

    def test_env_name_aliases(self) -> None:
        path = temp_dir(self) / "c.toml"
        path.write_text(
            '[agent]\nhome = "/h"\n[agent.env_names]\nhome = ["QWEN_HOME", "CUSTOM_HOME"]\n'
            'no_relaunch = ["QWEN_CODE_NO_RELAUNCH", "CUSTOM_NO_RELAUNCH"]\n',
            encoding="utf-8",
        )
        spec = build_spawn(load_settings(["--config", str(path)], ENV), cwd="/w", files=AgentFiles())
        self.assertEqual((spec.env["QWEN_HOME"], spec.env["CUSTOM_HOME"]), ("/h", "/h"))
        self.assertEqual(spec.env["CUSTOM_NO_RELAUNCH"], "true")
        self.assertNotIn("QWEN_SYSTEM_MD", spec.env)
        self.assertNotIn("QWEN_CODE_SYSTEM_SETTINGS_PATH", spec.env)

    def test_passthrough_only_when_not_inheriting(self) -> None:
        spec = spawn({"agent.inherit_env": "false"})
        self.assertEqual(spec.env["PATH"], "/usr/bin")
        self.assertEqual(spec.env["HOME"], "/home/t")
        self.assertNotIn("SECRET_TOKEN", spec.env)
        self.assertNotIn("QWEN_HOME", spec.env, "empty agent.home is omitted and the inherited one is dropped")

    def test_tls_insecure(self) -> None:
        self.assertNotIn("NODE_TLS_REJECT_UNAUTHORIZED", spawn().env)
        self.assertEqual(spawn({"agent.tls_insecure": "true"}).env["NODE_TLS_REJECT_UNAUTHORIZED"], "0")

    def test_empty_home_omitted(self) -> None:
        self.assertEqual(spawn().env["QWEN_HOME"], "/inherited", "inherited value untouched when agent.home is empty")

    def test_repr_hides_env_values(self) -> None:
        self.assertNotIn("inherited-secret", repr(spawn()))

    def test_repr_masks_secret_args(self) -> None:
        """[SV-C16] SpawnSpec's repr (secret-safe by contract) masks a key given as a CLI argument."""
        shown = repr(spawn({"agent.extra_args": "--api-key sk-argv-secret-1 --openai-api-key=sk-argv-secret-2"}))
        self.assertNotIn("sk-argv-secret", shown)
        self.assertIn("'--api-key', '***', '--openai-api-key=***'", shown)


if __name__ == "__main__":
    unittest.main()
