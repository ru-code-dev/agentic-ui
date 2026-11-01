"""SV-C16: live agent stderr, lifecycle events, env keys only, and no secret value in any log."""

import asyncio
import io
import logging
import unittest

from agentic_ui_server.agent.session import AgentCrashed, AgentSession
from agentic_ui_server.log import LOGGER_NAME
from agentic_ui_server.resources import AgentFiles

from ..support.tiers import scripted_settings, temp_dir

SECRET = "sk-test-secret-value-1234567890"
ARG_SECRET = "sk-arg-secret-value-0987654321"


class LoggingTest(unittest.IsolatedAsyncioTestCase):
    def capture(self) -> io.StringIO:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
        logger = logging.getLogger(LOGGER_NAME)
        previous = logger.level
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        self.addCleanup(logger.removeHandler, handler)
        self.addCleanup(logger.setLevel, previous)
        return stream

    def make(self, script: dict, sets: dict[str, str] | None = None) -> AgentSession:
        values = {
            "agent.env": f"SCRIPTED_AGENT_SCRIPT={{script}},OPENAI_API_KEY={SECRET}",
            "log.acp_wire": "true",
            **(sets or {}),
        }
        tmp = temp_dir(self)
        values["agent.env"] = values["agent.env"].replace("{script}", str(tmp / "script.json"))
        settings, _ = scripted_settings(tmp, script, values)
        session = AgentSession(settings, "chat-log", files=AgentFiles())
        self.addAsyncCleanup(session.close)
        return session

    async def test_stderr_streamed_live_and_lifecycle_logged_without_secrets(self) -> None:
        logs = self.capture()
        session = self.make(
            {
                "boot_stderr": "booting agent",
                "prompts": [
                    [
                        {"stderr": f"debug: using key {SECRET}"},
                        {"chunk": f"echo {SECRET}"},
                        {
                            "permission": {
                                "toolCall": {"toolCallId": "t", "title": "Write", "_meta": {"toolName": "write_file"}}
                            }
                        },
                        {"client_request": "brand/newMethod"},
                    ]
                ],
            }
        )
        await session.run_turn("hello")
        await session.close()
        out = logs.getvalue()
        pid_tag = "[chat-log pid="
        self.assertIn(pid_tag, out)
        self.assertIn("agentic_ui_server.agent.stderr: [chat-log pid=", out)
        self.assertIn("booting agent", out)
        self.assertIn("debug: using key ***", out)
        self.assertIn("env_keys=", out)
        self.assertIn("OPENAI_API_KEY", out, "env KEYS are logged")
        for event in (
            "turn start",
            "turn end: stop=end_turn",
            "tool allowed → proceed_always_project",
            "agent request brand/newMethod not supported → -32601",
            "exited with code",
            "SIGTERM",
        ):
            self.assertIn(event, out)
        self.assertIn("WARNING agentic_ui_server.acp.client: agent request brand/newMethod", out)
        self.assertNotIn(SECRET, out, "no secret value in any log line (wire log on)")

    async def test_stderr_is_logged_while_the_turn_runs(self) -> None:
        """[SV-C16] an agent stderr line is in the log while its turn is still running (streamed live, not
        collected at the end): seen before the turn ends, logged before "turn end"."""
        logs, seen, loop = self.capture(), asyncio.Event(), asyncio.get_running_loop()
        watch = logging.Handler()
        watch.emit = lambda record: "live: step 1" in record.getMessage() and loop.call_soon_threadsafe(seen.set)
        logging.getLogger(LOGGER_NAME).addHandler(watch)
        self.addCleanup(logging.getLogger(LOGGER_NAME).removeHandler, watch)
        session = self.make({"prompts": [[{"stderr": "live: step 1 of 3"}, {"hang": True}]]})
        turn = asyncio.create_task(session.run_turn("go"))
        await asyncio.wait_for(seen.wait(), 5)
        self.assertIn("agentic_ui_server.agent.stderr: [chat-log pid=", logs.getvalue())
        self.assertIn("live: step 1 of 3", logs.getvalue())
        self.assertFalse(turn.done(), "the line arrived while the turn was running")
        await session.cancel()
        self.assertEqual((await asyncio.wait_for(turn, 5)).stop_reason, "cancelled")
        out = logs.getvalue()
        self.assertLess(out.index("live: step 1 of 3"), out.index("turn end"))

    async def test_secret_cli_args_masked_in_the_spawn_log(self) -> None:
        """[SV-C16] a key passed as an agent argument (agent.extra_args) never reaches the log: the spawn line
        masks it like the startup config does (before, the argv was logged verbatim)."""
        logs = self.capture()
        args = f"--openai-api-key {ARG_SECRET} --token={ARG_SECRET}2 --auth-type openai"
        session = self.make({}, {"agent.extra_args": args})
        await session.start()
        await session.close()
        out = logs.getvalue()
        self.assertIn("'--openai-api-key', '***'", out)
        self.assertIn("'--auth-type', 'openai'", out, "a non-secret flag value stays readable")
        self.assertNotIn(ARG_SECRET, out)

    async def test_crash_logged_with_exit_code_and_stderr(self) -> None:
        logs = self.capture()
        session = self.make({"prompts": [[{"stderr": "fatal: disk on fire"}, {"exit": 7}]]})
        with self.assertRaises(AgentCrashed):
            await session.run_turn("go")
        out = logs.getvalue()
        self.assertIn("ERROR agentic_ui_server.agent.session: [chat-log] agent crashed mid-turn (exit code 7)", out)
        self.assertIn("exited with code 7", out)
        self.assertIn("fatal: disk on fire", out)


if __name__ == "__main__":
    unittest.main()
