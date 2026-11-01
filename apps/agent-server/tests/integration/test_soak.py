"""Tier 1 soak (P10): 20 sequential HTTP turns on the real server process with the scripted ACP agent.

5 chats round robin under ``limits.max_live_agents = 2``, so most turns evict a process and spawn a new one, and the
first turn of every process is repaired once (broken reply, then valid). Sampled after every turn: the server's RSS
and its live agent child processes. Thresholds: RSS may grow at most 8 MiB from turn 5 (warm: imports, caches, first
spawns done) to turn 20 (a leak of one reply/turn record per turn stays far below it, a per-process leak of ~1 MiB
per spawn ≈ 14 MiB exceeds it); live agents never exceed the cap; after SIGTERM no agent survives; chat dirs stay
one per chat; the server's TMPDIR is empty.
"""

import json
import os
import re
import signal
import subprocess
import sys
import time
import unittest

from ..support.http_client import call
from ..support.stub_session import again, broken, reply
from ..support.tiers import APP_DIR, SCRIPTED_AGENT, base_environ, temp_dir

TURNS = 20
CHATS = 5
CAP = 2
RSS_GROWTH_LIMIT_KIB = 8 * 1024


def processes() -> dict[int, tuple[int, int]]:
    """pid → (ppid, rss KiB) of every process (``ps`` works on Linux and macOS)."""
    out = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,rss="], capture_output=True, text=True, check=True).stdout
    table = {}
    for line in out.splitlines():
        pid, ppid, rss = (int(part) for part in line.split())
        table[pid] = (ppid, rss)
    return table


def children(table: dict[int, tuple[int, int]], parent: int) -> set[int]:
    return {pid for pid, (ppid, _) in table.items() if ppid == parent}


class SoakTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = temp_dir(self)
        self.server_tmp = self.tmp / "server-tmp"
        self.server_tmp.mkdir()
        script = self.tmp / "script.json"
        steps = [
            [{"chunk": reply(broken())}, {"stop": "end_turn"}],
            [{"chunk": reply(again())}, {"stop": "end_turn"}],  # SV-C28: valid on a chat's next visit too
        ]
        script.write_text(json.dumps({"prompts": steps}, ensure_ascii=False), encoding="utf-8")
        sets = {
            "agent.bin": sys.executable,
            "agent.base_args": f"-I {SCRIPTED_AGENT}",
            "agent.acp_flag": "",
            "agent.inherit_env": "false",
            "agent.env": f"SCRIPTED_AGENT_SCRIPT={script}",
            "agent.work_root": str(self.tmp / "work"),
            "agent.cache_dir": str(self.tmp / "cache"),
            "limits.max_live_agents": str(CAP),
            "log.level": "INFO",
        }
        argv = [sys.executable, "-m", "agentic_ui_server", "--port", "0"]
        argv += [arg for key, value in sets.items() for arg in ("--set", f"{key}={value}")]
        env = {**base_environ(self.tmp), "TMPDIR": str(self.server_tmp), "PYTHONPATH": str(APP_DIR / "src")}
        self.log = self.tmp / "server.log"
        with self.log.open("w", encoding="utf-8") as stderr:
            self.proc = subprocess.Popen(argv, stderr=stderr, env=env, cwd=self.tmp)
        self.addCleanup(self.proc.kill)
        deadline = time.monotonic() + 30
        while not (match := re.search(r"listening on (http://\S+)", self.log.read_text(encoding="utf-8"))):
            self.assertIsNone(self.proc.poll(), self.log.read_text(encoding="utf-8"))
            self.assertLess(time.monotonic(), deadline, "server did not start")
            time.sleep(0.05)
        self.url = match.group(1)

    def test_twenty_sequential_turns_keep_memory_and_processes_flat(self) -> None:
        """[P10-soak, SV-C19] 20 turns, 5 chats, cap 2: RSS flat, live agents ≤ cap, none left after SIGTERM."""
        pid = self.proc.pid
        rss, seen = [], set()
        for turn in range(TURNS):
            chat = f"soak-{turn % CHATS}"
            status, body, _ = call(self.url, "/prompt", {"chatId": chat, "text": f"форма входа {turn}"})
            self.assertEqual((status, body["status"], body["messages"]), (200, "ok", again()), body)
            self.assertEqual(body["attempts"], 2, "each fresh process repairs its first reply once")
            table = processes()
            live = children(table, pid)
            seen |= live
            self.assertLessEqual(len(live), CAP, f"turn {turn}: {len(live)} live agents")
            _, health, _ = call(self.url, "/health", None)
            self.assertLessEqual(health["liveSessions"], CAP)
            rss.append(table[pid][1])

        growth = rss[-1] - rss[4]
        print(f"\nsoak: rss KiB turn5={rss[4]} turn20={rss[-1]} growth={growth} max={max(rss)}; spawned={len(seen)}")
        self.assertLessEqual(growth, RSS_GROWTH_LIMIT_KIB, rss)
        self.assertGreaterEqual(len(seen), TURNS - CAP, "turns rotated chats through new processes")

        self.proc.send_signal(signal.SIGTERM)
        self.assertEqual(self.proc.wait(15), 0, self.log.read_text(encoding="utf-8"))
        deadline = time.monotonic() + 5
        while (alive := seen & set(processes())) and time.monotonic() < deadline:
            time.sleep(0.1)
        for leftover in alive:
            os.kill(leftover, signal.SIGKILL)
        self.assertEqual(alive, set(), "agent processes outlived the server")
        self.assertEqual(len(list((self.tmp / "work").iterdir())), CHATS, "one cwd per chat, not per turn")
        self.assertEqual(list(self.server_tmp.iterdir()), [], "the server left temp files")


if __name__ == "__main__":
    unittest.main()
