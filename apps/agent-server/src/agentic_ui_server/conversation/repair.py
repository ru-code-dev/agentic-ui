"""Repair loop (SV-C8, SV-C9, SV-C14): turn → extract → validate → resend the exact problems → … → result | fallback.

One request = the first reply + at most ``repair.max_attempts`` repair turns in the same ACP session (the model sees
its own reply). A reply is checked by ``check.reply_problems`` against the chat's shown surfaces (SV-C28: no
``<a2ui-json>`` block — a question gets "Do not ask questions…" —, an unreadable block, or messages that make the
merged state invalid); its problems are sent back at once (CF-I4, capped: A4-01). Used up attempts, a turn timeout,
an agent crash or error → the fallback surface with the last errors.
A cancelled turn (or a cancel between turns) ends the request as ``cancelled``, never as a fallback.
SV-C27: ``ui_required=False`` (``reply.ui = "auto"`` on a ``/prompt``) accepts a text-only reply; a fallback keeps the
last reply's text, with the fallback surface or (``reply.fallback = "text"``) without any UI.
Everything is logged (SV-C16): every invalid reply with its error count and first problems, each repair, the outcome.
A reply is extracted once (A3-22) in a worker thread (``asyncio.to_thread``): the one agent loop serves every chat,
/health and /cancel, so the check of one reply only delays its own chat (A3-02).
"""

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

from ..acp.jsonrpc import RpcError
from ..acp.protocol import StopReason
from ..agent.errors import AgentCrashed, AgentStartError, TurnTimeout
from ..agent.turn import TurnResult
from ..log import get_logger
from ..validation import SurfaceState
from .check import MAX_REPLY_CHARS, ReplyCheck, reply_problems
from .fallback import fallback_payload
from .progress import Progress

_log = get_logger("conversation.repair")
__all__ = ["MAX_REPLY_CHARS", "Outcome", "ReplyCheck", "converse", "fallback_outcome", "reply_problems"]


class Turns(Protocol):
    async def run_turn(self, text: str, model: str | None = None) -> TurnResult: ...


@dataclass
class Outcome:
    status: str
    """``ok`` | ``fallback`` | ``cancelled``."""
    messages: list[Any] = field(default_factory=list)
    text: str = ""
    errors: list[str] = field(default_factory=list)
    attempts: int = 0
    reason: str | None = None
    """Why a fallback: ``invalid`` | ``timeout`` | ``crash`` | ``agent_error`` | ``start_failed``."""
    duration_ms: int = 0
    model: str | None = None
    """The model the turn ran (the session's applied model; None = the CLI default / unknown)."""
    state: SurfaceState | None = None
    """``ok``: the chat's surface state merged with this reply (SV-C28; never sent to the client)."""
    error_count: int = 0
    """The true number of problems of the last invalid reply (``errors`` is capped, A4-01)."""
    turn_id: str | None = None
    """``ok``: the id of this reply in the chat's state (DEC-064: a repair's ``repairOf`` names it)."""

    @property
    def fallback(self) -> bool:
        return self.status == "fallback"

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "messages": self.messages,
            "text": self.text,
            "fallback": self.fallback,
            "errors": self.errors,
            "attempts": self.attempts,
            "reason": self.reason,
            "durationMs": self.duration_ms,
            "model": self.model,
            "turnId": self.turn_id,
        }


def _listed(head: str, errors: list[str]) -> str:
    """``head`` + one ``\n  %s`` per shown error: the layout lives in the format string, the errors are arguments
    (escaped by the log filter, A4-02)."""
    return head + "\n  %s" * min(len(errors), 5)


def fallback_outcome(
    label: str,
    reason: str,
    errors: list[str],
    attempts: int,
    started: float,
    total: int | None = None,
    *,
    text: str = "",
    surface: bool = True,
) -> Outcome:
    """SV-C27: the agent's last ``text`` stays; ``surface`` (``reply.fallback``) adds the fixed fallback surface,
    else the JSON is dropped (``messages: []``)."""
    count = len(errors) if total is None else total
    _log.warning(
        _listed("[%s] fallback (%s) after %d attempt(s): %d error(s)", errors),
        label,
        reason,
        attempts,
        count,
        *errors[:5],
    )
    messages = fallback_payload() if surface else []
    outcome = Outcome("fallback", messages, text, errors, attempts, reason, _ms(started))
    outcome.error_count = count
    return outcome


async def converse(
    session: Turns,
    first: str,
    *,
    max_repairs: int,
    progress: Progress,
    label: str,
    model: str | None = None,
    state: SurfaceState | None = None,
    ui_required: bool = True,
    fallback_surface: bool = True,
) -> Outcome:
    """The repair loop of one request; every reply is checked against ``state`` (the chat's shown surfaces).

    ``ui_required=False`` (SV-C27): a text-only reply is a valid ``ok``. A fallback keeps the last reply's text and
    carries the fallback surface only when ``fallback_surface``."""
    started, prompt, errors, attempts, total = progress.started, first, [], 0, 0
    text = ""

    def failed(reason: str, problems: list[str], count: int | None = None) -> Outcome:
        return fallback_outcome(label, reason, problems, attempts, started, count, text=text, surface=fallback_surface)

    for attempt in range(1, max_repairs + 2):
        if progress.cancel_requested:
            return Outcome("cancelled", errors=errors, attempts=attempts, duration_ms=_ms(started))
        progress.begin_attempt(attempt)
        attempts = attempt
        try:
            result = await session.run_turn(prompt, model)
        except TurnTimeout as exc:
            return failed("timeout", [*errors, str(exc)])
        except AgentCrashed as exc:
            return failed("crash", [*errors, str(exc)])
        except AgentStartError as exc:
            return failed("start_failed", [*errors, str(exc)])
        except RpcError as exc:
            return failed("agent_error", [*errors, f"agent error {exc.code}: {exc.message}"])
        if result.stop_reason == StopReason.CANCELLED or progress.cancel_requested:
            return Outcome("cancelled", errors=errors, attempts=attempts, duration_ms=_ms(started))
        check = await asyncio.to_thread(reply_problems, result.text, state, ui_required)
        errors, prompt, total = check.problems, check.prompt, check.total
        text = check.text or text
        if not errors:
            _log.info("[%s] valid UI on attempt %d: %d message(s)", label, attempt, len(check.messages))
            return Outcome("ok", check.messages, check.text, [], attempts, None, _ms(started), state=check.state)
        progress.invalid(errors, total)
        _log.warning(
            _listed("[%s] attempt %d of %d invalid: %d problem(s)", errors),
            label,
            attempt,
            max_repairs + 1,
            total,
            *errors[:5],
        )
        if attempt <= max_repairs:
            _log.info("[%s] sending repair %d of %d", label, attempt, max_repairs)
    return failed("invalid", errors, total)


def _ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)
