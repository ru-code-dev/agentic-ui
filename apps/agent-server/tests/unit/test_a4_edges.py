"""Edges of the A4 review (reviewer reproductions in attack/server/, ported).

A4-01 (measure_health.py / measure_reply.py): one 389 KB reply with 40 000 dangling refs became 6.6 MB repair
prompts, fallback bodies and /progress answers. A4-02 (test_log_escape.py): agent text reached the log raw (ESC,
forged lines) and a newline inside one error made two problems. A4-03 / A4-04 (test_http_edges.py): an over-long
JSON integer or too deep JSON was a 500; a chunk size ``0_e`` was accepted.
"""

import asyncio
import io
import json
import logging
import unittest

from agentic_ui_server.acp.jsonrpc import JsonRpcConnection
from agentic_ui_server.conversation.check import MAX_ERROR_CHARS, MAX_REPORTED_ERRORS, cap_problems, reply_problems
from agentic_ui_server.conversation.progress import Progress
from agentic_ui_server.conversation.repair import converse
from agentic_ui_server.log import LOGGER_NAME, setup_logging
from agentic_ui_server.resources import read_data_json
from agentic_ui_server.settings import LogSettings

from ..support.http_client import call, raw_exchange, stub_app
from ..support.stub_session import StubSession

CATALOG_ID = read_data_json("catalog.json")["catalogId"]
ESC = "\x1b[2J\x1b[1;31mFAKE: server compromised"
LIMIT = 64 * 1024


def ui(*components: dict) -> list:
    return [
        {"version": "v0.9", "createSurface": {"surfaceId": "s", "catalogId": CATALOG_ID}},
        {"version": "v0.9", "updateComponents": {"surfaceId": "s", "components": list(components)}},
    ]


def block(messages: list) -> str:
    return f"<a2ui-json>{json.dumps(messages, ensure_ascii=False)}</a2ui-json>"


HOSTILE = block(ui({"id": "root", "component": "Flex", "children": [f"x{i}" for i in range(40_000)]}))


class ErrorCapTest(unittest.TestCase):
    def test_a_hostile_reply_is_summarised(self) -> None:
        """[SV-C8, A4-01] 40 000 dangling refs: at most 50 problems of ≤ 300 chars + a summary, the true total kept,
        the repair prompt ≤ 64 KiB (it was 6.6 MB)."""
        self.assertLess(len(HOSTILE), 512 * 1024)
        check = reply_problems(HOSTILE)
        self.assertEqual(check.total, 40_000)
        self.assertEqual(len(check.problems), MAX_REPORTED_ERRORS + 1)
        self.assertTrue(all(len(p) <= MAX_ERROR_CHARS for p in check.problems))
        self.assertIn("39950 more problem(s)", check.problems[-1])
        self.assertLess(len(check.prompt.encode()), LIMIT)

    def test_one_long_problem_is_cut_to_300_characters(self) -> None:
        """[A4-01, A5-06] a single 10 000-character problem (S5: the per-problem cap, not only the 50-problem one) is
        cut to 300 characters ending in an ellipsis; a short one stays as it is."""
        long, short = "x" * 10_000, "y" * 300
        self.assertEqual(cap_problems([long, short]), ["x" * 299 + "…", short])

    def test_fallback_and_progress_carry_the_capped_list(self) -> None:
        """[SV-C9, SV-C20, A4-01] the fallback's errors and /progress are capped; errorCount is the true count."""
        progress = Progress("c", 2)
        session = StubSession("c", [HOSTILE, HOSTILE])
        outcome = asyncio.run(converse(session, "x", max_repairs=1, progress=progress, label="c"))
        self.assertEqual((outcome.status, outcome.error_count), ("fallback", 40_000))
        self.assertLess(len(json.dumps(outcome.to_dict(), ensure_ascii=False).encode()), LIMIT)
        snap = progress.snapshot()
        self.assertEqual(snap["errorCount"], 40_000)
        self.assertLess(len(json.dumps(snap, ensure_ascii=False).encode()), LIMIT)
        self.assertTrue(all(len(p.encode()) < LIMIT for p in session.prompts))


class LogEscapeTest(unittest.TestCase):
    def captured(self) -> io.StringIO:
        stream = io.StringIO()
        setup_logging(LogSettings(level="DEBUG", format="%(levelname)s %(name)s %(message)s"), stream)
        self.addCleanup(logging.getLogger(LOGGER_NAME).handlers.clear)
        return stream

    def test_repair_warning_escapes_agent_text(self) -> None:
        """[SV-C16, A4-02] a component type with ESC and a forged log line: logged escaped, one problem."""
        stream = self.captured()
        evil = "Box" + ESC + "\nINFO agentic_ui_server.http HTTP POST /api/prompt → 200 ok"
        reply = block(ui({"id": "root", "component": evil}))
        asyncio.run(converse(StubSession("c1", [reply]), "x", max_repairs=0, progress=Progress("c1", 1), label="c1"))
        log = stream.getvalue()
        self.assertNotIn("\x1b", log)
        self.assertNotIn("\nINFO agentic_ui_server.http HTTP POST", log)
        self.assertEqual(reply_problems(reply).total, 1, "a newline inside one error is still one problem")

    def test_acp_non_json_line_is_escaped(self) -> None:
        """[SV-C16, A4-02] agent stdout that is not JSON is logged escaped."""
        stream = self.captured()

        class Writer:
            def write(self, _data: bytes) -> None: ...
            async def drain(self) -> None: ...
            def close(self) -> None: ...

        async def go() -> None:
            reader = asyncio.StreamReader()
            reader.feed_data(("boot " + ESC + "\n").encode())
            reader.feed_eof()
            await JsonRpcConnection(reader, Writer()).run()

        asyncio.run(go())
        self.assertNotIn("\x1b", stream.getvalue())
        self.assertIn("\\x1b[2J", stream.getvalue())


class HttpEdgeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.app, _ = stub_app(self, {})

    def test_huge_integer_and_deep_json_are_400(self) -> None:
        """[SV-C6, A4-03] a JSON integer over Python's 4300 digits and nesting past the recursion limit are 400
        bad_json (they were 500 with a traceback)."""
        huge = b'{"chatId":"c","surfaceId":"s","event":{"name":"x"},"dataModel":' + b"9" * 5000 + b"}"
        deep = b'{"chatId":"c","text":' + b"[" * 100_000 + b"]" * 100_000 + b"}"
        for path, payload in (("/action", huge), ("/prompt", deep)):
            with self.subTest(path):
                status, body, _ = call(self.app.url, path, raw=payload)
                self.assertEqual((status, body["error"]), (400, "bad_json"))

    def test_chunk_size_must_be_hex_digits(self) -> None:
        """[SV-C6, A4-04] chunk-size = 1*HEXDIG (RFC 9112): '0_e', ' 1 0' and '+e' are refused with 400."""
        body = b'{"chatId":"c"}'
        for size in (b"0_e", b"1 0", b"+e"):
            with self.subTest(size):
                req = (
                    b"POST /api/cancel HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n"
                    + size
                    + b"\r\n"
                    + body
                    + b"\r\n0\r\n\r\n"
                )
                self.assertIn(b" 400 ", raw_exchange(self.app.url, req).split(b"\r\n")[0])


if __name__ == "__main__":
    unittest.main()
