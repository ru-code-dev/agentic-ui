"""Nesting and path rules of a message: port of web_core 0.14 ``validateRecursionAndPaths`` (integrity-checker.js).

``@a2ui/agent`` ``validatePayload`` (and the renderer's ``MessageProcessor``) run it on ``[message]`` for every
message, so the depth counts from that one-item list: the list is depth 0, the message 1. Rules, Node's texts:
any value deeper than ``MAX_GLOBAL_DEPTH`` (50); a function call (``{call|@call, args}`` or ``{functionCall: {…}}``)
nested ``MAX_FUNC_CALL_DEPTH`` (5) calls deep; a ``path``/``@path`` string anywhere (bindings, templates,
``updateDataModel``, data-model values too) that is not a relaxed JSON pointer (``~`` only as ``~0``/``~1``).
Two project rules beyond web_core (the page applies them too): such a path must not hold a segment web_core's data
model refuses (``__proto__``/``constructor``/``prototype``: the read throws while rendering, A4-27), and no object
may hold a ``__proto__`` key (JavaScript drops it or reads it as the prototype, A4-29).
Node stops at the first problem; this port reports each path problem and at most one depth problem per message,
and walks iteratively, so no payload raises ``RecursionError``.
"""

import re
from dataclasses import dataclass
from typing import Any

from .datamodel import DataModelError, segments
from .schema import Issue

MAX_GLOBAL_DEPTH = 50
MAX_FUNC_CALL_DEPTH = 5
_SEGMENT = r"(?:[^~/]|~[01])"
RELAXED_PATH_RE = re.compile(rf"(?:(?:/{_SEGMENT}*)*|{_SEGMENT}+(?:/{_SEGMENT}*)*)")


@dataclass(frozen=True)
class Integrity:
    issues: list[Issue]
    too_deep: bool
    """A nesting limit is exceeded: the caller skips the message's schema check (it is invalid anyway, and the
    recursive schema walk over such a value could exhaust the Python stack)."""


def _call_key(obj: dict) -> str | None:
    """The key whose value is one function-call level deeper (``functionCall`` / ``args``), or None."""
    if isinstance(obj.get("functionCall"), dict | list):  # JavaScript: typeof [] === "object"
        return "functionCall"
    if ("call" in obj or "@call" in obj) and "args" in obj:
        return "args"
    return None


def check_integrity(index: int, message: Any) -> Integrity:
    where = f"messages[{index}]"
    issues: list[Issue] = []
    deep = func_reported = proto_reported = False
    stack: list[tuple[Any, int, int]] = [(message, 1, 0)]
    while stack:
        item, depth, calls = stack.pop()
        if depth > MAX_GLOBAL_DEPTH:
            if not deep:
                issues.append(Issue(where, f"Global recursion limit exceeded: Depth > {MAX_GLOBAL_DEPTH}"))
            deep = True
            continue
        if isinstance(item, list):
            stack.extend((x, depth + 1, calls) for x in reversed(item))
            continue
        if not isinstance(item, dict):
            continue
        if "__proto__" in item and not proto_reported:
            issues.append(Issue(where, "Forbidden key '__proto__': JavaScript drops it or reads it as the prototype"))
            proto_reported = True
        for key in ("path", "@path"):
            path = item.get(key)
            if isinstance(path, str) and not RELAXED_PATH_RE.fullmatch(path):
                issues.append(Issue(where, f"Invalid path syntax: '{path}'"))
            elif isinstance(path, str):
                try:
                    segments(path)
                except DataModelError as exc:
                    issues.append(Issue(where, str(exc)))
        deeper = _call_key(item)
        if deeper is not None and calls >= MAX_FUNC_CALL_DEPTH:
            if not func_reported:
                issues.append(Issue(where, f"Recursion limit exceeded: functionCall depth > {MAX_FUNC_CALL_DEPTH}"))
            func_reported = True
            continue
        stack.extend((item[key], depth + 1, calls + 1 if key == deeper else calls) for key in reversed(list(item)))
    return Integrity(issues, deep or func_reported)
