"""HTTP hardening after the A3 review: bounded chunked drain, escaped log lines, body-limit boundary, versions.

A3-06 (attack/test_http_bodies.py): a refused chunked body was read one whole chunk at a time (a "3c00000" chunk =
60 MiB per request). A3-11 (attack/test_log_injection.py): ESC sequences in the path reached the log verbatim.
A3-23 S10: no test pinned the exact limit (a doubled limit survived). DEC-056: every answer names its contract.
"""

import io
import json
import logging
import unittest

from agentic_ui_server.http.body import DRAIN_STEP, BodyTooLarge, read_chunked
from agentic_ui_server.log import LOGGER_NAME, printable, setup_logging
from agentic_ui_server.resources import computed_contract_version, contract_version, read_data_json
from agentic_ui_server.settings import LogSettings

from ..support.http_client import call, chunked_exchange, raw_exchange, stub_app
from ..support.node import REPO
from ..support.stub_session import example, reply


class CountingReader(io.BytesIO):
    """An rfile that records the largest single read."""

    largest = 0

    def read(self, size: int | None = -1) -> bytes:
        self.largest = max(self.largest, size if size is not None and size >= 0 else 0)
        return super().read(size)


class ChunkedDrainTest(unittest.TestCase):
    def test_a_huge_refused_chunk_is_skipped_in_small_reads(self) -> None:
        """[SV-C6] A3-06: one 8 MiB chunk over a 1 KiB limit: 413 (BodyTooLarge) and no read larger than
        DRAIN_STEP (before: rfile.read(8 MiB), 60 MiB for a "3c00000" chunk, 356 MiB for 8 parallel requests)."""
        size = 8 * 1024 * 1024
        rfile = CountingReader(b"%x\r\n" % size + b"x" * size + b"\r\n0\r\n\r\n")
        with self.assertRaises(BodyTooLarge):
            read_chunked(rfile, 1024, 64 * 1024 * 1024)
        self.assertLessEqual(rfile.largest, DRAIN_STEP)

    def test_chunks_within_the_limit_are_decoded(self) -> None:
        """[SV-C6] A3-06: the decode path is unchanged below the limit."""
        self.assertEqual(read_chunked(io.BytesIO(b"3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n"), 5, 100), b"abcde")


class BodyLimitBoundaryTest(unittest.TestCase):
    def test_exactly_the_limit_passes_one_more_byte_is_413(self) -> None:
        """[SV-C6] A3-23 S10: a body of exactly server.max_body_bytes is served, one byte more is 413, with a
        Content-Length and chunked (a doubled limit passed every earlier test)."""
        app, _ = stub_app(self, {"b": [reply(example())] * 2}, server__max_body_bytes="300")
        prefix = json.dumps({"chatId": "b", "text": ""}).encode()
        exact = json.dumps({"chatId": "b", "text": "x" * (300 - len(prefix))}).encode()
        over = json.dumps({"chatId": "b", "text": "x" * (301 - len(prefix))}).encode()
        self.assertEqual((len(exact), len(over)), (300, 301))
        self.assertEqual(call(app.url, "/prompt", raw=exact)[0], 200)
        self.assertEqual(call(app.url, "/prompt", raw=over)[0], 413)
        self.assertEqual(chunked_exchange(app.url, "/prompt", [exact[:150], exact[150:]])[0][0], 200)
        self.assertEqual(chunked_exchange(app.url, "/prompt", [over[:150], over[150:]])[0][0], 413)


class LogInjectionTest(unittest.TestCase):
    def test_control_bytes_in_the_path_are_escaped_in_the_log(self) -> None:
        """[SV-C16] A3-11: an unauthenticated GET whose path holds ESC/backspace sequences (erase line, fake
        colour level) is logged escaped (\\x1b), never raw; Cyrillic stays readable."""
        stream = io.StringIO()
        setup_logging(LogSettings(level="INFO"), stream)
        self.addCleanup(logging.getLogger(LOGGER_NAME).handlers.clear)
        app, _ = stub_app(self, {}, log__level="INFO")
        setup_logging(LogSettings(level="INFO"), stream)
        evil = b"/api/\x1b[2K\x1b[1A\x1b[32mINFO\x1b[0m\x08\x08all-good"
        raw_exchange(app.url, b"GET " + evil + b" HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
        log = stream.getvalue()
        self.assertNotIn("\x1b", log)
        self.assertNotIn("\x08", log)
        self.assertIn("\\x1b[2K", log)
        self.assertEqual(printable("Привет \x00"), "Привет\\u2028\\x00")


class ContractVersionTest(unittest.TestCase):
    def test_every_answer_carries_the_contract_version(self) -> None:
        """[SV-C23, SV-C6] DEC-056: /health, /prompt, /action, /cancel, /progress, /models, /model and errors
        (API 404 and the server's own 413) carry contractVersion = the generated constant."""
        app, _ = stub_app(self, {"v": [reply(example()), reply(example())]}, server__max_body_bytes="2000")
        answers = [
            call(app.url, "/health"),
            call(app.url, "/prompt", {"chatId": "v", "text": "x"}),
            call(app.url, "/action", {"chatId": "v", "surfaceId": "s", "event": {"name": "go"}}),
            call(app.url, "/cancel", {"chatId": "v"}),
            call(app.url, "/progress?chatId=v"),
            call(app.url, "/models"),
            call(app.url, "/model", {"chatId": "v", "model": ""}),
            call(app.url, "/nope"),
            call(app.url, "/prompt", raw=b"x" * 3000),
        ]
        self.assertEqual([body.get("contractVersion") for _, body, _ in answers], [contract_version()] * 9)
        self.assertEqual({status for status, _, _ in answers[-2:]}, {404, 413})

    def test_the_constant_is_the_catalogs_and_the_handovers_version(self) -> None:
        """[SV-C23] DEC-056: the generated constant equals the bundled catalog.json's hash and the hand-over
        manifest's contractVersion (sync_data.mjs writes it; check:generated keeps it fresh)."""
        manifest = json.loads((REPO / "handover" / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(contract_version(), computed_contract_version())
        self.assertEqual(contract_version(), manifest["contractVersion"])
        self.assertTrue(contract_version().startswith(read_data_json("catalog.json")["catalogId"] + " sha256:"))


if __name__ == "__main__":
    unittest.main()
