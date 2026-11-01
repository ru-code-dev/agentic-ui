"""HTTP helpers for the API tests: a proxy-free JSON client and an ``App`` over stub sessions (tier 1)."""

import http.client
import json
import socket
import unittest
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urlsplit

from agentic_ui_server.agent.manager import SessionManager
from agentic_ui_server.config import load_settings
from agentic_ui_server.conversation.service import ChatService
from agentic_ui_server.resources import AgentFiles
from agentic_ui_server.serve import App
from agentic_ui_server.settings import Settings

from .stub_session import StubSession

_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def call(
    url: str, path: str, body: Any = None, *, method: str | None = None, raw: bytes | None = None, headers=None
) -> tuple[int, Any, dict[str, str]]:
    """``(status, JSON body or None, headers)``; HTTP errors are returned, not raised."""
    data = raw if raw is not None else None if body is None else json.dumps(body, ensure_ascii=False).encode()
    request = urllib.request.Request(url + path, data=data, method=method or ("POST" if data is not None else "GET"))
    request.add_header("Content-Type", "application/json")
    for name, value in (headers or {}).items():
        request.add_header(name, value)
    try:
        with _OPENER.open(request, timeout=60) as response:
            status, payload, head = response.status, response.read(), dict(response.headers)
    except urllib.error.HTTPError as exc:
        status, payload, head = exc.code, exc.read(), dict(exc.headers)
    return status, json.loads(payload) if payload else None, head


def raw_exchange(url: str, data: bytes, timeout: float = 5) -> bytes:
    """Send raw bytes to the server of ``url`` and read until it closes (framing tests: bad lines, short bodies)."""
    split = urlsplit(url)
    with socket.create_connection((split.hostname, split.port), timeout=timeout) as sock:
        sock.sendall(data)
        chunks = []
        while chunk := sock.recv(65536):
            chunks.append(chunk)
    return b"".join(chunks)


def raw_first_line(url: str, data: bytes, timeout: float = 10) -> bytes:
    """Send raw bytes and return the response's status line (a reset while sending or reading is returned as its
    repr: the 413-drain test tells a drained 413 from a dropped connection, A4b-M5)."""
    split = urlsplit(url)
    with socket.create_connection((split.hostname, split.port), timeout=timeout) as sock:
        try:
            sock.sendall(data)
            return sock.recv(65536).split(b"\r\n", 1)[0]
        except (ConnectionResetError, BrokenPipeError) as exc:
            return repr(exc).encode()


def plain_request(url: str, method: str, path: str) -> tuple[int, str, bytes]:
    """``(status, Content-Type, body)`` for any method (urllib refuses HEAD bodies and odd methods)."""
    split = urlsplit(url)
    conn = http.client.HTTPConnection(split.hostname, split.port, timeout=10)
    try:
        conn.request(method, split.path + path)
        response = conn.getresponse()
        return response.status, response.getheader("Content-Type", ""), response.read()
    finally:
        conn.close()


def chunked_exchange(url: str, path: str, chunks: list[bytes], repeat: int = 1) -> list[tuple[int, Any]]:
    """``repeat`` POSTs on ONE keep-alive connection, each body sent by ``http.client`` as
    ``Transfer-Encoding: chunked`` (one chunk per item); ``[(status, JSON body)]``."""
    split = urlsplit(url)
    conn = http.client.HTTPConnection(split.hostname, split.port, timeout=10)
    out = []
    try:
        for _ in range(repeat):
            headers = {"Content-Type": "application/json"}
            conn.request("POST", split.path + path, body=iter(chunks), headers=headers, encode_chunked=True)
            response = conn.getresponse()
            payload = response.read()
            out.append((response.status, json.loads(payload) if payload else None))
    finally:
        conn.close()
    return out


def stub_settings(**sets: str) -> Settings:
    values = {"server.port": "0", "log.level": "WARNING", **{k.replace("__", "."): v for k, v in sets.items()}}
    argv = [a for k, v in values.items() for a in ("--set", f"{k}={v}")]
    return load_settings(argv, {"HOME": "/home/t", "XDG_STATE_HOME": "/nonexistent/state"})


def stub_app(test: unittest.TestCase, steps: dict[str, list], **sets: str) -> tuple[App, dict[str, StubSession]]:
    """A served ``App`` whose chats run scripted ``StubSession`` steps (``--set`` overrides as ``a__b=v``)."""
    sessions: dict[str, StubSession] = {}

    def factory(chat_id: str) -> StubSession:
        sessions[chat_id] = StubSession(chat_id, steps.get(chat_id, []))
        return sessions[chat_id]

    def service(settings: Settings) -> ChatService:
        return ChatService(settings, SessionManager(settings, files=AgentFiles(), session_factory=factory))

    app = App(stub_settings(**sets), service).start()
    test.addCleanup(app.close)
    return app, sessions
