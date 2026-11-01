"""agent/manager.py: per-chat FIFO, parallel chats, queue bound, cancel without the lock, LRU, reaper, shutdown."""

import asyncio
import time
import unittest

from agentic_ui_server.agent.manager import ManagerClosed, QueueFull, SessionManager
from agentic_ui_server.config import SCHEMA
from agentic_ui_server.resources import AgentFiles

from ..support.tiers import methods, scripted_settings, temp_dir
from .test_session import alive


class ManagerTest(unittest.IsolatedAsyncioTestCase):
    def make(self, script: dict, sets: dict[str, str] | None = None) -> SessionManager:
        settings, self.record = scripted_settings(temp_dir(self), script, sets)
        manager = SessionManager(settings, files=AgentFiles())
        self.addAsyncCleanup(manager.shutdown)
        return manager

    async def run_turn(self, manager: SessionManager, chat_id: str, text: str = "go", log: list | None = None):
        async with manager.turn(chat_id) as session:
            if log is not None:
                log.append(("enter", chat_id, text, time.monotonic()))
            result = await session.run_turn(text)
            if log is not None:
                log.append(("exit", chat_id, text, time.monotonic()))
            return result, session

    async def test_same_chat_serialized_fifo(self) -> None:
        manager = self.make({"prompts": [[{"sleep": 0.15}, {"chunk": "x"}]]})
        log: list = []
        tasks = []
        for label in ("t1", "t2", "t3"):
            tasks.append(asyncio.create_task(self.run_turn(manager, "chat", label, log)))
            await asyncio.sleep(0.01)
        results = await asyncio.gather(*tasks)
        self.assertEqual([entry[2] for entry in log if entry[0] == "enter"], ["t1", "t2", "t3"])
        events = [entry[0] for entry in log]
        self.assertEqual(events, ["enter", "exit"] * 3, "turns never overlap")
        self.assertEqual(len({id(session) for _, session in results}), 1)

    async def test_different_chats_parallel_in_separate_processes(self) -> None:
        manager = self.make({"prompts": [[{"sleep": 0.6}, {"chunk": "x"}]]})
        started = time.monotonic()
        (_r1, s1), (_r2, s2) = await asyncio.gather(self.run_turn(manager, "a"), self.run_turn(manager, "b"))
        self.assertLess(time.monotonic() - started, 1.1)
        self.assertIsNot(s1, s2)
        self.assertNotEqual(s1.pid, s2.pid)
        self.assertNotEqual(s1.cwd, s2.cwd)
        self.assertEqual(manager.live_count, 2)

    async def test_one_process_per_chat_no_pool_or_spares(self) -> None:
        """SV-C19: nothing spawns ahead of a turn, each chat gets exactly its own process, no warm spares."""
        self.assertEqual([k for k in SCHEMA if any(w in k for w in ("pool", "spare", "warm", "prespawn"))], [])
        manager = self.make({"prompts": [[{"chunk": "x"}]]})
        manager.start_reaper()
        await asyncio.sleep(0.05)
        self.assertEqual(manager.live_count, 0, "no process before the first turn")
        _, first = await self.run_turn(manager, "a")
        _, again = await self.run_turn(manager, "a")
        self.assertIs(first, again)
        self.assertEqual(manager.live_count, 1, "one process for one chat, nothing spare")
        await self.run_turn(manager, "b")
        self.assertEqual(manager.live_count, 2)
        self.assertEqual(methods(self.record).count("initialize"), 2, "one spawn per chat")

    async def test_queue_overflow(self) -> None:
        manager = self.make({"prompts": [[{"sleep": 0.5}]]}, {"limits.max_queue_per_chat": "1"})
        first = asyncio.create_task(self.run_turn(manager, "c", "1"))
        await asyncio.sleep(0.05)
        second = asyncio.create_task(self.run_turn(manager, "c", "2"))
        await asyncio.sleep(0.05)
        with self.assertRaises(QueueFull):
            await self.run_turn(manager, "c", "3")
        await asyncio.gather(first, second)
        await self.run_turn(manager, "c", "4")  # queue drained: accepted again

    async def test_cancel_reaches_busy_session_while_another_waits(self) -> None:
        manager = self.make({"prompts": [[{"chunk": "one"}, {"hang": True}], [{"chunk": "two"}]]})
        first = asyncio.create_task(self.run_turn(manager, "x", "1"))
        await asyncio.sleep(0.3)
        second = asyncio.create_task(self.run_turn(manager, "x", "2"))
        await asyncio.sleep(0.05)
        self.assertTrue(await asyncio.wait_for(manager.cancel("x"), 2))
        (r1, _), (r2, _) = await asyncio.wait_for(asyncio.gather(first, second), 5)
        self.assertEqual((r1.stop_reason, r1.text), ("cancelled", "one"))
        self.assertEqual((r2.stop_reason, r2.text), ("end_turn", "two"))
        self.assertFalse(await manager.cancel("unknown-chat"))

    async def test_lru_eviction_at_cap_skips_busy(self) -> None:
        manager = self.make({"prompts": [[{"chunk": "x"}]]}, {"limits.max_live_agents": "2"})
        await self.run_turn(manager, "a")
        await asyncio.sleep(0.01)
        await self.run_turn(manager, "b")
        async with manager.turn("b") as busy_b:  # b is busy (holds its turn) while c arrives
            await self.run_turn(manager, "c")
            self.assertTrue(busy_b.is_live)
        self.assertFalse(manager.session("a").is_live, "LRU idle session evicted")
        self.assertTrue(manager.session("c").is_live)
        self.assertEqual(manager.live_count, 2)
        _result, session = await self.run_turn(manager, "a")  # evicted chat comes back via session/load
        self.assertTrue(session.resumed)

    async def test_waits_for_a_slot_when_all_busy(self) -> None:
        manager = self.make({"prompts": [[{"sleep": 0.5}, {"chunk": "x"}]]}, {"limits.max_live_agents": "1"})
        first = asyncio.create_task(self.run_turn(manager, "a"))
        await asyncio.sleep(0.2)
        started = time.monotonic()
        await self.run_turn(manager, "b")
        self.assertGreater(time.monotonic() - started, 0.2, "b waited for a's turn to finish")
        await first
        self.assertFalse(manager.session("a").is_live)
        self.assertLessEqual(manager.live_count, 1)

    async def test_two_waiters_do_not_deadlock(self) -> None:
        manager = self.make({"prompts": [[{"sleep": 0.3}, {"chunk": "x"}]]}, {"limits.max_live_agents": "1"})
        turns = [asyncio.create_task(self.run_turn(manager, chat)) for chat in ("a", "b", "c")]
        results = await asyncio.wait_for(asyncio.gather(*turns), 8)
        self.assertEqual([r.stop_reason for r, _ in results], ["end_turn"] * 3)

    async def test_idle_reaper_closes_and_forgets(self) -> None:
        manager = self.make(
            {}, {"limits.idle_ttl_s": "0.2", "limits.reap_interval_s": "0.1", "limits.forget_after_s": "3600"}
        )
        _, session = await self.run_turn(manager, "idle")
        pid = session.pid
        manager.start_reaper()
        await asyncio.sleep(0.6)
        self.assertFalse(session.is_live)
        self.assertFalse(alive(pid))
        self.assertIs(manager.session("idle"), session, "kept for session/load until forget_after_s")
        await manager.reap_idle(now=time.monotonic() + 7200)
        self.assertIsNone(manager.session("idle"))

    async def test_shutdown_closes_all(self) -> None:
        manager = self.make({})
        sessions = [(await self.run_turn(manager, chat))[1] for chat in ("a", "b")]
        pids = [s.pid for s in sessions]
        await manager.shutdown()
        await asyncio.sleep(0.1)
        self.assertEqual([alive(pid) for pid in pids], [False, False])
        with self.assertRaises(ManagerClosed):
            await self.run_turn(manager, "a")


if __name__ == "__main__":
    unittest.main()
