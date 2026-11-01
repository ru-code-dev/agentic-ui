"""``agentic-ui-server.example.toml`` lists every setting with its code default; ``config.dev.toml`` adds only
provider-neutral flags (SV-C15: no model or endpoint in a committed file; the base URL and model come from
``WORKFLOW/llm.env`` via ``AGENTIC_UI_AGENT_EXTRA_ARGS``)."""

import tomllib
import unittest
from pathlib import Path

from agentic_ui_server.config import SCHEMA, describe, load_settings

APP = Path(__file__).resolve().parents[2]
EXAMPLE = APP / "agentic-ui-server.example.toml"
DEV = APP / "config.dev.toml"
ENV = {"HOME": "/home/tester", "PATH": "/usr/bin"}
LEAF_TABLES = {"agent.env", "agent.system_settings"}


def flat_keys(table: dict, prefix: str = "") -> set[str]:
    keys = set()
    for name, value in table.items():
        key = prefix + name
        keys |= flat_keys(value, key + ".") if isinstance(value, dict) and key not in LEAF_TABLES else {key}
    return keys


class ExampleConfigTest(unittest.TestCase):
    def test_example_lists_every_setting(self) -> None:
        keys = flat_keys(tomllib.loads(EXAMPLE.read_text(encoding="utf-8")))
        self.assertEqual(keys, set(SCHEMA))

    def test_example_values_equal_code_defaults(self) -> None:
        self.assertEqual(describe(load_settings(["--config", str(EXAMPLE)], ENV)), describe(load_settings([], ENV)))

    def test_dev_config_only_adds_neutral_provider_flags(self) -> None:
        self.assertEqual(flat_keys(tomllib.loads(DEV.read_text(encoding="utf-8"))), {"agent.extra_args"})
        args = load_settings(["--config", str(DEV)], ENV).agent.extra_args
        # Provider-neutral: just the auth type; no model id and no endpoint URL in the committed file (SV-C15).
        self.assertEqual(args, ("--auth-type", "openai"))


if __name__ == "__main__":
    unittest.main()
