"""Fold one turn's ``session/update`` frames into a ``TurnResult`` (PLAN §3.1.8, RESEARCH §B.2, §E).

Text = concatenated ``agent_message_chunk`` text; the empty final chunk carries ``_meta.usage``. Tool calls are
merged by ``toolCallId`` across ``tool_call`` → ``tool_call_update`` frames; ``rawInput`` comes from whichever
frame has non-empty args, including the permission request (a gated call may have no ``tool_call`` frame at all).
Unknown update kinds are counted, never fatal.
"""

import collections
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from ..acp.permissions import is_question
from ..acp.protocol import UpdateKind


@dataclass
class ToolCall:
    id: str
    name: str = ""
    title: str = ""
    kind: str = ""
    status: str = ""
    raw_input: Any = None
    raw_output: Any = None
    permission: str | None = None
    """The optionId we answered (``"cancelled"`` when no option was selected), if a permission was asked."""


@dataclass
class PermissionRecord:
    tool_call_id: str
    tool_name: str
    question: bool
    outcome: str
    """Chosen optionId, or ``"cancelled"``."""


@dataclass
class TurnResult:
    text: str
    thoughts: str
    tool_calls: dict[str, ToolCall]
    plan: list[Any] | None
    usage: dict[str, Any] | None
    stop_reason: str
    updates_count: int
    kinds: dict[str, int] = field(default_factory=dict)
    permissions: list[PermissionRecord] = field(default_factory=list)
    duration_ms: int | None = None


def _non_empty(value: Any) -> bool:
    return value not in (None, {}, [], "")


class TurnCollector:
    def __init__(self) -> None:
        self._text: list[str] = []
        self._thoughts: list[str] = []
        self._tools: dict[str, ToolCall] = {}
        self._plan: list[Any] | None = None
        self._usage: dict[str, Any] | None = None
        self._duration_ms: int | None = None
        self._kinds: collections.Counter[str] = collections.Counter()
        self._permissions: list[PermissionRecord] = []

    def feed(self, update: Mapping[str, Any]) -> None:
        kind = str(update.get("sessionUpdate", ""))
        self._kinds[kind] += 1
        if kind in (UpdateKind.AGENT_MESSAGE_CHUNK, UpdateKind.AGENT_THOUGHT_CHUNK):
            self._chunk(kind, update)
        elif kind in (UpdateKind.TOOL_CALL, UpdateKind.TOOL_CALL_UPDATE):
            self._tool(update)
        elif kind == UpdateKind.PLAN:
            entries = update.get("entries")
            self._plan = list(entries) if isinstance(entries, list) else self._plan
        elif kind == UpdateKind.USAGE_UPDATE:
            self._usage = {**(self._usage or {}), "context": {k: v for k, v in update.items() if k != "sessionUpdate"}}

    def feed_permission(self, params: Mapping[str, Any], decision: Mapping[str, Any]) -> None:
        """Record a ``session/request_permission`` and our answer (its toolCall may be the only args source)."""
        tool_call = params.get("toolCall")
        tool_call = tool_call if isinstance(tool_call, Mapping) else {}
        outcome = decision.get("outcome", {})
        chosen = outcome.get("optionId") or "cancelled"
        call_id = str(tool_call.get("toolCallId", ""))
        call = self._merge_tool(call_id, tool_call)
        call.permission = chosen
        self._permissions.append(PermissionRecord(call_id, call.name, is_question(tool_call), chosen))

    def result(self, stop_reason: str) -> TurnResult:
        return TurnResult(
            text="".join(self._text),
            thoughts="".join(self._thoughts),
            tool_calls=dict(self._tools),
            plan=self._plan,
            usage=self._usage,
            stop_reason=stop_reason,
            updates_count=sum(self._kinds.values()),
            kinds=dict(self._kinds),
            permissions=list(self._permissions),
            duration_ms=self._duration_ms,
        )

    def _chunk(self, kind: str, update: Mapping[str, Any]) -> None:
        content = update.get("content")
        if isinstance(content, Mapping) and content.get("type") == "text" and isinstance(content.get("text"), str):
            (self._text if kind == UpdateKind.AGENT_MESSAGE_CHUNK else self._thoughts).append(content["text"])
        meta = update.get("_meta")
        if isinstance(meta, Mapping):
            if isinstance(meta.get("usage"), Mapping):
                self._usage = {**(self._usage or {}), **meta["usage"]}
            if isinstance(meta.get("durationMs"), (int, float)):
                self._duration_ms = int(meta["durationMs"])

    def _tool(self, update: Mapping[str, Any]) -> None:
        self._merge_tool(str(update.get("toolCallId", "")), update)

    def _merge_tool(self, call_id: str, frame: Mapping[str, Any]) -> ToolCall:
        call = self._tools.setdefault(call_id, ToolCall(id=call_id))
        meta = frame.get("_meta")
        if isinstance(meta, Mapping) and isinstance(meta.get("toolName"), str):
            call.name = meta["toolName"]
        for attr, key in (("title", "title"), ("kind", "kind"), ("status", "status")):
            if isinstance(frame.get(key), str) and frame[key]:
                setattr(call, attr, frame[key])
        if _non_empty(frame.get("rawInput")):
            call.raw_input = frame["rawInput"]
        if "rawOutput" in frame:
            call.raw_output = frame["rawOutput"]
        return call
