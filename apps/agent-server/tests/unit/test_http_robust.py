"""HTTP framing a client can get wrong: stalled bodies, idle connections, unserved methods (SV-C6, SV-C16)."""

import time
import unittest
from unittest import mock

from agentic_ui_server.http.server import ApiHandler

from ..support.http_client import plain_request, raw_exchange, stub_app

STALLED = b'POST /api/cancel HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\n{"chatId":'


class HttpRobustTest(unittest.TestCase):
    def test_a_stalled_body_times_out_and_is_logged(self) -> None:
        """[SV-C6, SV-C16] Content-Length 100 with 10 bytes sent: the server closes the connection after its I/O
        timeout and logs a warning (before: no timeout, the thread waited forever, nothing logged above DEBUG)."""
        self.assertGreater(ApiHandler.timeout or 0, 0)
        with mock.patch.object(ApiHandler, "timeout", 0.5):
            app, _ = stub_app(self, {})
            with self.assertLogs("agentic_ui_server.http", "WARNING") as logs:
                started = time.monotonic()
                self.assertEqual(raw_exchange(app.url, STALLED), b"", "the server closes the stalled connection")
                self.assertLess(time.monotonic() - started, 4)
        self.assertIn("timed out", "\n".join(logs.output))

    def test_other_methods_get_the_json_error_shape(self) -> None:
        """[SV-C6] HEAD/PATCH on a known path → 405 and a bad request line → 400, with the contract's JSON error
        (before: http.server's 501/400 text/html page)."""
        app, _ = stub_app(self, {})
        for method in ("HEAD", "PATCH"):
            with self.subTest(method):
                status, content_type, body = plain_request(app.url, method, "/health")
                self.assertEqual(status, 405)
                self.assertTrue(content_type.startswith("application/json"))
                self.assertIn(b'"method_not_allowed"', body) if method == "PATCH" else self.assertEqual(body, b"")
        head, _, body = raw_exchange(app.url, b"NOT A REQUEST LINE AT ALL\r\n\r\n").partition(b"\r\n\r\n")
        self.assertIn(b" 400 ", head.split(b"\r\n")[0])
        self.assertIn(b"application/json", head)
        self.assertIn(b'"bad_request"', body)


if __name__ == "__main__":
    unittest.main()
