"""Deterministic stdlib ACP agent for tier-1 tests (the in-repo counterpart of ru-code's fake, PLAN §3.2).

Driven by the JSON file in ``SCRIPTED_AGENT_SCRIPT``:
  record        path: every received message (and replies to our agent→client requests) appended as JSON lines
  id_quirk      true: ``session/update`` carries ``"id": ""`` + ``"headers": []`` like ru-code's fake
  boot_garbage  text printed on stdout before anything else; boot_stderr: text printed on stderr
  methods       {method: behaviour} for handshake methods: {"result": …} | {"error": [code, msg]} | {"hang": true}
                | {"exit": code, "stderr": text} | {"delay": s} | {"replay": [texts]} (session/load)
  prompts       list of step lists, one per prompt (the last repeats). Steps: {"chunk": t} {"thought": t}
                {"usage": {…}} {"update": {…}} {"tool_call": {…}} {"permission": {"options"?, "toolCall"}}
                {"client_request": method} {"sleep": s} {"garbage": t} {"stderr": t} {"exit": code}
                {"hang": true} {"stop": reason} {"error": [code, msg]}
  on_cancel     "cancelled" (default) | "error" (prompt fails -32603, qwen's abort race) | "ignore"
  runs          list of partial scripts merged over the base per spawn (1st process → runs[0], …; last repeats),
                counted in ``<record>.runs``; lets restart tests make the next process behave differently

Sessions behave like qwen's (A2-M5, SV-C11): ``session/new`` answers an id unique to the process
(``scripted-<pid>-<hex>``); ``scripted_protocol.py`` refuses a resume or a request with another chat's id.
"""

import importlib.util
import json
import os
import sys
import threading
import time
from pathlib import Path


def _sibling(name: str):
    """Load ``<name>.py`` next to this file (``python -I`` puts no script directory on sys.path)."""
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCRIPT_PATH = Path(os.environ["SCRIPTED_AGENT_SCRIPT"])
SCRIPT = json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))
PROTOCOL = _sibling("scripted_protocol")
SESSION_ID = f"scripted-{os.getpid()}-{os.urandom(3).hex()}"
SESSIONS = PROTOCOL.SessionBook(Path(f"{SCRIPT_PATH}.sessions"))
QWEN_OPTIONS, DEFAULTS = PROTOCOL.QWEN_OPTIONS, PROTOCOL.defaults(SESSION_ID)


def _apply_run_overrides() -> None:
    runs = SCRIPT.get("runs")
    if not runs:
        return
    counter = SCRIPT["record"] + ".runs"
    index = int(Path(counter).read_text()) if os.path.exists(counter) else 0
    with open(counter, "w") as handle:
        handle.write(str(index + 1))
    SCRIPT.update(runs[min(index, len(runs) - 1)])


_apply_run_overrides()
_out_lock, _rec_lock = threading.Lock(), threading.Lock()
_pending: dict[int, list] = {}
_next_id = [1000]
_cancel = threading.Event()
_prompt_index = [0]


def _write_line(text: str) -> None:
    with _out_lock:
        try:
            sys.stdout.write(text + "\n")
            sys.stdout.flush()
        except (BrokenPipeError, ValueError):
            os._exit(0)


def write(message: dict) -> None:
    _write_line(json.dumps(message, ensure_ascii=False))


def record(entry: dict) -> None:
    if SCRIPT.get("record"):
        with _rec_lock, open(SCRIPT["record"], "a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def reply(request_id, result=None, error=None) -> None:
    message = {"jsonrpc": "2.0", "id": request_id}
    if error is not None:
        message["error"] = {"code": error[0], "message": error[1]}
    else:
        message["result"] = result
    write(message)


def update(session_id: str, body: dict) -> None:
    message = {"jsonrpc": "2.0", "method": "session/update", "params": {"sessionId": session_id, "update": body}}
    if SCRIPT.get("id_quirk"):
        message.update({"id": "", "headers": []})
    write(message)


def ask(method: str, params: dict, timeout: float = 30.0):
    request_id = _next_id[0]
    _next_id[0] += 1
    slot = [threading.Event(), None]
    _pending[request_id] = slot
    write({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
    slot[0].wait(timeout)
    return slot[1]


def die(code: int, stderr: str = "") -> None:
    if stderr:
        sys.stderr.write(stderr + "\n")
    sys.stderr.flush()
    sys.stdout.flush()
    os._exit(code)


def run_prompt(request_id, params: dict) -> None:
    prompts = SCRIPT.get("prompts") or [[{"chunk": "ok"}]]
    steps = prompts[min(_prompt_index[0], len(prompts) - 1)]
    _prompt_index[0] += 1
    sid = params.get("sessionId", "")
    for step in steps:
        if _cancel.is_set() and not step.get("hang"):
            break
        kind, value = next(iter(step.items()))
        if kind == "chunk":
            update(sid, {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": value}})
        elif kind == "thought":
            update(sid, {"sessionUpdate": "agent_thought_chunk", "content": {"type": "text", "text": value}})
        elif kind == "usage":
            update(
                sid,
                {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {"type": "text", "text": ""},
                    "_meta": {"usage": value, "durationMs": 5},
                },
            )
        elif kind == "update":
            update(sid, value)
        elif kind == "tool_call":
            update(sid, {"sessionUpdate": "tool_call", **value})
        elif kind == "permission":
            answer = ask(
                "session/request_permission",
                {
                    "sessionId": sid,
                    "options": value.get("options", QWEN_OPTIONS),
                    "toolCall": value.get("toolCall", {}),
                },
            )
            record({"event": "permission_reply", "reply": answer})
        elif kind == "client_request":
            record({"event": "client_request_reply", "method": value, "reply": ask(value, {"sessionId": sid})})
        elif kind == "sleep":
            _cancel.wait(value)
        elif kind == "garbage":
            _write_line(value)
        elif kind == "stderr":
            sys.stderr.write(value + "\n")
            sys.stderr.flush()
        elif kind == "exit":
            die(value)
        elif kind == "hang":
            _cancel.wait()
            break
        elif kind == "stop":
            return reply(request_id, {"stopReason": value})
        elif kind == "error":
            return reply(request_id, error=value)
    if not _cancel.is_set():
        return reply(request_id, {"stopReason": "end_turn"})
    mode = SCRIPT.get("on_cancel", "cancelled")
    if mode == "error":
        reply(request_id, error=[-32603, "The operation was aborted"])
    elif mode == "cancelled":
        reply(request_id, {"stopReason": "cancelled"})
    return None


def handle_request(request_id, method: str, params: dict) -> None:
    behaviour = (SCRIPT.get("methods") or {}).get(method) or DEFAULTS.get(method)
    refused = SESSIONS.refusal(method, params, behaviour)
    if refused:
        return reply(request_id, error=refused)
    if method == "session/prompt":
        _cancel.clear()
        threading.Thread(target=run_prompt, args=(request_id, params), daemon=True).start()
        return None
    if behaviour is None:
        return reply(request_id, error=[-32601, f"Method not found: {method}"])
    if behaviour.get("hang"):
        return None
    if "exit" in behaviour:
        die(behaviour["exit"], behaviour.get("stderr", ""))
    time.sleep(behaviour.get("delay", 0))
    for text in behaviour.get("replay", []):
        update(
            params.get("sessionId", ""),
            {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": text}},
        )
    if "error" in behaviour:
        return reply(request_id, error=behaviour["error"])
    result = behaviour.get("result", DEFAULTS.get(method, {}).get("result", {}))
    if method == "session/new" and isinstance(result.get("sessionId"), str):
        SESSIONS.store(result["sessionId"], params.get("cwd", ""))
    reply(request_id, result)
    return None


def main() -> None:
    record({"event": "boot", "pid": os.getpid(), "sessionId": SESSION_ID})
    if SCRIPT.get("boot_stderr"):
        sys.stderr.write(SCRIPT["boot_stderr"] + "\n")
        sys.stderr.flush()
    if SCRIPT.get("boot_garbage"):
        _write_line(SCRIPT["boot_garbage"])
    for line in sys.stdin:
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        record(message)
        method = message.get("method")
        if method is None:
            slot = _pending.pop(message.get("id"), None)
            if slot is not None:
                slot[1] = message
                slot[0].set()
        elif "id" in message:
            handle_request(message["id"], method, message.get("params") or {})
        elif method == "session/cancel":
            _cancel.set()


if __name__ == "__main__":
    main()
