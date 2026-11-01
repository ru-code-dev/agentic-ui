"""qwen's protocol answers for ``scripted_agent.py``: permission options, handshake defaults and session ids.

Session ids as qwen keeps them (A2-M5, SV-C11): per project cwd, per process.

``store`` writes every id a ``session/new`` answers, with its cwd, to a JSON-lines file shared by all processes of
one script; ``refusal`` gives qwen's errors: ``session/load`` (unless scripted with an error) of an id never created
for that cwd → -32002, and once the process has a session, a request naming another ``sessionId`` → -32602.
"""

import json
import threading
from pathlib import Path

QWEN_OPTIONS = [
    {"optionId": "proceed_always_project", "name": "Always allow in this project", "kind": "allow_always"},
    {"optionId": "proceed_always_user", "name": "Always allow for this user", "kind": "allow_always"},
    {"optionId": "proceed_once", "name": "Allow once", "kind": "allow_once"},
    {"optionId": "cancel", "name": "Reject", "kind": "reject_once"},
]


def defaults(session_id: str) -> dict:
    """Answers of the handshake methods; ``session/new`` names ``session_id``."""
    return {
        "initialize": {
            "result": {
                "protocolVersion": 1,
                "agentInfo": {"name": "scripted-agent", "version": "0"},
                "authMethods": [{"id": "openai", "name": "Use OpenAI API key"}],
                "agentCapabilities": {"loadSession": True},
            }
        },
        "authenticate": {"result": {}},
        "session/new": {
            "result": {
                "sessionId": session_id,
                "modes": {
                    "currentModeId": "default",
                    "availableModes": [{"id": "default", "name": "Default"}, {"id": "plan", "name": "Plan"}],
                },
            }
        },
        "session/load": {"result": {}},
        "session/set_mode": {"result": {}},
        "session/set_config_option": {"result": {"configOptions": []}},
    }


class SessionBook:
    def __init__(self, path: Path) -> None:
        self.path, self.mine, self._lock = path, set(), threading.Lock()

    def store(self, session_id: str, cwd: str) -> None:
        self.mine.add(session_id)
        with self._lock, open(self.path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps({"sessionId": session_id, "cwd": cwd}) + "\n")

    def stored(self, session_id: str, cwd: str) -> bool:
        lines = self.path.read_text(encoding="utf-8").splitlines() if self.path.exists() else []
        return {"sessionId": session_id, "cwd": cwd} in [json.loads(line) for line in lines]

    def refusal(self, method: str, params: dict, behaviour: dict | None) -> list | None:
        sid, cwd = params.get("sessionId"), params.get("cwd", "")
        if method == "session/load" and "error" not in (behaviour or {}):
            if not self.stored(sid, cwd):
                return [-32002, f"Resource not found: session {sid} in {cwd}"]
            self.mine.add(sid)
            return None
        if method != "session/new" and isinstance(sid, str) and self.mine and sid not in self.mine:
            return [-32602, f"unknown session {sid}"]
        return None
