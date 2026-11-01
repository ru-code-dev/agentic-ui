"""ndjson JSON-RPC 2.0 over asyncio streams (PLAN §3.1.3, RESEARCH §B.5 quirks).

One JSON object per line. Outbound requests get integer ids from 1. Inbound messages:
- ``session/update`` is always a notification, whatever its ``id`` (ru-code's fake sends ``"id": ""``);
- another message with ``method`` and a non-null ``id`` is a request: it is always answered (``-32601`` when
  unknown, ``-32603`` when the handler fails), so the agent never waits on us;
- a message without ``method`` resolves the pending request with that ``id``;
- non-JSON lines (boot noise) are skipped and logged.
EOF (or a dead pipe) fails every pending request with ``ConnectionClosed``.
"""

import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any

from ..log import get_logger
from ..wire import json_utf8
from .protocol import SESSION_UPDATE, ErrorCode

RequestHandler = Callable[[str, Any], Awaitable[Any]]
NotificationHandler = Callable[[str, Any], None]
WireLogger = Callable[[str, str], None]

_log = get_logger("acp.jsonrpc")


class RpcError(Exception):
    """A JSON-RPC error: received from the agent, or raised by a handler to answer with this code."""

    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(f"{code}: {message}")
        self.code, self.message, self.data = code, message, data


class RpcTimeout(TimeoutError):
    """No response within the request timeout."""


class ConnectionClosed(ConnectionError):
    """The stream ended (agent exited or closed stdout) before a response arrived."""


class JsonRpcConnection:
    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: Any,
        *,
        on_request: RequestHandler | None = None,
        on_notification: NotificationHandler | None = None,
        wire_logger: WireLogger | None = None,
    ) -> None:
        self._reader, self._writer = reader, writer
        self._on_request, self._on_notification = on_request, on_notification
        self._wire = wire_logger
        self._next_id = 1
        self._pending: dict[int, asyncio.Future] = {}
        self._write_lock = asyncio.Lock()
        self._inbound: set[asyncio.Task] = set()
        self._closed = asyncio.Event()

    @property
    def closed(self) -> bool:
        return self._closed.is_set()

    async def wait_closed(self) -> None:
        await self._closed.wait()

    async def request(self, method: str, params: Any = None, timeout: float | None = None) -> Any:
        if self.closed:
            raise ConnectionClosed(f"connection closed before {method}")
        request_id = self._next_id
        self._next_id += 1
        future = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        try:
            await self._send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
            return await asyncio.wait_for(asyncio.shield(future), timeout)
        except TimeoutError as exc:
            _log.warning("%s (id %s): no response within %ss", method, request_id, timeout)
            raise RpcTimeout(f"{method}: no response within {timeout}s") from exc
        except RpcError as exc:
            _log.warning("agent answered %s (id %s) with error %s: %s", method, request_id, exc.code, exc.message)
            raise
        finally:
            self._pending.pop(request_id, None)
            if not future.done():
                future.cancel()

    async def notify(self, method: str, params: Any = None) -> None:
        if self.closed:
            raise ConnectionClosed(f"connection closed before {method}")
        await self._send({"jsonrpc": "2.0", "method": method, "params": params})

    async def run(self) -> None:
        """Read until EOF, dispatching every message; then fail pending requests."""
        try:
            while True:
                try:
                    line = await self._reader.readline()
                except ValueError as exc:  # line longer than the reader limit: skip it, keep the stream
                    _log.warning("skipped an over-limit line: %s", exc)
                    continue
                except (ConnectionError, OSError) as exc:
                    _log.warning("agent stdout read failed, closing the connection: %s", exc)
                    break
                if not line:
                    break
                self._dispatch_line(line)
        finally:
            self._shutdown()

    async def close(self) -> None:
        """Stop the connection: close the writer and fail pending requests."""
        try:
            self._writer.close()
        except (ConnectionError, OSError, RuntimeError) as exc:
            _log.debug("closing the agent stdin failed (already closed): %s", exc)
        self._shutdown()
        for task in list(self._inbound):
            task.cancel()

    def _shutdown(self) -> None:
        if self._closed.is_set():
            return
        self._closed.set()
        for future in self._pending.values():
            if not future.done():
                future.set_exception(ConnectionClosed("agent connection closed"))
        self._pending.clear()

    def _dispatch_line(self, raw: bytes) -> None:
        text = raw.decode("utf-8", errors="replace").strip()
        if not text:
            return
        if self._wire:
            self._wire("<-", text)
        try:
            message = json.loads(text)
        except json.JSONDecodeError:
            _log.info("skipped non-JSON line from agent: %.200s", text)
            return
        if not isinstance(message, dict):
            _log.info("skipped non-object JSON from agent: %.200s", text)
            return
        method = message.get("method")
        if isinstance(method, str):
            if method != SESSION_UPDATE and message.get("id") is not None:
                task = asyncio.get_running_loop().create_task(
                    self._answer(message["id"], method, message.get("params"))
                )
                self._inbound.add(task)
                task.add_done_callback(self._inbound.discard)
            else:
                self._notification(method, message.get("params"))
            return
        self._response(message)

    def _notification(self, method: str, params: Any) -> None:
        if self._on_notification is None:
            return
        try:
            self._on_notification(method, params)
        except Exception:  # noqa: BLE001 - one bad update must not stop the read loop; logged
            _log.exception("notification handler failed for %s", method)

    def _response(self, message: dict) -> None:
        future = self._pending.get(message.get("id")) if isinstance(message.get("id"), int) else None
        if future is None or future.done():
            _log.warning("dropped a response with unknown id %r (late or never requested)", message.get("id"))
            return
        error = message.get("error")
        if isinstance(error, dict):
            code = error.get("code")
            future.set_exception(
                RpcError(
                    code if isinstance(code, int) else ErrorCode.INTERNAL_ERROR,
                    str(error.get("message", "")),
                    error.get("data"),
                )
            )
        else:
            future.set_result(message.get("result"))

    async def _answer(self, request_id: Any, method: str, params: Any) -> None:
        reply: dict[str, Any] = {"jsonrpc": "2.0", "id": request_id}
        try:
            if self._on_request is None:
                raise RpcError(ErrorCode.METHOD_NOT_FOUND, f"method not found: {method}")
            reply["result"] = await self._on_request(method, params)
        except RpcError as exc:
            reply["error"] = {"code": exc.code, "message": exc.message}
            if exc.data is not None:
                reply["error"]["data"] = exc.data
        except Exception as exc:  # noqa: BLE001 - every inbound request gets an answer (-32603); logged
            _log.exception("request handler failed for %s", method)
            reply["error"] = {"code": ErrorCode.INTERNAL_ERROR, "message": f"internal error: {exc}"}
        try:
            await self._send(reply)
        except ConnectionClosed:
            _log.warning("could not answer agent request %s: connection closed", method)

    async def _send(self, message: dict) -> None:
        data = json_utf8(message, compact=True)
        async with self._write_lock:
            if self._wire:
                self._wire("->", data.decode("utf-8"))
            try:
                self._writer.write(data + b"\n")
                await self._writer.drain()
            except (ConnectionError, OSError, RuntimeError) as exc:
                self._shutdown()
                raise ConnectionClosed(f"write failed: {exc}") from exc
