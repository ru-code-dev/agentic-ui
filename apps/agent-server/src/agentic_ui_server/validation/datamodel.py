"""A surface's data model as the renderer holds it: port of web_core 0.14 ``DataModel`` (``set``/``get``) and
``DataContext.resolvePath`` (A4-24, SV-C28).

Every ``updateDataModel`` is applied in order to the surface's model (``path`` absent or ``""`` = ``/``; a ``value``
absent or ``null`` deletes), so a write the renderer refuses is reported with web_core's text: a forbidden segment
(``__proto__``, ``constructor``, ``prototype``), a non-numeric segment on an array (``/items/-``, ``/items/01``), an
index over ``MAX_ARRAY_INDEX``, a write through a primitive, a keyed write into a primitive root. Missing parents are
created (an array when the next segment is an index). A deleted array element becomes a hole (``UNDEFINED``, what
JavaScript's ``arr[i] = undefined`` leaves); ``get`` answers ``UNDEFINED`` for anything absent.
"""

import copy
import re
from typing import Any

FORBIDDEN_KEYS = frozenset({"__proto__", "constructor", "prototype"})
MAX_ARRAY_INDEX = 10000
_INDEX = re.compile(r"0|[1-9][0-9]*")
_ESCAPE = re.compile(r"~([01])")


class _Undefined:
    def __repr__(self) -> str:
        return "undefined"


UNDEFINED: Any = _Undefined()


class DataModelError(ValueError):
    """A write (or read) web_core's ``DataModel`` refuses; ``str()`` is its text."""


def _absent(value: Any) -> bool:
    return value is None or value is UNDEFINED


def _container(value: Any) -> bool:
    return isinstance(value, dict | list)


def segments(path: str) -> list[str]:
    """``DataModel.parsePath``: non-empty segments, ``~1`` → ``/``, ``~0`` → ``~``; a forbidden one raises."""
    out = []
    for raw in path.split("/"):
        if not raw:
            continue
        segment = _ESCAPE.sub(lambda m: "/" if m[1] == "1" else "~", raw)
        if segment in FORBIDDEN_KEYS:
            raise DataModelError(f"Forbidden path segment '{segment}' in path '{path}'.")
        out.append(segment)
    return out


def get(data: Any, path: str) -> Any:
    if path in ("/", ""):
        return data
    current = data
    for segment in segments(path):
        if not _container(current):
            return UNDEFINED
        if isinstance(current, list):
            if not _INDEX.fullmatch(segment) or int(segment) >= len(current):
                return UNDEFINED
            current = current[int(segment)]
        elif segment in current:
            current = current[segment]
        else:
            return UNDEFINED
    return current


def _put(items: list, index: int, value: Any) -> None:
    if index >= len(items):
        items.extend([UNDEFINED] * (index + 1 - len(items)))
    items[index] = value


def _index(path: str, segment: str, *, on_array: bool) -> int:
    if on_array and not _INDEX.fullmatch(segment):
        raise DataModelError(f"Cannot use non-numeric segment '{segment}' on an array in path '{path}'.")
    index = int(segment)
    if index > MAX_ARRAY_INDEX:
        raise DataModelError(
            f"Cannot set path '{path}': array index '{segment}' exceeds maximum supported index ({MAX_ARRAY_INDEX})."
        )
    return index


def _fresh(path: str, following: str) -> list | dict:
    """The container web_core creates for a missing parent: an array when the next segment is an index."""
    if _INDEX.fullmatch(following):
        _index(path, following, on_array=False)
        return []
    return {}


def set_value(data: Any, path: str, value: Any) -> Any:
    """``DataModel.set(path, value)`` on ``data`` (changed in place); returns the new root. ``value`` is copied."""
    parts = segments(path)
    if not parts:
        return {} if _absent(value) else copy.deepcopy(value)
    last = parts.pop()
    if _absent(value) and get(data, path) is UNDEFINED:
        return data
    if _absent(data):
        data = {}
    elif not _container(data):
        raise DataModelError(f"Cannot set path '{path}': the data model root is a primitive value.")
    current = data
    for i, segment in enumerate(parts):
        following = parts[i + 1] if i < len(parts) - 1 else last
        if isinstance(current, list):
            index = _index(path, segment, on_array=True)
            child = current[index] if index < len(current) else UNDEFINED
            if not _absent(child) and not _container(child):
                raise DataModelError(f"Cannot set path '{path}': segment '{segment}' is a primitive value.")
            if _absent(child):
                child = _fresh(path, following)
                _put(current, index, child)
        else:
            child = current.get(segment, UNDEFINED)
            if not _absent(child) and not _container(child):
                raise DataModelError(f"Cannot set path '{path}': segment '{segment}' is a primitive value.")
            if _absent(child):
                child = _fresh(path, following)
                current[segment] = child
        current = child
    if isinstance(current, list):
        index = _index(path, last, on_array=True)
        if not _absent(value):
            _put(current, index, copy.deepcopy(value))
        elif index < len(current):
            current[index] = UNDEFINED
    elif _absent(value):
        current.pop(last, None)
    else:
        current[last] = copy.deepcopy(value)
    return data


def resolve(path: str, context: str = "/") -> str:
    """``DataContext.resolvePath``: an absolute path as is, a relative one below the context path."""
    if path.startswith("/"):
        return path
    base = context[:-1] if context.endswith("/") and len(context) > 1 else context
    if path in ("", "."):
        return base or "/"
    return f"{'' if base == '/' else base}/{path}"


def to_json(value: Any) -> Any:
    """The model as ``JSON.stringify`` writes it (holes → ``null``)."""
    if value is UNDEFINED:
        return None
    if isinstance(value, list):
        return [to_json(v) for v in value]
    if isinstance(value, dict):
        return {k: to_json(v) for k, v in value.items() if v is not UNDEFINED}
    return value
