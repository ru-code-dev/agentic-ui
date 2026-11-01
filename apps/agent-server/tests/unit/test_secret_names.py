"""A2-M4 (SV-C16): secrets are registered when the settings load and secret env names are matched exactly."""

import io
import unittest
import unittest.mock
from contextlib import redirect_stderr

from agentic_ui_server import log
from agentic_ui_server.__main__ import main
from agentic_ui_server.config import describe, load_settings

SECRET_NAMES = ("AGENTIC_UI_LLM_KEY", "HF_TOKEN", "CLIENT_SECRET", "PGPASSWORD", "DB_PASSWD", "KEY", "api_key")
PLAIN_NAMES = ("XAUTHORITY", "SSH_AUTH_SOCK", "PATH", "QWEN_HOME", "KEYBOARD", "MONKEY", "TOKENIZERS_PARALLELISM")


class SecretNamesTest(unittest.TestCase):
    def test_exact_secret_name_patterns(self) -> None:
        """[SV-C16] *_KEY / *_TOKEN / *_SECRET / *PASSWORD* names are secret; XAUTHORITY, SSH_AUTH_SOCK and
        other names that merely contain AUTH/KEY/TOKEN are not (before: a substring match masked their paths)."""
        for name in SECRET_NAMES:
            self.assertTrue(log.is_secret_name(name), name)
        for name in PLAIN_NAMES:
            self.assertFalse(log.is_secret_name(name), name)

    def test_secrets_are_registered_when_the_settings_load(self) -> None:
        """[SV-C16] load_settings alone (no agent spawned) makes the server env's key, a key in agent.env, a key
        flag in agent.extra_args and a configured agent.env_names.secrets name redacted; XAUTHORITY and
        SSH_AUTH_SOCK paths stay readable."""
        env = {
            "HOME": "/home/t",
            "AGENTIC_UI_LLM_KEY": "sk-load-time-env-0001",
            "FORK_LICENSE": "fork-licence-load-time-0002",
            "XAUTHORITY": "/home/t/.Xauthority-load-time",
            "SSH_AUTH_SOCK": "/tmp/ssh-load-time/agent.42",
        }
        sets = {
            "agent.env": "VENDOR_TOKEN=vendor-token-load-time-0003",
            "agent.extra_args": "--api-key argv-key-load-time-0004",
            "agent.env_names.secrets": "FORK_LICENSE",
        }
        argv = [a for k, v in sets.items() for a in ("--set", f"{k}={v}")]
        text = " ".join([*env.values(), "vendor-token-load-time-0003", "argv-key-load-time-0004"])
        self.assertIn("fork-licence-load-time-0002", log.redact(text), "not registered before the load")
        settings = load_settings(argv, env)
        shown = log.redact(text)
        for secret in ("sk-load-time", "fork-licence-load-time", "vendor-token-load-time", "argv-key-load-time"):
            self.assertNotIn(secret, shown)
        self.assertIn("/home/t/.Xauthority-load-time", shown)
        self.assertIn("/tmp/ssh-load-time/agent.42", shown)
        self.assertEqual(describe(settings)["agent"]["env"], {"VENDOR_TOKEN": "***"})

    def test_print_config_masks_a_configured_name(self) -> None:
        """[SV-C16] --print-config masks agent.env values of configured secret names, keeps other values."""
        argv = ["--print-config", "--set", "agent.env=MY_LICENCE=print-config-licence-0005,OTHER=visible-value"]
        argv += ["--set", "agent.env_names.secrets=MY_LICENCE"]
        out = io.StringIO()
        with redirect_stderr(io.StringIO()), unittest.mock.patch("sys.stdout", out):
            self.assertEqual(main(argv), 0)
        self.assertNotIn("print-config-licence-0005", out.getvalue())
        self.assertIn('"MY_LICENCE": "***"', out.getvalue())
        self.assertIn("visible-value", out.getvalue())


if __name__ == "__main__":
    unittest.main()
