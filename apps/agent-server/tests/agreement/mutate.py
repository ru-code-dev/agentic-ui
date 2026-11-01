"""Broken variants of valid payloads for the P4 verdict agreement (PLAN §4 P4 mutation list + EXPERIMENT §9).

Each mutation takes a deep copy of a valid example's messages and returns the broken payload, or ``None`` when the
example has nothing to break that way. The verdict of every mutant is decided by the Node referee.
"""

import copy
import json
from collections.abc import Callable, Iterator
from typing import Any

from agentic_ui_server.resources import read_data_json

from .mutate_web_core import WEB_CORE_ACCEPTS, WEB_CORE_MUTATIONS

CATALOG = read_data_json("catalog.json")
Messages = list[Any]


def _components(messages: Messages) -> Iterator[dict]:
    for message in messages:
        body = message.get("updateComponents") if isinstance(message, dict) else None
        if isinstance(body, dict):
            yield from (c for c in body.get("components", []) if isinstance(c, dict))


def _schema_props(name: str) -> tuple[dict, list]:
    props, required = {}, []
    for part in CATALOG["components"].get(name, {}).get("allOf", []):
        props |= part.get("properties", {})
        required += part.get("required", [])
    return props, [r for r in required if r not in ("id", "component")]


def _first(messages: Messages, pick: Callable[[dict], Any]) -> tuple[dict, Any] | None:
    for comp in _components(messages):
        found = pick(comp)
        if found is not None:
            return comp, found
    return None


def _set(messages: Messages, pick: Callable[[dict], Any], change: Callable[[dict, Any], None]) -> Messages | None:
    hit = _first(messages, pick)
    if hit is None:
        return None
    change(*hit)
    return messages


def _children_holder(comp: dict) -> Any:
    return "children" if isinstance(comp.get("children"), list) and comp.get("id") != "root" else None


def _enum_prop(comp: dict) -> Any:
    props, _ = _schema_props(comp.get("component", ""))
    return next((k for k in comp if isinstance(props.get(k), dict) and "enum" in props[k]), None)


def _string_prop(comp: dict) -> Any:
    return next((k for k, v in comp.items() if k not in ("id", "component") and isinstance(v, str)), None)


def _call(value: Any) -> dict | None:
    if isinstance(value, dict):
        if isinstance(value.get("call"), str) and isinstance(value.get("args"), dict) and value["args"]:
            return value
        value = list(value.values())
    if isinstance(value, list):
        return next((c for c in map(_call, value) if c is not None), None)
    return None


def _wrap_in_not(call: dict) -> None:
    """The boolean ``call`` becomes ``not(<call with returnType "string">)``: a mismatched returnType one level down."""
    inner = dict(call, returnType="string")
    call.clear()
    call.update(call="not", args={"value": inner})


def _versions(messages: Messages, first: str, rest: str) -> Messages:
    """``first`` on the first message, ``rest`` on the others (A2-M1: Node's v0.9 release line is v0.9 + v0.9.1)."""
    return [dict(x, version=first if i == 0 else rest) if isinstance(x, dict) else x for i, x in enumerate(messages)]


def _return_type(value: Any) -> Callable[[Messages], Messages | None]:
    return lambda m: _set(m, lambda c: _call(c), lambda c, call: call.update(returnType=value))


def _create(messages: Messages) -> dict | None:
    return next((m for m in messages if isinstance(m, dict) and "createSurface" in m), None)


def _with_create(messages: Messages, change: Callable[[dict], None]) -> Messages | None:
    create = _create(messages)
    if create is None:
        return None
    change(create)
    return messages


def _move_create_last(messages: Messages) -> Messages | None:
    create = _create(messages)
    if create is None or len(messages) < 2:
        return None
    messages.remove(create)
    return [*messages, create]


def _duplicate(messages: Messages) -> Messages | None:
    for message in messages:
        comps = message.get("updateComponents", {}).get("components") if isinstance(message, dict) else None
        if isinstance(comps, list) and len(comps) >= 2:
            comps.append(copy.deepcopy(comps[1]))
            return messages
    return None


def _add_component(messages: Messages, comp: dict) -> Messages | None:
    for message in messages:
        comps = message.get("updateComponents", {}).get("components") if isinstance(message, dict) else None
        if isinstance(comps, list):
            comps.append(comp)
            return messages
    return None


def _rename_root(messages: Messages) -> Messages | None:
    return _set(messages, lambda c: True if c.get("id") == "root" else None, lambda c, _: c.update(id="main"))


def _own_return_type(name: str) -> Any:
    return CATALOG["functions"].get(name, {}).get("properties", {}).get("returnType", {}).get("const")


MUTATIONS: dict[str, Callable[[Messages], Messages | None]] = {
    "drop-required": lambda m: _set(
        m,
        lambda c: next(iter(r for r in _schema_props(c.get("component", ""))[1] if r in c), None),
        lambda c, k: c.pop(k),
    ),
    "wrong-enum": lambda m: _set(m, _enum_prop, lambda c, k: c.update({k: "no-such-token"})),
    "style-bound-to-data": lambda m: _set(m, _enum_prop, lambda c, k: c.update({k: {"path": "/style"}})),
    "unknown-component": lambda m: _set(
        m, lambda c: True if c.get("id") != "root" else None, lambda c, _: c.update(component="Widget")
    ),
    "extra-prop": lambda m: _set(m, lambda c: True, lambda c, _: c.update(bogus=1)),
    "wrong-type": lambda m: _set(m, _string_prop, lambda c, k: c.update({k: 12345})),
    "bad-dynamic-string": lambda m: _set(m, _string_prop, lambda c, k: c.update({k: {"oops": "x"}})),
    "missing-id": lambda m: _set(m, lambda c: True if c.get("id") != "root" else None, lambda c, _: c.pop("id")),
    "dangling-child": lambda m: _set(
        m, lambda c: "children" if isinstance(c.get("children"), list) else None, lambda c, k: c[k].append("ghost")
    ),
    "self-reference": lambda m: _set(
        m, lambda c: "children" if isinstance(c.get("children"), list) else None, lambda c, k: c[k].append(c["id"])
    ),
    "cycle": lambda m: _set(m, _children_holder, lambda c, k: c[k].append("root")),
    "template-as-array": lambda m: _set(
        m, lambda c: "children" if isinstance(c.get("children"), dict) else None, lambda c, k: c.update({k: [c[k]]})
    ),
    "duplicate-id": _duplicate,
    "orphan": lambda m: _add_component(m, {"id": "orphan", "component": "Text", "text": "lost"}),
    "missing-root": _rename_root,
    "bad-function-args": lambda m: _set(m, lambda c: _call(c), lambda c, call: call["args"].update(bogusArg=1)),
    "unknown-function": lambda m: _set(m, lambda c: _call(c), lambda c, call: call.update(call="noSuchFunction")),
    "version-0.9.1": lambda m: _versions(m, "v0.9.1", "v0.9.1"),
    "mixed-0.9-versions": lambda m: _versions(m, "v0.9.1", "v0.9"),
    "version-0.9.2": lambda m: _versions(m, "v0.9.2", "v0.9"),
    "version-number": lambda m: _versions(m, 0.9, "v0.9"),
    "return-type-own": lambda m: _set(
        m, lambda c: _call(c), lambda c, call: call.update(returnType=_own_return_type(call["call"]))
    ),
    "return-type-mismatch": _return_type("void"),
    "return-type-other-slot": _return_type("number"),
    "return-type-unknown": _return_type("bogus"),
    "return-type-not-a-string": _return_type(5),
    "return-type-nested": lambda m: _set(
        m, lambda c: c.get("checks") and _call(c["checks"]), lambda c, call: _wrap_in_not(call)
    ),
    "bad-version": lambda m: [dict(x, version="v0.8") if isinstance(x, dict) else x for x in m],
    "no-version": lambda m: [{k: v for k, v in x.items() if k != "version"} for x in m],
    "unknown-catalog": lambda m: _with_create(m, lambda c: c["createSurface"].update(catalogId="urn:other:catalog")),
    "two-actions": lambda m: _with_create(
        m, lambda c: c.update(deleteSurface={"surfaceId": c["createSurface"]["surfaceId"]})
    ),
    "unknown-message-type": lambda m: [*m, {"version": "v0.9", "updateWidgets": {"surfaceId": "x"}}],
    "not-an-object": lambda m: [*m, "text"],
    "update-before-create": _move_create_last,
    "create-twice": lambda m: _with_create(m, lambda c: m.append(copy.deepcopy(c))),
    "empty-components": lambda m: [*m, {"version": "v0.9", "updateComponents": {"surfaceId": "s9", "components": []}}],
    "data-model-extra-key": lambda m: [
        *m,
        {"version": "v0.9", "updateDataModel": {"surfaceId": "s9", "value": {}, "data": {}}},
    ],
    "delete-unknown-surface": lambda m: [*m, {"version": "v0.9", "deleteSurface": {"surfaceId": "never-created"}}],
    **WEB_CORE_MUTATIONS,
}


# Mutations Node's validatePayload accepts on every example they apply to (agreement = the same verdict): args are
# Zod objects that strip unknown keys (P4-D2), v0.9 + v0.9.1 are one release line and returnType is any enum value
# (A2-M1), an update/delete of a surface the payload never names is assumed to exist (Node's ``assumes``).
NODE_ACCEPTS = frozenset(
    {
        "bad-function-args",
        "version-0.9.1",
        "mixed-0.9-versions",
        "return-type-own",
        "return-type-mismatch",
        "return-type-other-slot",
        "return-type-nested",
        "delete-unknown-surface",
    }
    | WEB_CORE_ACCEPTS
)


def mutants(name: str, messages: Messages) -> Iterator[tuple[str, str, Messages]]:
    """``(case id, mutation, payload)`` for every mutation that applies to ``messages``."""
    for mutation, apply in MUTATIONS.items():
        broken = apply(copy.deepcopy(messages))
        if broken is not None and json.dumps(broken, sort_keys=True) != json.dumps(messages, sort_keys=True):
            yield f"{name}~{mutation}", mutation, broken
