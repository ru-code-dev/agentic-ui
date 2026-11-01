"""acp/jsonrpc.py over an in-memory StreamReader and a recording writer (RESEARCH §B.5 quirks)."""

import asyncio
import json
import unittest

from agentic_ui_server.acp.jsonrpc import ConnectionClosed, JsonRpcConnection, RpcError, RpcTimeout


class FakeWriter:
    def __init__(self) -> None:
        self.lines: list[dict] = []
        self.raw = bytearray()
        self.closed = False
        self.sent = asyncio.Event()

    def write(self, data: bytes) -> None:
        self.raw.extend(data)
        for line in data.decode().splitlines():
            self.lines.append(json.loads(line))
        self.sent.set()

    async def drain(self) -> None:
        await asyncio.sleep(0)  # yield, so concurrent writers could interleave if unlocked

    def close(self) -> None:
        self.closed = True


class JsonRpcTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.reader = asyncio.StreamReader(limit=16 * 1024 * 1024)
        self.writer = FakeWriter()
        self.notifications: list[tuple[str, object]] = []
        self.conn = JsonRpcConnection(
            self.reader,
            self.writer,
            on_request=self.on_request,
            on_notification=lambda m, p: self.notifications.append((m, p)),
        )
        self.loop_task = asyncio.create_task(self.conn.run())

    async def asyncTearDown(self) -> None:
        self.reader.feed_eof()
        await asyncio.wait_for(self.loop_task, 2)

    async def on_request(self, method: str, params: object) -> object:
        if method == "echo":
            return {"echo": params}
        if method == "boom":
            raise ValueError("handler bug")
        if method == "typed":
            raise RpcError(-32602, "bad params", {"field": "x"})
        raise RpcError(-32601, f"method not found: {method}")

    def feed(self, message: dict | str) -> None:
        self.reader.feed_data(((message if isinstance(message, str) else json.dumps(message)) + "\n").encode())

    async def wait_lines(self, count: int) -> None:
        async with asyncio.timeout(2):
            while len(self.writer.lines) < count:  # noqa: ASYNC110 - polls a fake writer that has no event
                await asyncio.sleep(0.005)

    async def test_request_response_and_integer_ids_from_1(self) -> None:
        task = asyncio.create_task(self.conn.request("initialize", {"protocolVersion": 1}))
        await self.wait_lines(1)
        self.assertEqual(
            self.writer.lines[0], {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": 1}}
        )
        self.feed({"jsonrpc": "2.0", "id": 1, "result": {"ok": True}})
        self.assertEqual(await task, {"ok": True})

    async def test_out_of_order_responses(self) -> None:
        first = asyncio.create_task(self.conn.request("a"))
        second = asyncio.create_task(self.conn.request("b"))
        await self.wait_lines(2)
        self.feed({"jsonrpc": "2.0", "id": 2, "result": "B"})
        self.feed({"jsonrpc": "2.0", "id": 1, "result": "A"})
        self.assertEqual(await asyncio.gather(first, second), ["A", "B"])

    async def test_error_response_raises_rpc_error(self) -> None:
        task = asyncio.create_task(self.conn.request("x"))
        await self.wait_lines(1)
        self.feed({"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": "auth required", "data": {"a": 1}}})
        with self.assertRaises(RpcError) as ctx, self.assertLogs("agentic_ui_server.acp.jsonrpc", "WARNING") as logs:
            await task
        self.assertIn("agent answered x (id 1) with error -32000", logs.output[0])
        self.assertEqual(
            (ctx.exception.code, ctx.exception.message, ctx.exception.data), (-32000, "auth required", {"a": 1})
        )

    async def test_timeout(self) -> None:
        with self.assertRaises(RpcTimeout):
            await self.conn.request("slow", timeout=0.05)
        self.feed({"jsonrpc": "2.0", "id": 1, "result": "late"})  # a late response is dropped, not fatal
        await asyncio.sleep(0.01)
        self.assertFalse(self.conn.closed)

    async def test_eof_fails_pending(self) -> None:
        task = asyncio.create_task(self.conn.request("x"))
        await self.wait_lines(1)
        self.reader.feed_eof()
        with self.assertRaises(ConnectionClosed):
            await task
        with self.assertRaises(ConnectionClosed):
            await self.conn.request("after")

    async def test_non_json_line_skipped(self) -> None:
        task = asyncio.create_task(self.conn.request("x"))
        await self.wait_lines(1)
        self.feed("}{ not json")
        self.feed("[1, 2]")
        self.feed({"jsonrpc": "2.0", "id": 1, "result": 7})
        self.assertEqual(await task, 7)

    async def test_session_update_with_empty_id_is_a_notification(self) -> None:
        update = {
            "jsonrpc": "2.0",
            "method": "session/update",
            "id": "",
            "headers": [],
            "params": {"sessionId": "s", "update": {"sessionUpdate": "agent_message_chunk"}},
        }
        self.feed(update)
        self.feed({"jsonrpc": "2.0", "method": "session/update", "id": 5, "params": {"n": 2}})
        await asyncio.sleep(0.05)
        self.assertEqual([m for m, _ in self.notifications], ["session/update", "session/update"])
        self.assertEqual(self.writer.lines, [], "session/update is never answered")

    async def test_inbound_request_answered(self) -> None:
        self.feed({"jsonrpc": "2.0", "id": 0, "method": "echo", "params": {"v": "ü"}})
        await self.wait_lines(1)
        self.assertEqual(self.writer.lines[0], {"jsonrpc": "2.0", "id": 0, "result": {"echo": {"v": "ü"}}})
        self.assertIn("ü".encode(), bytes(self.writer.raw), "UTF-8 without ASCII escaping")

    async def test_unknown_inbound_request_gets_32601(self) -> None:
        self.feed({"jsonrpc": "2.0", "id": "r1", "method": "craft/drainMidTurnQueue", "params": {}})
        await self.wait_lines(1)
        self.assertEqual(self.writer.lines[0]["id"], "r1")
        self.assertEqual(self.writer.lines[0]["error"]["code"], -32601)

    async def test_handler_exception_gets_32603_and_typed_errors_keep_code(self) -> None:
        with self.assertLogs("agentic_ui_server.acp.jsonrpc", "ERROR") as logs:
            self.feed({"jsonrpc": "2.0", "id": 9, "method": "boom"})
            self.feed({"jsonrpc": "2.0", "id": 10, "method": "typed"})
            await self.wait_lines(2)
        self.assertIn("request handler failed for boom", logs.output[0])
        self.assertIn("ValueError: handler bug", logs.output[0], "traceback included")
        by_id = {line["id"]: line["error"] for line in self.writer.lines}
        self.assertEqual(by_id[9]["code"], -32603)
        self.assertEqual(by_id[10], {"code": -32602, "message": "bad params", "data": {"field": "x"}})

    async def test_large_line_accepted(self) -> None:
        big = "x" * (1024 * 1024 + 17)
        task = asyncio.create_task(self.conn.request("x"))
        await self.wait_lines(1)
        self.feed({"jsonrpc": "2.0", "id": 1, "result": big})
        self.assertEqual(len(await task), len(big))

    async def test_concurrent_writes_do_not_interleave(self) -> None:
        payload = "y" * 50_000
        await asyncio.gather(*(self.conn.notify("n", {"i": i, "p": payload}) for i in range(20)))
        lines = bytes(self.writer.raw).decode().split("\n")
        self.assertEqual(lines[-1], "")
        self.assertEqual(sorted(json.loads(line)["params"]["i"] for line in lines[:-1]), list(range(20)))

    async def test_response_with_method_is_not_matched(self) -> None:
        task = asyncio.create_task(self.conn.request("x"))
        await self.wait_lines(1)
        self.feed({"jsonrpc": "2.0", "id": 1, "method": "echo", "params": 1})  # an inbound request with id 1
        await self.wait_lines(2)
        self.assertFalse(task.done())
        self.feed({"jsonrpc": "2.0", "id": 1, "result": "mine"})
        self.assertEqual(await task, "mine")


if __name__ == "__main__":
    unittest.main()
