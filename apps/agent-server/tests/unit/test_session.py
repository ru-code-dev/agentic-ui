"""agent/session.py lifecycle against the scripted agent: start, timeouts, cancel, crash, restart + load."""

import asyncio
import os
import time
import unittest
from pathlib import Path

from agentic_ui_server.agent.session import AgentSession, AgentStartError, SessionState, TurnTimeout
from agentic_ui_server.resources import AgentFiles

from ..support.tiers import boot_sessions, methods, read_record, scripted_settings, temp_dir

QUESTION = {
    "permission": {
        "options": [
            {"optionId": "proceed_once", "name": "Submit", "kind": "allow_once"},
            {"optionId": "cancel", "name": "Cancel", "kind": "reject_once"},
        ],
        "toolCall": {
            "toolCallId": "q1",
            "title": "Ask user 1 question",
            "_meta": {"toolName": "ask_user_question", "qwenInteractionKind": "user_question"},
        },
    }
}


def alive(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    try:  # a zombie (exited, not yet reaped) counts as dead
        with open(f"/proc/{pid}/stat") as handle:
            return handle.read().split(")")[-1].split()[0] != "Z"
    except FileNotFoundError:
        return False


def boot_pids(record: Path) -> list[int]:
    return [entry["pid"] for entry in read_record(record) if entry.get("event") == "boot"]


class SessionCase(unittest.IsolatedAsyncioTestCase):
    def make(self, script: dict, sets: dict[str, str] | None = None) -> AgentSession:
        self.tmp = temp_dir(self)
        settings, self.record = scripted_settings(self.tmp, script, sets)
        session = AgentSession(settings, "chat-1", files=AgentFiles())
        self.addAsyncCleanup(session.close)
        return session


class SessionTest(SessionCase):
    async def test_start_ok(self) -> None:
        session = self.make({})
        await session.start()
        self.assertEqual(session.state, SessionState.READY)
        self.assertEqual(session.session_id, boot_sessions(self.record)[0], "the id its own process announced")
        self.assertEqual(session.agent_info["name"], "scripted-agent")
        self.assertTrue(session.cwd.is_dir() and session.cwd.is_relative_to(self.tmp / "work"))
        self.assertEqual(list(session.cwd.iterdir()), [], "per-chat cwd is empty")
        self.assertEqual(methods(self.record), ["initialize", "session/new"])

    async def test_no_mode_configured_never_calls_set_mode(self) -> None:
        session = self.make(
            {"prompts": [[{"permission": {"toolCall": {"toolCallId": "t1", "title": "Write"}}}, {"chunk": "ok"}]]}
        )
        result = await session.run_turn("go")
        self.assertEqual(result.stop_reason, "end_turn")
        self.assertEqual(result.permissions[0].outcome, "proceed_always_project")
        self.assertNotIn("session/set_mode", methods(self.record))
        self.assertNotIn("session/set_config_option", methods(self.record))

    async def test_configured_mode_set_when_advertised_and_skipped_when_missing(self) -> None:
        session = self.make({}, {"agent.mode": "plan"})
        await session.start()
        self.assertIn("session/set_mode", methods(self.record))
        session = self.make({}, {"agent.mode": "yolo"})
        await session.start()
        self.assertEqual(session.state, SessionState.READY)
        self.assertNotIn("session/set_mode", methods(self.record))

    async def test_authenticate_failure_is_a_warning(self) -> None:
        session = self.make(
            {"methods": {"authenticate": {"error": [-32603, "rename '.tmp' -> ''"]}}}, {"agent.auth_method": "openai"}
        )
        await session.start()
        self.assertEqual(methods(self.record), ["initialize", "authenticate", "session/new"])

    async def test_start_timeout_kills_process(self) -> None:
        session = self.make({"methods": {"initialize": {"hang": True}}}, {"timeouts.start_s": "0.5"})
        started = time.monotonic()
        with self.assertRaises(AgentStartError) as ctx:
            await session.start()
        self.assertEqual(ctx.exception.kind, "timeout")
        self.assertLess(time.monotonic() - started, 3)
        self.assertEqual(session.state, SessionState.IDLE)
        self.assertIsNone(session.pid, "process torn down")
        await asyncio.sleep(0.2)
        self.assertFalse(alive(boot_pids(self.record)[0]), "hung agent was killed")

    async def test_exit_during_start_reports_stderr_tail(self) -> None:
        session = self.make({"methods": {"session/new": {"exit": 3, "stderr": "fatal: boom at start"}}})
        with self.assertRaises(AgentStartError) as ctx:
            await session.start()
        self.assertEqual((ctx.exception.kind, ctx.exception.exit_code), ("exited", 3))
        self.assertIn("fatal: boom at start", ctx.exception.stderr_tail)

    async def test_spawn_error(self) -> None:
        session = self.make({}, {"agent.bin": "/nonexistent/agent-cli", "agent.base_args": ""})
        with self.assertRaises(AgentStartError) as ctx:
            await session.start()
        self.assertEqual(ctx.exception.kind, "spawn")

    async def test_rpc_error_during_start(self) -> None:
        session = self.make({"methods": {"session/new": {"error": [-32000, "auth required"]}}})
        with self.assertRaises(AgentStartError) as ctx:
            await session.start()
        self.assertEqual(ctx.exception.kind, "rpc")

    async def test_stdout_garbage_before_initialize_tolerated(self) -> None:
        session = self.make({"boot_garbage": "Booting qwen... (not JSON)", "prompts": [[{"chunk": "fine"}]]})
        self.assertEqual((await session.run_turn("hi")).text, "fine")

    async def test_turn_collects_text_tools_usage(self) -> None:
        steps = [
            {"thought": "hmm"},
            {"tool_call": {"toolCallId": "t1", "status": "pending", "title": "x", "rawInput": {}}},
            {
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "t1",
                    "status": "completed",
                    "rawOutput": 1,
                }
            },
            {"chunk": "Hello "},
            {"chunk": "world"},
            {"usage": {"inputTokens": 3, "outputTokens": 2}},
        ]
        session = self.make({"id_quirk": True, "prompts": [steps]})
        result = await session.run_turn("hi")
        self.assertEqual((result.text, result.thoughts, result.stop_reason), ("Hello world", "hmm", "end_turn"))
        self.assertEqual(result.tool_calls["t1"].status, "completed")
        self.assertEqual(result.usage, {"inputTokens": 3, "outputTokens": 2})
        self.assertEqual(session.state, SessionState.READY)

    async def test_question_rejected_and_turn_completes(self) -> None:
        session = self.make({"prompts": [[QUESTION, {"chunk": "proceeding with assumptions"}]]})
        result = await session.run_turn("make a table")
        self.assertEqual(result.stop_reason, "end_turn")
        self.assertEqual((result.permissions[0].question, result.permissions[0].outcome), (True, "cancel"))
        reply = next(e for e in read_record(self.record) if e.get("event") == "permission_reply")["reply"]
        self.assertEqual(reply["result"]["outcome"], {"outcome": "selected", "optionId": "cancel"})

    async def test_turn_timeout_cancels(self) -> None:
        session = self.make({"prompts": [[{"chunk": "working"}, {"hang": True}]]}, {"timeouts.turn_s": "0.4"})
        with self.assertRaises(TurnTimeout):
            await session.run_turn("long")
        self.assertIn("session/cancel", methods(self.record))
        self.assertEqual(session.state, SessionState.READY, "agent honoured the cancel, so it stays usable")

    async def test_cancel_returns_cancelled(self) -> None:
        session = self.make({"prompts": [[{"chunk": "partial"}, {"hang": True}]]})
        await session.start()
        turn = asyncio.create_task(session.run_turn("long"))
        await asyncio.sleep(0.3)
        self.assertTrue(await session.cancel())
        result = await turn
        self.assertEqual((result.stop_reason, result.text), ("cancelled", "partial"))
        self.assertFalse(await session.cancel(), "nothing to cancel when idle")

    async def test_cancel_during_agent_start_drops_the_prompt(self) -> None:
        """[SV-C6] a cancel that arrives while the turn is still starting the agent is not lost: the prompt is
        never sent and the turn returns cancelled (P6: /cancel right after /prompt on a cold chat)."""
        session = self.make({"methods": {"session/new": {"delay": 0.6}}, "prompts": [[{"hang": True}]]})
        turn = asyncio.create_task(session.run_turn("long"))
        await asyncio.sleep(0.3)
        self.assertTrue(await session.cancel())
        result = await asyncio.wait_for(turn, 5)
        self.assertEqual(result.stop_reason, "cancelled")
        self.assertNotIn("session/prompt", methods(self.record))
        self.assertEqual(session.state, SessionState.READY)

    async def test_late_prompt_error_after_cancel_reported_as_cancelled(self) -> None:
        session = self.make({"on_cancel": "error", "prompts": [[{"hang": True}]]})
        await session.start()
        turn = asyncio.create_task(session.run_turn("long"))
        await asyncio.sleep(0.3)
        await session.cancel()
        self.assertEqual((await turn).stop_reason, "cancelled")
        self.assertEqual(session.state, SessionState.READY)

    async def test_cancel_ignored_kills_after_grace(self) -> None:
        session = self.make({"on_cancel": "ignore", "prompts": [[{"hang": True}]]}, {"timeouts.cancel_grace_s": "0.5"})
        await session.start()
        pid = session.pid
        turn = asyncio.create_task(session.run_turn("long"))
        await asyncio.sleep(0.3)
        started = time.monotonic()
        await session.cancel()
        result = await asyncio.wait_for(turn, 3)
        self.assertLess(time.monotonic() - started, 2.5)
        self.assertEqual(result.stop_reason, "cancelled")
        self.assertEqual(session.state, SessionState.DEAD)
        self.assertEqual(session.session_id, boot_sessions(self.record)[0], "session id kept for a later session/load")
        await asyncio.sleep(0.2)
        self.assertFalse(alive(pid))


if __name__ == "__main__":
    unittest.main()
