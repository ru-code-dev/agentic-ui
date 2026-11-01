"""SV-C15: ``agent.model`` selection rules (start, unchanged, respawn+load, change, every_turn, missing method)."""

import unittest

from agentic_ui_server.agent.session import AgentCrashed, AgentSession
from agentic_ui_server.resources import AgentFiles

from ..support.tiers import read_record, scripted_settings, temp_dir


class ModelTest(unittest.IsolatedAsyncioTestCase):
    def make(self, script: dict, sets: dict[str, str] | None = None) -> AgentSession:
        settings, self.record = scripted_settings(temp_dir(self), script, sets)
        session = AgentSession(settings, "chat-model", files=AgentFiles())
        self.addAsyncCleanup(session.close)
        return session

    def model_calls(self) -> list[tuple[str, str]]:
        calls = []
        for entry in read_record(self.record):
            params = entry.get("params") or {}
            if entry.get("method") == "session/set_config_option" and params.get("configId") == "model":
                calls.append(("set_config_option", params["value"]))
            elif entry.get("method") == "session/set_model":
                calls.append(("set_model", params["modelId"]))
        return calls

    async def test_no_model_configured_never_touches_the_model(self) -> None:
        session = self.make({})
        await session.run_turn("hi")
        self.assertEqual(self.model_calls(), [])

    async def test_applied_on_start_and_not_resent_when_unchanged(self) -> None:
        session = self.make({}, {"agent.model": "model-a"})
        with self.assertLogs("agentic_ui_server.agent.handshake", "INFO") as logs:
            await session.start()
        self.assertIn("model 'model-a' applied via session/set_config_option", "\n".join(logs.output))
        await session.run_turn("1")
        await session.run_turn("2")
        self.assertEqual(self.model_calls(), [("set_config_option", "model-a")])
        self.assertEqual(session.applied_model, "model-a")

    async def test_resent_after_respawn_and_load(self) -> None:
        session = self.make(
            {"runs": [{"prompts": [[{"exit": 3}]]}, {"prompts": [[{"chunk": "back"}]]}]}, {"agent.model": "model-a"}
        )
        with self.assertRaises(AgentCrashed):
            await session.run_turn("first")
        self.assertEqual((await session.run_turn("second")).text, "back")
        self.assertTrue(session.resumed)
        methods = [e.get("method") for e in read_record(self.record) if e.get("method")]
        second_boot = methods[methods.index("session/load") :]
        self.assertIn("session/set_config_option", second_boot, "model re-applied after session/load")
        self.assertEqual(self.model_calls(), [("set_config_option", "model-a")] * 2)

    async def test_resent_when_the_wanted_model_changes(self) -> None:
        session = self.make({}, {"agent.model": "model-a"})
        await session.run_turn("1")
        await session.run_turn("2", model="model-b")
        await session.run_turn("3", model="model-b")
        self.assertEqual(self.model_calls(), [("set_config_option", "model-a"), ("set_config_option", "model-b")])

    async def test_back_to_the_cli_default_after_a_chosen_model(self) -> None:
        """[SV-C25] a chat that chose a model and then chose "" (CLI default) gets the default re-applied on its live
        process (it kept running the chosen model until a restart)."""
        models = {
            "currentModelId": "model-a",
            "availableModels": [{"modelId": "model-a"}, {"modelId": "model-b"}],
        }
        session = self.make({"methods": {"session/new": {"result": {"sessionId": "s-1", "models": models}}}})
        await session.run_turn("1", model="model-b")
        await session.run_turn("2")
        await session.run_turn("3")
        self.assertEqual(self.model_calls(), [("set_config_option", "model-b"), ("set_config_option", "model-a")])

    async def test_every_turn_mode(self) -> None:
        session = self.make({}, {"agent.model": "model-a", "agent.model_apply": "every_turn"})
        await session.run_turn("1")
        await session.run_turn("2")
        self.assertEqual(self.model_calls(), [("set_config_option", "model-a")] * 3, "on start + before each prompt")
        prompts = [i for i, e in enumerate(read_record(self.record)) if e.get("method") == "session/prompt"]
        models = [i for i, e in enumerate(read_record(self.record)) if e.get("method") == "session/set_config_option"]
        self.assertLess(models[-1], prompts[-1])

    async def test_falls_back_to_session_set_model(self) -> None:
        session = self.make(
            {"methods": {"session/set_config_option": {"error": [-32602, "Unsupported configId: model"]}}},
            {"agent.model": "model-a"},
        )
        await session.run_turn("1")
        self.assertEqual(self.model_calls(), [("set_config_option", "model-a"), ("set_model", "model-a")])

    async def test_missing_method_is_a_warning_and_the_turn_works(self) -> None:
        session = self.make(
            {
                "methods": {
                    "session/set_config_option": {"error": [-32601, "Method not found"]},
                    "session/set_model": {"error": [-32601, "Method not found"]},
                },
                "prompts": [[{"chunk": "fine"}]],
            },
            {"agent.model": "model-a"},
        )
        with self.assertLogs("agentic_ui_server.agent.handshake", "WARNING") as logs:
            result = await session.run_turn("1")
        self.assertEqual((result.text, result.stop_reason), ("fine", "end_turn"))
        self.assertIn("cannot select model 'model-a'", logs.output[0])


if __name__ == "__main__":
    unittest.main()
