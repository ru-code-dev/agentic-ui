"""Tier 2: the ru-code fake ACP agent (RESEARCH §D.1) driven through AgentSession (PLAN §3.2)."""

import asyncio
import json
import time
import unittest

from agentic_ui_server.acp.jsonrpc import RpcError
from agentic_ui_server.agent.session import AgentCrashed, AgentSession, AgentStartError, SessionState, TurnTimeout
from agentic_ui_server.resources import AgentFiles

from ..support.tiers import FAKE_ACP, base_environ, make_settings, require, temp_dir


class FakeQwenTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        require(2, FAKE_ACP)
        self.tmp = temp_dir(self)
        self.control = self.tmp / "control.json"

    def session(self, scenario: str, sets: dict[str, str] | None = None) -> AgentSession:
        env = f"RU_CODE_FAKE_ACP={scenario},RU_CODE_FAKE_CONTROL_FILE={self.control}"
        values = {
            "agent.bin": str(FAKE_ACP),
            "agent.base_args": "",
            "agent.acp_flag": "",
            "agent.env": env,
            "timeouts.start_s": "20",
            "timeouts.turn_s": "15",
            "timeouts.cancel_grace_s": "1.5",
        }
        settings = make_settings(self.tmp, {**values, **(sets or {})}, base_environ(self.tmp))
        session = AgentSession(settings, f"chat-{scenario}", files=AgentFiles())
        self.addAsyncCleanup(session.close)
        return session

    def flow(self, **control) -> None:
        self.control.write_text(json.dumps(control, ensure_ascii=False), encoding="utf-8")

    async def test_ok(self) -> None:
        session = self.session("OK")
        result = await session.run_turn("привет")
        self.assertEqual((result.text, result.stop_reason), ("Готово.", "end_turn"))
        self.assertEqual(result.kinds.get("agent_message_chunk"), 1, 'session/update with id "" handled')

    async def test_flow_scripted_replies_per_turn(self) -> None:
        session = self.session("FLOW")
        self.flow(responseText="Первый ответ")
        self.assertEqual((await session.run_turn("1")).text, "Первый ответ")
        self.flow(responseText="Второй ответ")
        result = await session.run_turn("2")
        self.assertEqual((result.text, result.stop_reason), ("Второй ответ", "end_turn"))

    async def test_flow_permission_auto_approved_without_mode(self) -> None:
        session = self.session("FLOW")
        self.flow(responseText="Записал.", approval={"kind": "file-change", "via": "tool"})
        result = await session.run_turn("write a file")
        self.assertEqual(result.stop_reason, "end_turn")
        self.assertEqual([(p.outcome, p.question) for p in result.permissions], [("proceed_always", False)])
        self.assertEqual(session.settings.agent.mode, "")

    async def test_hold_cancel(self) -> None:
        session = self.session("HOLD")
        await session.start()
        turn = asyncio.create_task(session.run_turn("long"))
        await asyncio.sleep(0.5)
        started = time.monotonic()
        await session.cancel()
        result = await asyncio.wait_for(turn, 5)
        self.assertEqual(result.stop_reason, "cancelled")
        self.assertLess(time.monotonic() - started, 3)

    async def test_start_hang_times_out(self) -> None:
        session = self.session("START_HANG", {"timeouts.start_s": "3"})
        with self.assertRaises(AgentStartError) as ctx:
            await session.start()
        self.assertEqual(ctx.exception.kind, "timeout")

    async def test_start_error(self) -> None:
        with self.assertRaises(AgentStartError) as ctx:
            await self.session("START_ERROR").start()
        self.assertEqual(ctx.exception.kind, "rpc")
        self.assertIn("start handshake failed", str(ctx.exception))

    async def test_b1_crash_then_restart(self) -> None:
        session = self.session("B1")
        with self.assertRaises(AgentCrashed) as ctx:
            await session.run_turn("go")
        self.assertEqual(ctx.exception.exit_code, 1)
        first_pid_dead = session.state == SessionState.DEAD
        with self.assertRaises(AgentCrashed):  # the next turn restarts (session/load), and B1 crashes again
            await session.run_turn("again")
        self.assertTrue(first_pid_dead)
        self.assertTrue(session.resumed, "restart resumed the session with session/load")

    async def test_c1_garbage_never_hangs(self) -> None:
        session = self.session("C1", {"timeouts.turn_s": "3"})
        started = time.monotonic()
        with self.assertRaises((TurnTimeout, AgentCrashed, RpcError)):
            await session.run_turn("go")
        self.assertLess(time.monotonic() - started, 3 + 1.5 + 2 + 1)

    async def test_rpc_errors(self) -> None:
        for scenario, code, usable in (
            ("A5", -32000, False),
            ("A4", -32601, False),
            ("A6", -32002, False),
            ("A1", -32603, True),
            ("A2", 429, True),
        ):
            with self.subTest(scenario=scenario):
                session = self.session(scenario)
                with self.assertRaises(RpcError) as ctx:
                    await session.run_turn("go")
                self.assertEqual(ctx.exception.code, code)
                self.assertEqual(session.state, SessionState.READY, "the agent stays alive after an RPC error")
                if usable:
                    pid = session.pid
                    with self.assertRaises(RpcError):
                        await session.run_turn("again")
                    self.assertEqual(session.pid, pid, "same process reused")


if __name__ == "__main__":
    unittest.main()
