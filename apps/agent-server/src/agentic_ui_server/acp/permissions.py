"""Permission policy for ``session/request_permission`` (SV-C10 always allow, SV-C14 never answer questions).

Tools: always allowed by echoing the agent's own optionId, first ``allow_always`` option, else first
``allow_once`` (ru-code ``selectAutoApprovedPermissionOption``, QwenAdapter.ts:847-861; RESEARCH §B.3). No mode
is needed for this: the production custom Qwen has no yolo mode.

Questions: qwen 0.21.1 sends its ``ask_user_question`` tool as a permission request whose options are
``proceed_once`` "Submit" (allow_once) and ``cancel`` (reject_once), with ``toolCall._meta.qwenInteractionKind ==
"user_question"`` (qwen-code ``acp-integration/session/permissionUtils.ts:93-101,312-324``, ``Session.ts:7677-7696``).
Questions are rejected (first ``reject_once``, else outcome ``cancelled``): qwen then records "declined" and ends
the turn with ``end_turn`` (``Session.ts:7831-7840``, ``4125-4133``), so the turn never hangs.
"""

import re
from collections.abc import Mapping, Sequence
from typing import Any

from .protocol import PermissionKind

QUESTION_TOOL_NAMES = frozenset({"ask_user_question", "AskUserQuestion"})
QUESTION_INTERACTION_KIND = "user_question"
_QUESTION_TITLE = re.compile(r"^\s*ask (the )?user\b", re.IGNORECASE)

CANCELLED: dict[str, Any] = {"outcome": {"outcome": "cancelled"}}


def is_question(tool_call: Mapping[str, Any] | None) -> bool:
    """True when a permission request belongs to a question tool (all detection rules live here)."""
    if not isinstance(tool_call, Mapping):
        return False
    meta = tool_call.get("_meta")
    meta = meta if isinstance(meta, Mapping) else {}
    if meta.get("qwenInteractionKind") == QUESTION_INTERACTION_KIND or "qwenQuestions" in meta:
        return True
    if meta.get("toolName") in QUESTION_TOOL_NAMES:
        return True
    title = tool_call.get("title")
    return isinstance(title, str) and bool(_QUESTION_TITLE.match(title))


def _first_id(options: Sequence[Any], kind: str) -> str | None:
    """The first option of ``kind``; its trimmed id, or None when that id is blank (ru-code semantics)."""
    for option in options:
        if isinstance(option, Mapping) and option.get("kind") == kind:
            option_id = option.get("optionId")
            return option_id.strip() if isinstance(option_id, str) and option_id.strip() else None
    return None


def _selected(option_id: str) -> dict[str, Any]:
    return {"outcome": {"outcome": "selected", "optionId": option_id}}


def choose_option(options: Sequence[Any] | None) -> dict[str, Any]:
    """Always-allow answer: allow_always id → allow_once id → cancelled."""
    options = options if isinstance(options, Sequence) else []
    for kind in (PermissionKind.ALLOW_ALWAYS, PermissionKind.ALLOW_ONCE):
        option_id = _first_id(options, kind)
        if option_id:
            return _selected(option_id)
    return dict(CANCELLED)


def reject_option(options: Sequence[Any] | None) -> dict[str, Any]:
    """Question answer: reject_once id → cancelled. Never selects an allow option."""
    option_id = _first_id(options if isinstance(options, Sequence) else [], PermissionKind.REJECT_ONCE)
    return _selected(option_id) if option_id else dict(CANCELLED)


def decide(params: Mapping[str, Any] | None) -> dict[str, Any]:
    """The full policy for one ``session/request_permission`` params object."""
    params = params if isinstance(params, Mapping) else {}
    options = params.get("options")
    if is_question(params.get("toolCall")):
        return reject_option(options)
    return choose_option(options)
