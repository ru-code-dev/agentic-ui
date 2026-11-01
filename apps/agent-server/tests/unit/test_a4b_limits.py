"""A4b test-quality guards for limits and HTTP framing (A4b-M5, M6; reviewer attack/mutation/test_a4b_mutants.py):
reply cap, reaper in-flight skip, max_attempts >= 0, HEAD framing, 413 drain, * origin echo, chatId length."""

import asyncio
import time
import unittest
from urllib.parse import urlsplit

from agentic_ui_server.acp.protocol import StopReason
from agentic_ui_server.agent.manager import SessionManager
from agentic_ui_server.agent.turn import TurnResult
from agentic_ui_server.config import ConfigError, load_settings
from agentic_ui_server.conversation.check import reply_problems
from agentic_ui_server.resources import AgentFiles

from ..support.http_client import call, raw_exchange, raw_first_line, stub_app, stub_settings
from ..support.stub_session import StubSession, example, reply


class ReplyCapTest(unittest.TestCase):
    def test_reply_over_512_kib_is_invalid_unread(self) -> None:
        """[A4b-M6, SV-C7] A3-02: a literal 600 KiB reply (not the constant + 1) is invalid unread; a reply over 512
        KiB is invalid without being read (mutant reply-cap-x10)."""
        text = reply(example()) + " " * (600 * 1024)
        check = reply_problems(text)
        self.assertTrue(check.problems and check.problems[0].startswith("the reply is too long"), check.problems[:1])


class ReaperTest(unittest.IsolatedAsyncioTestCase):
    async def test_reaper_never_closes_a_busy_session(self) -> None:
        """[SV-C11, A4b-M6] manager.py doc: the reaper skips chats with a turn in flight, even past idle_ttl_s (mutant
        reaper-inflight-off)."""
        settings = stub_settings(limits__idle_ttl_s="1")
        stub = StubSession("c", [("hang", 1.5)])
        manager = SessionManager(settings, files=AgentFiles(), session_factory=lambda _: stub)

        async def turn() -> TurnResult:
            async with manager.turn("c") as session:
                return await session.run_turn("x")

        task = asyncio.create_task(turn())
        await asyncio.sleep(0.2)
        await manager.reap_idle(now=time.monotonic() + 3600)
        self.assertEqual((await task).stop_reason, StopReason.END_TURN, "the reaper closed a session mid-turn")


class ConfigTest(unittest.TestCase):
    def test_negative_repair_attempts_refused(self) -> None:
        """[SV-C8, A4b-M6] config.py _validate: repair.max_attempts >= 0 (mutant max-attempts-negative-ok)."""
        with self.assertRaises(ConfigError):
            load_settings(["--set", "repair.max_attempts=-1"], {"HOME": "/home/t"})


class HttpEdgesTest(unittest.TestCase):
    def test_cors_wildcard_echoes_the_origin(self) -> None:
        """[SV-C6, A4b-M5] server.py doc: with `*` in server.cors_origins any Origin is echoed."""
        app, _ = stub_app(self, {}, server__cors_origins="*")
        _, _, headers = call(app.url, "/health", headers={"Origin": "https://page.example"})
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "https://page.example")

    def test_chat_id_over_200_chars_is_400(self) -> None:
        """[A4b-M5, A4b-H3] chatId must be 1..200 printable characters: 201 → 400 bad_request, 200 → served."""
        app, _ = stub_app(self, {})
        status, body, _ = call(app.url, "/cancel", {"chatId": "c" * 201})
        self.assertEqual((status, body.get("error")), (400, "bad_request"))
        self.assertEqual(call(app.url, "/cancel", {"chatId": "c" * 200})[0], 200)

    def test_head_sends_no_body_on_a_kept_alive_connection(self) -> None:
        """[SV-C6, A4b-M5] a HEAD answer has no body: the next pipelined response follows its headers."""
        app, _ = stub_app(self, {})
        base = urlsplit(app.url).path
        data = raw_exchange(
            app.url,
            f"HEAD {base}/health HTTP/1.1\r\nHost: x\r\n\r\n"
            f"GET {base}/health HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n".encode(),
        )
        first, _, rest = data.partition(b"\r\n\r\n")
        self.assertTrue(first.startswith(b"HTTP/1.1 405"), first[:40])
        self.assertTrue(rest.startswith(b"HTTP/1.1 "), f"bytes after the HEAD headers: {rest[:60]!r}")

    def test_too_large_body_gets_the_413(self) -> None:
        """[SV-C6, A4b-M5] a 4 MiB body over a 1000-byte limit: the client reads the 413 (drained), three times."""
        app, _ = stub_app(self, {}, server__max_body_bytes="1000")
        body = b"x" * (4 * 1024 * 1024)
        head = f"POST {urlsplit(app.url).path}/prompt HTTP/1.1\r\nHost: x\r\nContent-Length: {len(body)}\r\n\r\n"
        statuses = [raw_first_line(app.url, head.encode() + body)[:12] for _ in range(3)]
        self.assertEqual(statuses, [b"HTTP/1.1 413"] * 3)


if __name__ == "__main__":
    unittest.main()
