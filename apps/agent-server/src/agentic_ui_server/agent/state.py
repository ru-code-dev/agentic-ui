"""Session states and the per-chat working directory name (PLAN §3.1.9)."""

import hashlib
from enum import StrEnum


class SessionState(StrEnum):
    IDLE = "idle"
    STARTING = "starting"
    READY = "ready"
    BUSY = "busy"
    DEAD = "dead"


def chat_dir_name(chat_id: str) -> str:
    return hashlib.sha256(chat_id.encode("utf-8")).hexdigest()[:24]
