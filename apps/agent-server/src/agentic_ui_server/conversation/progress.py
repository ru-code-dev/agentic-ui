"""Live turn progress per chat (SV-C20), for the optional progress endpoint (P6) and the Agent page.

A snapshot: ``state`` (``running`` | ``repairing`` | ``done`` | ``fallback`` | ``cancelled``; a request still waiting
for an agent slot is ``running`` with ``attempt`` 0), ``attempt`` n of
``maxAttempts`` (1 first reply + ``repair.max_attempts`` repairs), the problems of the last invalid reply
(``lastErrors``, ``errorCount``), ``elapsedMs`` since the request started and the final ``status`` when finished.
"""

import time
from dataclasses import dataclass, field
from typing import Any

FINAL = ("done", "fallback", "cancelled")


@dataclass
class Progress:
    chat_id: str
    max_attempts: int
    attempt: int = 0
    state: str = "running"
    last_errors: list[str] = field(default_factory=list)
    error_count: int = 0
    """The true number of problems of the last invalid reply (``last_errors`` is capped, A4-01)."""
    started: float = field(default_factory=time.monotonic)
    finished: float | None = None
    cancel_requested: bool = False

    def begin_attempt(self, attempt: int) -> None:
        self.attempt = attempt
        self.state = "running" if attempt == 1 else "repairing"

    def invalid(self, errors: list[str], total: int | None = None) -> None:
        self.last_errors, self.error_count = list(errors), len(errors) if total is None else total

    def finish(self, state: str) -> None:
        self.state, self.finished = state, time.monotonic()

    def snapshot(self, now: float | None = None) -> dict[str, Any]:
        end = self.finished if self.finished is not None else (time.monotonic() if now is None else now)
        return {
            "chatId": self.chat_id,
            "state": self.state,
            "attempt": self.attempt,
            "maxAttempts": self.max_attempts,
            "lastErrors": self.last_errors,
            "errorCount": self.error_count,
            "elapsedMs": int((end - self.started) * 1000),
        }


class ProgressBoard:
    """chat id → progress of the request that holds (or last held) the chat's turn: a queued or rejected (429)
    request never hides the running one, and a cancel marks the running one only."""

    def __init__(self) -> None:
        self._items: dict[str, Progress] = {}

    def publish(self, progress: Progress, *, unless_running: bool = False) -> None:
        """Make ``progress`` the chat's current request (when it gets the chat's turn; a request that never got it
        only replaces a finished one)."""
        current = self._items.get(progress.chat_id)
        if unless_running and current is not None and current.state not in FINAL:
            return
        self._items[progress.chat_id] = progress

    def get(self, chat_id: str) -> Progress | None:
        return self._items.get(chat_id)

    def request_cancel(self, chat_id: str) -> str | None:
        """Mark the chat's unfinished request: ``"queued"`` (still waiting for its turn), ``"running"`` or None."""
        progress = self._items.get(chat_id)
        if progress is None or progress.state in FINAL:
            return None
        progress.cancel_requested = True
        return "queued" if progress.attempt == 0 else "running"

    def forget(self, chat_id: str) -> None:
        self._items.pop(chat_id, None)

    def __len__(self) -> int:
        return len(self._items)
