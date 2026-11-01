"""agent/session.py crash, restart (session/load with replay suppressed, fallback session/new) and teardown."""

import asyncio
import unittest

from agentic_ui_server.agent.session import AgentCrashed, AgentSession, SessionState
from agentic_ui_server.resources import AgentFiles

from ..support.tiers import boot_sessions, methods, read_record, scripted_settings, temp_dir
from .test_session import SessionCase, alive


class SessionRestartTest(SessionCase):
    async def test_crash_mid_turn(self) -> None:
        session = self.make({"prompts": [[{"chunk": "partial"}, {"stderr": "panic: out of cheese"}, {"exit": 4}]]})
        with self.assertRaises(AgentCrashed) as ctx:
            await session.run_turn("go")
        self.assertEqual(ctx.exception.exit_code, 4)
        self.assertIn("out of cheese", ctx.exception.stderr_tail)
        self.assertEqual(session.state, SessionState.DEAD)

    async def test_restart_after_crash_uses_session_load_with_replay_suppressed(self) -> None:
        session = self.make(
            {
                "runs": [
                    {"prompts": [[{"exit": 4}]]},
                    {
                        "methods": {"session/load": {"replay": ["OLD HISTORY"]}},
                        "prompts": [[{"chunk": "after restart"}]],
                    },
                ]
            }
        )
        with self.assertRaises(AgentCrashed):
            await session.run_turn("first")
        result = await session.run_turn("second")
        self.assertEqual(result.text, "after restart")
        self.assertTrue(session.resumed)
        loads = [e for e in read_record(self.record) if e.get("method") == "session/load"]
        self.assertEqual(loads[0]["params"]["sessionId"], boot_sessions(self.record)[0], "the first process' id")
        self.assertEqual(methods(self.record).count("session/new"), 1)

    async def test_restart_falls_back_to_session_new_when_load_fails(self) -> None:
        session = self.make(
            {
                "runs": [
                    {"prompts": [[{"exit": 4}]]},
                    {
                        "methods": {
                            "session/load": {"error": [-32002, "resource not found"]},
                            "session/new": {"result": {"sessionId": "scripted-2"}},
                        },
                        "prompts": [[{"chunk": "fresh"}]],
                    },
                ]
            }
        )
        with self.assertRaises(AgentCrashed):
            await session.run_turn("first")
        self.assertEqual((await session.run_turn("second")).text, "fresh")
        self.assertFalse(session.resumed)
        self.assertEqual(session.session_id, "scripted-2")

    async def test_caller_cancellation_kills_the_turn(self) -> None:
        session = self.make({"prompts": [[{"hang": True}]]})
        await session.start()
        pid = session.pid
        turn = asyncio.create_task(session.run_turn("long"))
        await asyncio.sleep(0.3)
        turn.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await turn
        self.assertEqual(session.state, SessionState.DEAD)
        await asyncio.sleep(0.3)
        self.assertFalse(alive(pid))

    async def test_close_terminates_process(self) -> None:
        session = self.make({})
        await session.start()
        pid = session.pid
        await session.close()
        self.assertFalse(alive(pid))
        self.assertEqual(session.state, SessionState.DEAD)

    async def test_close_during_a_turn_ends_it_cancelled(self) -> None:
        """[SV-C19, SV-C16] closing a busy session (server shutdown) ends its turn as cancelled, the process is gone;
        before, the turn read the torn-down process (AttributeError) and the request became an HTTP 500."""
        session = self.make({"on_cancel": "ignore", "prompts": [[{"chunk": "partial"}, {"hang": True}]]})
        await session.start()
        pid = session.pid
        turn = asyncio.create_task(session.run_turn("long"))
        await asyncio.sleep(0.3)
        await session.close()
        result = await asyncio.wait_for(turn, 5)
        self.assertEqual(result.stop_reason, "cancelled")
        await asyncio.sleep(0.2)
        self.assertFalse(alive(pid))

    async def test_two_crashed_chats_resume_their_own_sessions(self) -> None:
        """[SV-C11, P2-session] two chats on one script both crash and restart: each new process resumes the session
        id its chat's first process created, in that chat's cwd (the scripted agent, like qwen, refuses another
        chat's id); before, every process answered scripted-1, so a swapped resume id still loaded."""
        tmp = temp_dir(self)
        crash, ok = {"prompts": [[{"exit": 4}]]}, {"prompts": [[{"chunk": "resumed"}]]}
        settings, record = scripted_settings(tmp, {"runs": [crash, crash, ok]})
        chats = [AgentSession(settings, chat, files=AgentFiles()) for chat in ("chat-a", "chat-b")]
        for chat in chats:
            self.addAsyncCleanup(chat.close)
            await chat.start()
        first = [chat.session_id for chat in chats]
        self.assertEqual(first, boot_sessions(record)[:2])
        self.assertNotEqual(first[0], first[1])
        for chat in chats:
            with self.assertRaises(AgentCrashed):
                await chat.run_turn("first")
        for chat in chats:
            self.assertEqual((await chat.run_turn("second")).text, "resumed")
        loads = {
            e["params"]["cwd"]: e["params"]["sessionId"]
            for e in read_record(record)
            if e.get("method") == "session/load"
        }
        self.assertEqual(loads, {str(chat.cwd): sid for chat, sid in zip(chats, first, strict=True)})
        self.assertEqual([(chat.resumed, chat.session_id) for chat in chats], [(True, sid) for sid in first])
        self.assertEqual(methods(record).count("session/new"), 2, "no fresh session: both resumes were accepted")

    async def test_the_scripted_agent_refuses_another_chats_session(self) -> None:
        """[SV-C11] the proof's referee: session/load of chat B's id in chat A's cwd fails like qwen (-32002)."""
        tmp = temp_dir(self)
        settings, _ = scripted_settings(tmp, {})
        a, b = (AgentSession(settings, chat, files=AgentFiles()) for chat in ("chat-a", "chat-b"))
        for chat in (a, b):
            self.addAsyncCleanup(chat.close)
            await chat.start()
        with self.assertRaisesRegex(Exception, "Resource not found"):
            await a._client.load_session(b.session_id, str(a.cwd))


if __name__ == "__main__":
    unittest.main()
