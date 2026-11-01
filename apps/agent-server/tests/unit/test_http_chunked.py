"""``Transfer-Encoding: chunked`` request bodies (A2-M3): decoded by the stdlib server under the same size limit."""

import json
import unittest

from ..support.http_client import chunked_exchange, raw_exchange, stub_app
from ..support.stub_session import again, reply

BODY = json.dumps({"chatId": "c1", "text": "Имя,Сумма\nАнна,1"}, ensure_ascii=False).encode()


def split(data: bytes, size: int) -> list[bytes]:
    return [data[i : i + size] for i in range(0, len(data), size)]


class HttpChunkedTest(unittest.TestCase):
    def test_a_chunked_prompt_is_decoded(self) -> None:
        """[SV-C6, P6-http] http.client sends the /prompt body chunked (7-byte chunks, Cyrillic split across
        chunks): the turn gets the whole text, twice on one keep-alive connection (before: the body read as empty,
        400 bad_json)."""
        app, sessions = stub_app(self, {"c1": [reply(again()), reply(again())]})
        answers = chunked_exchange(app.url, "/prompt", split(BODY, 7), repeat=2)
        self.assertEqual([(status, body["status"]) for status, body in answers], [(200, "ok"), (200, "ok")])
        self.assertEqual(sessions["c1"].prompts[0].count("Анна,1"), 1)
        self.assertEqual(len(sessions["c1"].prompts), 2)

    def test_a_chunked_body_over_the_limit_is_413(self) -> None:
        """[SV-C6, P6-http] the decoded size counts against server.max_body_bytes: 413 too_large, the client
        reads the answer."""
        app, sessions = stub_app(self, {}, server__max_body_bytes="200")
        body = json.dumps({"chatId": "c", "text": "x" * 500}).encode()
        [(status, answer)] = chunked_exchange(app.url, "/prompt", split(body, 64))
        self.assertEqual((status, answer["error"]), (413, "too_large"))
        self.assertIn("max_body_bytes=200", answer["message"])
        self.assertEqual(sessions, {})

    def test_bad_framing_and_other_codings_are_400(self) -> None:
        """[SV-C6] a non-hex chunk size, chunk data longer than its size, a gzip coding → 400 with the JSON error."""
        app, _ = stub_app(self, {})
        head = b"POST /api/prompt HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n"
        cases = {
            "bad size": head + b"Transfer-Encoding: chunked\r\n\r\nzz\r\n{}\r\n0\r\n\r\n",
            "data past its size": head + b"Transfer-Encoding: chunked\r\n\r\n1\r\n{}\r\n0\r\n\r\n",
            "gzip": head + b"Transfer-Encoding: gzip, chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n",
        }
        for name, request in cases.items():
            with self.subTest(name):
                status_line, _, rest = raw_exchange(app.url, request).partition(b"\r\n")
                self.assertIn(b" 400 ", status_line)
                self.assertIn(b'"bad_request"', rest)


if __name__ == "__main__":
    unittest.main()
