"""Mutants of web_core's rules beyond the JSON schema (A3-04, A3-05, A3-07, A3-09), merged into ``mutate.MUTATIONS``.

Each family targets one rule the review found unported or unlisted: every nested ``call``/``function`` record is a
function call (``validateNestedFunctions``), the id rule of ``validateComponent``, Zod's strip mode below the
component level, the component envelope keys, path syntax, function-call depth and JSON depth
(``validateRecursionAndPaths``). The Node referee decides each verdict; ``WEB_CORE_ACCEPTS`` lists the families
Node accepts.
"""

from collections.abc import Callable, Iterator
from typing import Any

Messages = list[Any]


def _components(messages: Messages) -> Iterator[dict]:
    for message in messages:
        body = message.get("updateComponents") if isinstance(message, dict) else None
        if isinstance(body, dict):
            yield from (c for c in body.get("components", []) if isinstance(c, dict))


def _nested(value: Any) -> Iterator[dict]:
    """Every object below ``value`` (itself included), depth first."""
    if isinstance(value, list):
        for item in value:
            yield from _nested(item)
    elif isinstance(value, dict):
        yield value
        for item in value.values():
            yield from _nested(item)


def _first_nested(messages: Messages, pick: Callable[[dict], bool]) -> dict | None:
    for comp in _components(messages):
        found = next((d for d in _nested({k: v for k, v in comp.items() if k != "id"}) if pick(d)), None)
        if found is not None:
            return found
    return None


def _change(messages: Messages, pick: Callable[[dict], bool], change: Callable[[dict], None]) -> Messages | None:
    found = _first_nested(messages, pick)
    if found is None:
        return None
    change(found)
    return messages


def _event(d: dict) -> bool:
    return isinstance(d.get("event"), dict) and isinstance(d["event"].get("name"), str)


def _context(value: dict) -> Callable[[Messages], Messages | None]:
    """The first action event's ``context`` becomes ``value`` (a context is free JSON in the schema)."""
    return lambda m: _change(m, _event, lambda d: d["event"].update(context=value))


def _is_call(d: dict) -> bool:
    return isinstance(d.get("call"), str) and isinstance(d.get("args"), dict)


def _binding(d: dict) -> bool:
    return set(d) == {"path"} and isinstance(d["path"], str)


def _list_item(comp: dict) -> dict | None:
    """The first object item of a literal list prop (options, tabs, columns): a nested catalog object."""
    for key, value in comp.items():
        if key not in ("children", "checks") and isinstance(value, list) and value and isinstance(value[0], dict):
            return value[0]
    return None


def _on_component(messages: Messages, pick: Callable[[dict], Any], change: Callable[[dict, Any], None]) -> Any:
    for comp in _components(messages):
        found = pick(comp)
        if found is not None:
            change(comp, found)
            return messages
    return None


def _not_root(comp: dict) -> Any:
    return True if comp.get("id") != "root" else None


def _root(comp: dict) -> Any:
    return True if comp.get("id") == "root" else None


def _add_stray(messages: Messages) -> Messages | None:
    """A component with ``id: ""`` that nothing references (the A3 renderer case empty-id-stray)."""
    for message in messages:
        body = message.get("updateComponents") if isinstance(message, dict) else None
        if isinstance(body, dict) and isinstance(body.get("components"), list):
            body["components"].append({"id": "", "component": "Text", "text": "x"})
            return messages
    return None


def _deep_calls(levels: int) -> Callable[[dict], None]:
    def wrap(call: dict) -> None:
        inner = dict(call)
        for _ in range(levels):
            inner = {"call": "not", "args": {"value": inner}}
        call.clear()
        call.update(inner)

    return wrap


def _deep_json(depth: int) -> dict:
    value: Any = "x"
    for _ in range(depth):
        value = {"k": value}
    return value


WEB_CORE_MUTATIONS: dict[str, Callable[[Messages], Messages | None]] = {
    "context-key-call": _context({"call": "Анна"}),
    "context-key-function": _context({"function": "csv"}),
    "context-bad-call-args": _context({"rows": {"call": "and", "args": {"value": True}}}),
    "context-call-without-args": _context({"ok": {"call": "required"}}),
    "context-valid-call": _context({"ok": {"call": "not", "args": {"value": True}}}),
    "call-under-path": lambda m: _change(m, _is_call, lambda d: d["args"].update(extra={"path": {"call": "zzz"}})),
    "empty-id": lambda m: _on_component(m, _not_root, lambda c, _: c.update(id="")),
    "stray-empty-id": lambda m: _on_component(m, _root, lambda c, _: None) and _add_stray(m),
    "empty-root-id": lambda m: _on_component(m, _root, lambda c, _: c.update(id="")),
    "nested-extra-key": lambda m: _on_component(m, _list_item, lambda _, item: item.update(bogus=1)),
    "call-extra-key": lambda m: _change(m, _is_call, lambda d: d.update(bogus=1)),
    "binding-extra-key": lambda m: _change(m, _binding, lambda d: d.update(bogus=1)),
    "component-metadata": lambda m: _on_component(m, _not_root, lambda c, _: c.update(metadata={"bogus": [1]})),
    "component-catalog-number": lambda m: _on_component(m, _not_root, lambda c, _: c.update(catalogId=5)),
    "component-catalog-other": lambda m: _on_component(m, _not_root, lambda c, _: c.update(catalogId="urn:other")),
    "length-without-bounds": lambda m: _change(
        m, lambda d: d.get("call") == "length", lambda d: d.update(args={"value": d["args"].get("value", "")})
    ),
    "path-tilde": lambda m: _change(m, _binding, lambda d: d.update(path="/a~2b")),
    "deep-calls": lambda m: _change(m, _is_call, _deep_calls(5)),
    "deep-json": _context({"deep": _deep_json(50)}),
}

WEB_CORE_ACCEPTS = frozenset(
    {
        "context-valid-call",
        "nested-extra-key",
        "call-extra-key",
        "component-metadata",
        "component-catalog-number",
        "length-without-bounds",
    }
)
