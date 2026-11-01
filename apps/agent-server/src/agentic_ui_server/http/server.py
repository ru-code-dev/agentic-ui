"""``ThreadingHTTPServer`` front of ``Api`` (PLAN §4 P6, SV-C6, SV-C12, SV-C16).

One thread per request; JSON in, JSON out, no streaming. Bodies above ``server.max_body_bytes`` → 413 without
keeping them; a ``Transfer-Encoding: chunked`` body is decoded under the same limit (``body.py``), any other
transfer coding is a 400. CORS: an ``Origin`` listed in ``server.cors_origins`` (or ``*`` listed) is echoed back
and ``OPTIONS`` preflights are answered with 204; with no origins configured no CORS header is sent (same-origin).
Every request is logged once (method, path, status, outcome, chat id, duration); errors at WARNING, 5xx at ERROR.
Request and response bodies are never logged (pasted data may hold secrets); the logger redacts known secrets.
"""

import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlsplit

from .. import __version__
from ..log import get_logger, printable
from ..resources import contract_version
from ..settings import ServerSettings
from ..wire import json_utf8
from .api import Api, Response
from .body import BadBody, BodyTooLarge, drain, read_chunked, transfer_codings

_log = get_logger("http")
ALLOW_METHODS = "GET, POST, OPTIONS"
ALLOW_HEADERS = "Content-Type"
DRAIN_MAX = 64 * 1024 * 1024
IO_TIMEOUT_S = 60.0
"""Per socket read/write: a client that stalls mid-request (short body, idle keep-alive) frees its thread."""


class ApiServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, api: Api, settings: ServerSettings) -> None:
        self.api, self.settings = api, settings
        super().__init__((settings.host, settings.port), ApiHandler)

    @property
    def port(self) -> int:
        return self.server_address[1]

    def handle_error(self, request: Any, client_address: Any) -> None:
        """An error outside ``Api.handle`` (socket, framing): logged and redacted, not printed raw to stderr."""
        _log.exception("HTTP connection from %s failed", client_address[0] if client_address else "?")


class ApiHandler(BaseHTTPRequestHandler):
    server: ApiServer
    protocol_version = "HTTP/1.1"
    timeout = IO_TIMEOUT_S
    server_version = f"agentic-ui-server/{__version__}"

    def do_GET(self) -> None:
        self._dispatch(b"")

    def do_POST(self) -> None:
        codings = transfer_codings(self.headers.get_all("Transfer-Encoding"))
        if codings:
            self._post_chunked(codings)
            return
        length = self.headers.get("Content-Length")
        try:
            size = int(length or 0)
        except ValueError:
            size = -1
        limit = self.server.settings.max_body_bytes
        if size < 0:
            self.close_connection = True
            self._send(Response(400, {"error": "bad_request", "message": "bad Content-Length"}, None, "bad_request"))
            return
        if size > limit:
            self.close_connection = True
            drain(self.rfile, min(size, DRAIN_MAX))
            message = f"body of {size} bytes exceeds server.max_body_bytes={limit}"
            self._send(Response(413, {"error": "too_large", "message": message}, None, "too_large"))
            return
        self._dispatch(self.rfile.read(size))

    def _post_chunked(self, codings: list[str]) -> None:
        """Transfer-Encoding wins over a Content-Length (RFC 9112 §6.3); such a connection is not reused."""
        limit = self.server.settings.max_body_bytes
        if "Content-Length" in self.headers:
            self.close_connection = True
        try:
            if codings != ["chunked"]:
                raise BadBody(f"unsupported Transfer-Encoding: {', '.join(codings)} (only chunked)")
            body = read_chunked(self.rfile, limit, DRAIN_MAX)
        except BadBody as exc:
            self.close_connection = True
            self._send(Response(400, {"error": "bad_request", "message": str(exc)}, None, "bad_request"))
            return
        except BodyTooLarge as exc:
            self.close_connection = True
            message = f"chunked body of {exc.size} bytes or more exceeds server.max_body_bytes={limit}"
            self._send(Response(413, {"error": "too_large", "message": message}, None, "too_large"))
            return
        self._dispatch(body)

    def do_PUT(self) -> None:
        self._dispatch(b"")

    def do_DELETE(self) -> None:
        self._dispatch(b"")

    def do_HEAD(self) -> None:  # known path → 405 JSON, like every method the API does not serve
        self._dispatch(b"")

    def do_PATCH(self) -> None:
        self._dispatch(b"")

    def send_error(self, code: int, message: str | None = None, explain: str | None = None) -> None:
        """http.server's own refusals (bad request line, unknown method, oversized headers) in the contract's
        JSON error shape instead of its HTML page; an unknown method is a 405 like any unserved method."""
        self.close_connection = True
        status, error = (405, "method_not_allowed") if code == 501 else (code, "bad_request")
        self._send(Response(status, {"error": error, "message": message or explain or "bad request"}, None, error))

    def do_OPTIONS(self) -> None:
        self._send(Response(204, None, None, "preflight"))

    def _dispatch(self, body: bytes) -> None:
        self._send(self.server.api.handle(self.command, self.path, body))

    def _send(self, response: Response) -> None:
        started = getattr(self, "_started", time.monotonic())
        if response.body is not None and "contractVersion" not in response.body:  # DEC-056: server-level errors too
            response.body = {**response.body, "contractVersion": contract_version()}
        data = b"" if response.body is None else json_utf8(response.body)
        self._log(response, started)  # before the reply: a client that has the response also has the log line
        self.send_response(response.status)
        if data:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for name, value in self._cors().items():
            self.send_header(name, value)
        self.end_headers()
        if data and getattr(self, "command", None) != "HEAD":
            self.wfile.write(data)

    def _cors(self) -> dict[str, str]:
        headers = getattr(self, "headers", None)  # unset when the request line itself was refused
        origin, allowed = headers.get("Origin") if headers else None, self.server.settings.cors_origins
        if not origin or not (origin in allowed or "*" in allowed):
            return {}
        headers = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
        if getattr(self, "command", None) == "OPTIONS":
            headers |= {"Access-Control-Allow-Methods": ALLOW_METHODS, "Access-Control-Allow-Headers": ALLOW_HEADERS}
            headers["Access-Control-Max-Age"] = "600"
        return headers

    def parse_request(self) -> bool:
        self._started = time.monotonic()
        return super().parse_request()

    def _log(self, response: Response, started: float) -> None:
        ms = int((time.monotonic() - started) * 1000)
        path = printable(urlsplit(getattr(self, "path", "") or "").path or "-")  # A3-11: no control bytes in the log
        level = 40 if response.status >= 500 else 30 if response.status >= 400 else 20
        detail = response.body.get("message") if response.status >= 400 and response.body else None
        detail = printable(detail) if isinstance(detail, str) else detail
        _log.log(
            level,
            "HTTP %s %s → %d %s chat=%s %dms%s",
            getattr(self, "command", None) or "-",
            path,
            response.status,
            response.outcome or "-",
            response.chat_id or "-",
            ms,
            f": {detail}" if detail else "",
        )

    def log_message(self, format: str, *args: Any) -> None:
        _log.debug("http.server: %s", printable(format % args))

    def log_error(self, format: str, *args: Any) -> None:
        """http.server's own errors (request timed out, bad request line): a warning, never DEBUG-only silence."""
        _log.warning("http.server: %s", printable(format % args))
