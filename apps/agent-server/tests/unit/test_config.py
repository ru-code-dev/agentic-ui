"""config.py: defaults, precedence (defaults < TOML < env < argv), coercion, errors naming the key."""

import json
import os
import unittest
from pathlib import Path

from agentic_ui_server.agent.spawn import command_prefix
from agentic_ui_server.config import ConfigError, describe, load_settings
from agentic_ui_server.http.api import agent_found

from ..support.tiers import temp_dir

ENV = {"HOME": "/home/tester", "PATH": "/usr/bin"}


class ConfigTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = temp_dir(self)

    def toml(self, text: str) -> str:
        path = self.tmp / "config.toml"
        path.write_text(text, encoding="utf-8")
        return str(path)

    def test_defaults(self) -> None:
        s = load_settings([], ENV)
        self.assertEqual((s.server.host, s.server.port, s.server.base_path), ("127.0.0.1", 8787, "/api"))
        self.assertEqual(s.agent.bin, "qwen")
        self.assertEqual(s.agent.acp_flag, "--acp")
        self.assertEqual(s.agent.base_args[:3], ("--core-tools", "none", "--exclude-tools"))
        self.assertIn("ask_user_question", s.agent.base_args[3].split(","))
        self.assertEqual(s.agent.mode, "", "no mode by default: the production custom Qwen has no yolo")
        self.assertEqual(
            (s.agent.auth_method, s.agent.model, s.agent.model_apply),
            ("", "", "session"),
            "SV-C15: no provider/model defaults",
        )
        self.assertEqual(s.agent.extra_args, ())
        self.assertEqual(s.agent.env_names.home, ("QWEN_HOME",))
        self.assertEqual(dict(s.agent.env), {"QWEN_SANDBOX": "false", "QWEN_CODE_SUPPRESS_YOLO_WARNING": "1"})
        self.assertEqual(s.agent.work_root, "/home/tester/.local/state/agentic-ui-server/chats")
        self.assertEqual(s.agent.cache_dir, "/home/tester/.cache/agentic-ui-server")
        self.assertEqual((s.timeouts.start_s, s.timeouts.turn_s, s.timeouts.cancel_grace_s), (60.0, 180.0, 1.5))
        self.assertEqual((s.limits.max_live_agents, s.limits.max_line_bytes), (4, 16 * 1024 * 1024))
        self.assertEqual(s.repair.max_attempts, 3)

    def test_no_text_mode_setting(self) -> None:
        """[SV-C4] DOC-26: agent.text_mode is gone (nothing read it; MCP mode was rejected, DEC-051): setting it is an
        unknown setting, not a silently accepted "mcp"."""
        with self.assertRaisesRegex(ConfigError, "agent.text_mode: unknown setting"):
            load_settings(["--set", "agent.text_mode=mcp"], {"HOME": "/h"})
        self.assertFalse(hasattr(load_settings([], {"HOME": "/h"}).agent, "text_mode"))

    def test_xdg_dirs(self) -> None:
        s = load_settings([], {**ENV, "XDG_STATE_HOME": "/x/state", "XDG_CACHE_HOME": "/x/cache"})
        self.assertEqual(s.agent.work_root, "/x/state/agentic-ui-server/chats")
        self.assertEqual(s.agent.cache_dir, "/x/cache/agentic-ui-server")

    def test_toml_overrides(self) -> None:
        path = self.toml(
            '[server]\nport = 9000\n[agent]\nbin = "~/cli.js"\nextra_args = ["--model", "model-a"]\n'
            'env = { A = "1", B = true }\n[agent.env_names]\nhome = ["QWEN_HOME", "CUSTOM_HOME"]\n'
            "[timeouts]\nturn_s = 5\n"
        )
        s = load_settings(["--config", path], ENV)
        self.assertEqual(s.server.port, 9000)
        self.assertEqual(s.agent.bin, "/home/tester/cli.js")
        self.assertEqual(s.agent.extra_args, ("--model", "model-a"))
        self.assertEqual(dict(s.agent.env), {"A": "1", "B": "true"})
        self.assertEqual(s.agent.env_names.home, ("QWEN_HOME", "CUSTOM_HOME"))
        self.assertEqual(s.timeouts.turn_s, 5.0)

    def test_config_path_from_env(self) -> None:
        path = self.toml("[server]\nport = 9001\n")
        self.assertEqual(load_settings([], {**ENV, "AGENTIC_UI_CONFIG": path}).server.port, 9001)

    def test_env_beats_toml_and_argv_beats_env(self) -> None:
        path = self.toml('[server]\nport = 9000\nhost = "0.0.0.0"\n')
        env = {**ENV, "AGENTIC_UI_PORT": "9100", "AGENTIC_UI_HOST": "10.0.0.1"}
        s = load_settings(["--config", path], env)
        self.assertEqual((s.server.port, s.server.host), (9100, "10.0.0.1"))
        s = load_settings(["--config", path, "--port", "9200", "--set", "server.host=1.2.3.4"], env)
        self.assertEqual((s.server.port, s.server.host), (9200, "1.2.3.4"))

    def test_coercion(self) -> None:
        env = {
            **ENV,
            "AGENTIC_UI_AGENT_INHERIT_ENV": "no",
            "AGENTIC_UI_AGENT_TLS_INSECURE": "ON",
            "AGENTIC_UI_CANCEL_GRACE_S": "0.25",
            "AGENTIC_UI_CORS_ORIGINS": "https://a, https://b ,",
            "AGENTIC_UI_AGENT_ENV": "K=V, X=y=z",
            "AGENTIC_UI_MAX_LIVE_AGENTS": "2",
        }
        s = load_settings([], env)
        self.assertFalse(s.agent.inherit_env)
        self.assertTrue(s.agent.tls_insecure)
        self.assertEqual(s.timeouts.cancel_grace_s, 0.25)
        self.assertEqual(s.server.cors_origins, ("https://a", "https://b"))
        self.assertEqual(dict(s.agent.env), {"K": "V", "X": "y=z"})
        self.assertEqual(s.limits.max_live_agents, 2)

    def test_args_use_shlex(self) -> None:
        env = {
            **ENV,
            "AGENTIC_UI_AGENT_EXTRA_ARGS": "--auth-type openai --model model-a --label 'two words'",
            "AGENTIC_UI_AGENT_BASE_ARGS": "--core-tools none --exclude-tools a,b",
        }
        s = load_settings([], env)
        self.assertEqual(s.agent.extra_args, ("--auth-type", "openai", "--model", "model-a", "--label", "two words"))
        self.assertEqual(s.agent.base_args, ("--core-tools", "none", "--exclude-tools", "a,b"))

    def test_system_settings_json(self) -> None:
        self.assertEqual(
            json.loads(load_settings([], ENV).agent.system_settings),
            {"tools": {"computerUse": {"enabled": False}}, "ui": {"enableFollowupSuggestions": False}},
        )
        path = self.toml("[agent.system_settings]\nui = { enableFollowupSuggestions = false }\n")
        self.assertEqual(
            load_settings(["--config", path], ENV).agent.system_settings, '{"ui":{"enableFollowupSuggestions":false}}'
        )
        self.assertEqual(load_settings([], {**ENV, "AGENTIC_UI_AGENT_SYSTEM_SETTINGS": ""}).agent.system_settings, "")
        with self.assertRaisesRegex(ConfigError, r"agent\.system_settings"):
            load_settings([], {**ENV, "AGENTIC_UI_AGENT_SYSTEM_SETTINGS": "[1]"})

    def test_unknown_toml_key_names_the_key(self) -> None:
        with self.assertRaisesRegex(ConfigError, r"agent\.binn: unknown setting"):
            load_settings(["--config", self.toml("[agent]\nbinn = 'x'\n")], ENV)
        with self.assertRaisesRegex(ConfigError, r"nope: unknown setting"):
            load_settings(["--config", self.toml("[nope]\na = 1\n")], ENV)

    def test_unknown_set_key_names_the_key(self) -> None:
        with self.assertRaisesRegex(ConfigError, r"agent\.foo: unknown setting"):
            load_settings(["--set", "agent.foo=1"], ENV)

    def test_bad_values_name_the_key(self) -> None:
        cases = [
            ({"AGENTIC_UI_PORT": "abc"}, r"server\.port"),
            ({"AGENTIC_UI_PORT": "70000"}, r"server\.port"),
            ({"AGENTIC_UI_AGENT_INHERIT_ENV": "maybe"}, r"agent\.inherit_env"),
            ({"AGENTIC_UI_TURN_TIMEOUT_S": "0"}, r"timeouts\.turn_s"),
            ({"AGENTIC_UI_LOG_LEVEL": "LOUD"}, r"log\.level"),
            ({"AGENTIC_UI_AGENT_ENV": "novalue"}, r"agent\.env"),
        ]
        for env, pattern in cases:
            with self.subTest(env=env), self.assertRaisesRegex(ConfigError, pattern):
                load_settings([], {**ENV, **env})
        with self.assertRaisesRegex(ConfigError, r"server\.port: expected int"):
            load_settings(["--config", self.toml("[server]\nport = '80'\n")], ENV)

    def test_config_errors_never_quote_the_value(self) -> None:
        """[SV-C16] a mistyped value (a key where a list or number belongs) is reported by key and type only: the
        message is printed to stderr at startup (before, it held the value's repr)."""
        cases = [
            (["--config", self.toml("[agent]\nextra_args = 'sk-cfg-secret-1'\n")], {}),
            (["--config", self.toml("[agent]\nenv = { OPENAI_API_KEY = ['sk-cfg-secret-2'] }\n")], {}),
            ([], {"AGENTIC_UI_PORT": "sk-cfg-secret-3"}),
            ([], {"AGENTIC_UI_AGENT_INHERIT_ENV": "sk-cfg-secret-4"}),
        ]
        for argv, env in cases:
            with self.subTest(argv=argv, env=env), self.assertRaises(ConfigError) as ctx:
                load_settings(argv, {**ENV, **env})
            self.assertNotIn("sk-cfg-secret", str(ctx.exception))
            self.assertRegex(str(ctx.exception), r"^(agent\.(extra_args|env|inherit_env)|server\.port): ")

    def test_model_apply_validated(self) -> None:
        with self.assertRaisesRegex(ConfigError, r"agent\.model_apply"):
            load_settings([], {**ENV, "AGENTIC_UI_AGENT_MODEL_APPLY": "sometimes"})
        s = load_settings(
            [], {**ENV, "AGENTIC_UI_AGENT_MODEL": "model-a", "AGENTIC_UI_AGENT_MODEL_APPLY": "every_turn"}
        )
        self.assertEqual((s.agent.model, s.agent.model_apply), ("model-a", "every_turn"))

    def test_describe_masks_secrets_and_omits_environ(self) -> None:
        s = load_settings(
            ["--set", "agent.env=OPENAI_API_KEY=sk-in-agent-env,PLAIN=1"], {**ENV, "OTHER_TOKEN": "sk-environ"}
        )
        text = json.dumps(describe(s))
        self.assertNotIn("sk-in-agent-env", text)
        self.assertNotIn("sk-environ", text)
        self.assertIn('"PLAIN": "1"', text)
        self.assertEqual(describe(s)["log"]["level"], "INFO")

    def test_settings_are_frozen_and_repr_hides_environ(self) -> None:
        s = load_settings([], {**ENV, "OPENAI_API_KEY": "sk-secret-value"})
        with self.assertRaises(AttributeError):
            s.server.port = 1  # type: ignore[misc]
        with self.assertRaises(TypeError):
            s.agent.env["X"] = "1"  # type: ignore[index]
        self.assertNotIn("sk-secret-value", repr(s))
        self.assertEqual(s.environ["OPENAI_API_KEY"], "sk-secret-value")

    def test_relative_bin_from_toml_is_relative_to_the_file(self) -> None:
        """[A6-03] a relative TOML agent.bin (the reviewer's ``bin = "../qwen-code/dist/cli.js"``) becomes absolute
        against the config file's folder once at load: /health, --check-agent and the spawn (cwd = the chat dir)
        use the same existing file."""
        cli = self.tmp / "qwen-code" / "dist" / "cli.js"
        cli.parent.mkdir(parents=True)
        cli.write_text("", encoding="utf-8")
        (self.tmp / "conf").mkdir()
        path = self.tmp / "conf" / "config.toml"
        path.write_text('[agent]\nbin = "../qwen-code/dist/cli.js"\n', encoding="utf-8")
        s = load_settings(["--config", str(path)], ENV)
        self.assertEqual(s.agent.bin, os.path.abspath(cli))
        self.assertTrue(agent_found(s.agent))
        self.assertEqual(command_prefix(s.agent.bin, "node"), ["node", os.path.realpath(cli)])

    def test_relative_bin_from_flag_env_or_set_is_relative_to_the_cwd(self) -> None:
        """[A6-03] a relative agent.bin from --agent-bin, AGENTIC_UI_AGENT_BIN or --set (beating a TOML value) is made
        absolute against the server's cwd; a command on PATH (no path separator) stays a command."""
        path = self.toml('[agent]\nbin = "toml/cli.js"\n')
        expected = str(Path.cwd() / "some" / "dir" / "cli.js")
        self.assertEqual(load_settings(["--config", path, "--agent-bin", "some/dir/cli.js"], ENV).agent.bin, expected)
        env = {**ENV, "AGENTIC_UI_AGENT_BIN": "./some/dir/cli.js"}
        self.assertEqual(load_settings(["--config", path], env).agent.bin, expected)
        self.assertEqual(load_settings(["--set", "agent.bin=some/dir/cli.js"], ENV).agent.bin, expected)
        self.assertEqual(load_settings(["--config", path], ENV).agent.bin, str(self.tmp / "toml" / "cli.js"))
        self.assertEqual(load_settings(["--agent-bin", "qwen"], ENV).agent.bin, "qwen")
        self.assertEqual(load_settings(["--agent-bin", "~/cli.js"], ENV).agent.bin, "/home/tester/cli.js")


if __name__ == "__main__":
    unittest.main()
