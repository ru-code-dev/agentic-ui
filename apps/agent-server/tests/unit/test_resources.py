"""resources.py: the system prompt is materialized as a content-addressed file (QWEN_SYSTEM_MD needs a path)."""

import unittest
from pathlib import Path

from agentic_ui_server.resources import agent_files, read_data_json, read_data_text, system_prompt_path
from agentic_ui_server.settings import AgentSettings

from ..support.tiers import temp_dir


class ResourcesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = temp_dir(self)

    def test_bundled_prompt_extracted_once(self) -> None:
        agent = AgentSettings(cache_dir=str(self.tmp / "cache"))
        path = system_prompt_path(agent)
        self.assertEqual(path.read_text(encoding="utf-8"), read_data_text("system-prompt.md"))
        self.assertTrue(path.is_relative_to(self.tmp / "cache"))
        self.assertEqual(path.name, "system.md")
        mtime = path.stat().st_mtime_ns
        self.assertEqual(system_prompt_path(agent), path)
        self.assertEqual(path.stat().st_mtime_ns, mtime, "not rewritten")

    def test_bundled_data_is_the_generated_contract(self) -> None:
        """[P3-sync-data] data/ holds the generated catalog, its full prompt and the A2UI v0.9 envelope schemas."""
        catalog = read_data_json("catalog.json")
        self.assertEqual(catalog["catalogId"], "urn:agentic-ui:catalog:ui-kit-one:v1")
        self.assertGreaterEqual(len(catalog["components"]), 19)
        prompt = read_data_text("system-prompt.md")
        self.assertIn("<a2ui-json>", prompt)
        self.assertIn(catalog["catalogId"], prompt)
        self.assertEqual(
            read_data_json("common_types.json")["$id"], "https://a2ui.org/specification/v0_9/common_types.json"
        )
        self.assertIn("oneOf", read_data_json("server_to_client.json"))

    def test_bundled_prompt_orders_no_questions(self) -> None:
        """[SV-C14] the system prompt the server sends orders: never ask questions, assume, always produce the UI."""
        prompt = read_data_text("system-prompt.md")
        self.assertRegex(
            prompt, r"Never ask the user questions[^\n]*reasonable assumptions[^\n]*always reply with the complete UI"
        )

    def test_override_file(self) -> None:
        override = self.tmp / "custom.md"
        override.write_text("Custom prompt", encoding="utf-8")
        agent = AgentSettings(cache_dir=str(self.tmp / "cache"), system_prompt_file=str(override))
        path = system_prompt_path(agent)
        self.assertEqual(path.read_text(encoding="utf-8"), "Custom prompt")
        self.assertNotEqual(path, system_prompt_path(AgentSettings(cache_dir=str(self.tmp / "cache"))))

    def test_agent_files(self) -> None:
        files = agent_files(AgentSettings(cache_dir=str(self.tmp / "cache")))
        self.assertTrue(Path(files.system_prompt).is_file())
        self.assertIn("enableFollowupSuggestions", Path(files.system_settings).read_text(encoding="utf-8"))
        self.assertIsNone(
            agent_files(AgentSettings(cache_dir=str(self.tmp / "cache"), system_settings="")).system_settings
        )


if __name__ == "__main__":
    unittest.main()
