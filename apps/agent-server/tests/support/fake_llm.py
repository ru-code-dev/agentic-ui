"""Stdlib OpenAI-compatible LLM mock for tier-3 tests (RESEARCH §D.2; wire as qwen-code fake-openai-server.ts).

``FakeLlm(replies)`` serves ``POST /v1/chat/completions`` (SSE ``chat.completion.chunk`` deltas + ``[DONE]``, or a
plain JSON completion when ``stream`` is false) and ``GET /v1/models`` on 127.0.0.1 in a background thread.
Replies are consumed in order (the last repeats): ``{"content": str, "chunks"?: int, "delay"?: s}`` or
``{"tool_calls": [{"name": str, "args": {...}}]}``. A delay streams SSE comments, so a client disconnect
(qwen cancelling) ends the handler early. Every request body is kept in ``requests``.
"""

import json
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

USAGE = {"prompt_tokens": 11, "completion_tokens": 3, "total_tokens": 14}


class FakeLlm:
    def __init__(self, replies: list[dict]) -> None:
        self.replies = list(replies)
        self.requests: list[dict] = []
        self.disconnects = 0
        self._index = 0
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), self._handler())
        self._server.daemon_threads = True
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self._server.server_address[1]}/v1"

    def start(self) -> "FakeLlm":
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        self._server.shutdown()
        self._server.server_close()

    def chat_requests(self) -> list[dict]:
        return [r for r in self.requests if r.get("_path", "").endswith("/chat/completions")]

    def _next_reply(self) -> dict:
        with self._lock:
            reply = self.replies[min(self._index, len(self.replies) - 1)]
            self._index += 1
            return reply

    def _handler(self):
        llm = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args) -> None:
                pass

            def do_GET(self) -> None:
                self._json({"object": "list", "data": [{"id": "model-a", "object": "model"}]})

            def do_POST(self) -> None:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                body["_path"] = self.path
                with llm._lock:
                    llm.requests.append(body)
                if not self.path.endswith("/chat/completions"):
                    self.send_response(404)
                    self.end_headers()
                    return
                reply = llm._next_reply()
                try:
                    if body.get("stream"):
                        self._stream(reply)
                    else:
                        self._json(_completion(reply))
                except (BrokenPipeError, ConnectionResetError):
                    llm.disconnects += 1

            def _json(self, payload: dict) -> None:
                data = json.dumps(payload).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _stream(self, reply: dict) -> None:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                deadline = time.monotonic() + reply.get("delay", 0)
                while time.monotonic() < deadline and not llm._stop.is_set():
                    self.wfile.write(b": waiting\n\n")
                    self.wfile.flush()
                    time.sleep(0.2)
                for chunk in _chunks(reply):
                    self.wfile.write(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode())
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()

        return Handler


def _chunk(cid: str, delta: dict, finish: str | None = None) -> dict:
    return {
        "id": cid,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "model-a",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }


def _chunks(reply: dict) -> list[dict]:
    cid = f"chatcmpl-{uuid.uuid4().hex}"
    if "tool_calls" in reply:
        out = [
            _chunk(
                cid,
                {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "index": i,
                            "id": f"call_{uuid.uuid4().hex[:8]}",
                            "type": "function",
                            "function": {
                                "name": call["name"],
                                "arguments": json.dumps(call["args"], ensure_ascii=False),
                            },
                        }
                    ],
                },
            )
            for i, call in enumerate(reply["tool_calls"])
        ]
        out.append(_chunk(cid, {}, "tool_calls"))
    else:
        text, parts = reply.get("content", ""), max(1, reply.get("chunks", 1))
        size = max(1, -(-len(text) // parts))
        pieces = [text[i : i + size] for i in range(0, len(text), size)] or [""]
        out = [_chunk(cid, {"role": "assistant", "content": piece}) for piece in pieces]
        out.append(_chunk(cid, {}, "stop"))
    out[-1]["usage"] = USAGE
    return out


def _completion(reply: dict) -> dict:
    message: dict = {"role": "assistant", "content": reply.get("content")}
    if "tool_calls" in reply:
        message["tool_calls"] = [
            {"id": f"call_{i}", "type": "function", "function": {"name": c["name"], "arguments": json.dumps(c["args"])}}
            for i, c in enumerate(reply["tool_calls"])
        ]
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "model-a",
        "usage": USAGE,
        "choices": [
            {"index": 0, "message": message, "finish_reason": "tool_calls" if "tool_calls" in reply else "stop"}
        ],
    }
