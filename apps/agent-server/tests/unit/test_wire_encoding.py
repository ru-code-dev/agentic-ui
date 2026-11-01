"""JSON on the wire (HTTP bodies, ACP lines): lone surrogates Python cannot encode (SV-C6, SV-C7), pipe errors.

A model may write ``"\\ud800"`` in a reply: JSON and JavaScript strings allow a lone surrogate, the validators accept
it, but ``str.encode("utf-8")`` raises. The server must still answer (escaped), never drop the connection.
"""

import asyncio
import json
import unittest

from agentic_ui_server.acp.jsonrpc import JsonRpcConnection
from agentic_ui_server.resources import read_data_json

from ..support.http_client import call, stub_app
from ..support.stub_session import reply

LONE = "\ud800"
CATALOG_ID = read_data_json("catalog.json")["catalogId"]
SURFACE = [
    {"version": "v0.9", "createSurface": {"surfaceId": "s", "catalogId": CATALOG_ID}},
    {
        "version": "v0.9",
        "updateComponents": {"surfaceId": "s", "components": [{"id": "root", "component": "Text", "text": LONE}]},
    },
]


class RawWriter:
    def __init__(self) -> None:
        self.raw = bytearray()

    def write(self, data: bytes) -> None:
        self.raw.extend(data)

    async def drain(self) -> None:
        await asyncio.sleep(0)

    def close(self) -> None:
        pass


class WireEncodingTest(unittest.IsolatedAsyncioTestCase):
    def test_http_answers_a_valid_reply_holding_a_lone_surrogate(self) -> None:
        """[SV-C6, SV-C7] the UI is returned (as a \\u escape): before, the server reset the connection unlogged."""
        app, _ = stub_app(self, {"u": [reply(SURFACE, text=f"prose {LONE}")]})
        status, body, _ = call(app.url, "/prompt", {"chatId": "u", "text": "x"})
        self.assertEqual((status, body["status"]), (200, "ok"))
        self.assertEqual(body["messages"][1]["updateComponents"]["components"][0]["text"], LONE)
        self.assertEqual(body["text"], f"prose {LONE}")

    async def test_acp_line_with_a_lone_surrogate_is_sent_escaped(self) -> None:
        """[SV-C6] a prompt/data model holding a lone surrogate reaches the agent (it was a 500 before)."""
        writer = RawWriter()
        conn = JsonRpcConnection(asyncio.StreamReader(), writer)
        await conn.notify("session/cancel", {"text": f"a{LONE}б"})
        line = bytes(writer.raw).decode("utf-8")
        self.assertEqual(json.loads(line)["params"]["text"], f"a{LONE}б")

    async def test_a_read_error_on_the_agent_pipe_is_logged(self) -> None:
        """[SV-C16] a broken agent stdout ends the connection with a warning (it ended silently), pending requests
        fail with ConnectionClosed."""
        reader = asyncio.StreamReader()
        conn = JsonRpcConnection(reader, RawWriter())
        reader.set_exception(ConnectionResetError("pipe reset"))
        with self.assertLogs("agentic_ui_server.acp.jsonrpc", "WARNING") as logs:
            await asyncio.wait_for(conn.run(), 2)
        self.assertIn("pipe reset", "\n".join(logs.output))
        self.assertTrue(conn.closed)


if __name__ == "__main__":
    unittest.main()
