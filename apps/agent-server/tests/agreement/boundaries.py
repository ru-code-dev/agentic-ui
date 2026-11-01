"""Boundary chats: one valid/invalid pair per validator rule a single-rule mutant could break unnoticed (A4-33).

Each is a one-step chat of ``sequences.scenarios()`` (so ``validator-cases/cases.json`` carries it and the mutant
test ``test_validator_mutants.py`` kills the mutant): a JS ``$`` before a trailing newline, an integer given 1.5, a
minimum of 1 given 0, 1000 vs 1001 function args, ``@call`` nested 5 vs 6 deep and an ``@path`` with a bad ``~``
inside data, JSON depth 50 vs 51, a self-reference that a later message of the same reply overwrites, a non-URI
``openUrl`` url, a template given by ``dataBinding``, a nested call with missing args, a ``__proto__`` key inside
data, an empty ``components`` list, a template path ``""`` over an array root; A5-02: a tab title bound to an
object (and to a number), Table ``rows`` bound to an object and to an array of strings.
"""

import copy
import json
from typing import Any

from ..support.node import CATALOG_PKG


def _example(name: str) -> list:
    return json.loads((CATALOG_PKG / "examples" / "components" / f"{name}.json").read_text(encoding="utf-8"))[
        "messages"
    ]


def _root(messages: list, **props: Any) -> list:
    out = copy.deepcopy(messages)
    comps = next(m for m in out if "updateComponents" in m)["updateComponents"]["components"]
    next(c for c in comps if c["id"] == "root").update(props)
    return out


def _template(messages: list) -> dict:
    comps = next(m for m in messages if "updateComponents" in m)["updateComponents"]["components"]
    return dict(next(c for c in comps if c["id"] == "root")["children"])


def _with_data(messages: list, value: Any) -> list:
    sid = messages[0]["createSurface"]["surfaceId"]
    return [*messages, {"version": "v0.9", "updateDataModel": {"surfaceId": sid, "path": "/x", "value": value}}]


def _nested(depth: int, make: Any) -> Any:
    value: Any = "v"
    for _ in range(depth):
        value = make(value)
    return value


def _text_call(args: int) -> dict:
    return {
        "call": "formatString",
        "args": {"value": "x", **{f"a{i}": i for i in range(args - 1)}},
        "returnType": "string",
    }


def boundaries() -> dict[str, list[list]]:
    text, grid, table, button = _example("Text"), _example("Grid"), _example("Table"), _example("Button")
    at_call = lambda v: {"@call": "formatString", "args": {"value": v}}  # noqa: E731
    out = {
        "boundary-pattern-trailing-newline": _root(table, currency="RUB\n"),
        "boundary-pattern-ok": _root(table, currency="RUB"),
        "boundary-integer-1.5": _root(grid, columns=1.5),
        "boundary-integer-2.0": _root(grid, columns=2.0),
        "boundary-minimum-0": _root(grid, columns=0),
        "boundary-minimum-1": _root(grid, columns=1),
        "boundary-args-1000": _root(text, text=_text_call(1000)),
        "boundary-args-1001": _root(text, text=_text_call(1001)),
        "boundary-at-call-depth-5": _with_data(text, _nested(5, at_call)),
        "boundary-at-call-depth-6": _with_data(text, _nested(6, at_call)),
        "boundary-at-path-tilde": _with_data(text, {"@path": "/a~2"}),
        "boundary-json-depth-50": _with_data(text, _nested(47, lambda v: [v])),
        "boundary-json-depth-51": _with_data(text, _nested(48, lambda v: [v])),
        "boundary-openurl-not-uri": _root(
            button, action={"functionCall": {"call": "openUrl", "args": {"url": "not a uri"}}}
        ),
        "boundary-template-databinding": _root(
            _example("List"), children={"componentId": "ghost", "dataBinding": "/x"}
        ),
    }
    sid = text[0]["createSurface"]["surfaceId"]
    lst = _example("List")
    lsid = lst[0]["createSurface"]["surfaceId"]
    columns = copy.deepcopy(next(c for c in table[2]["updateComponents"]["components"] if c["id"] == "root")["columns"])
    columns[0]["extra"] = {"call": "formatString", "args": {}}  # an opened closure: only the nested-call walk sees it
    out["boundary-nested-call-missing-args"] = _root(table, columns=columns)
    out["boundary-proto-key-in-data"] = _with_data(text, {"__proto__": {"x": 1}})
    out["boundary-empty-components"] = [
        text[0],
        {"version": "v0.9", "updateComponents": {"surfaceId": sid, "components": []}},
    ]
    out["boundary-template-path-empty-on-array-root"] = [
        *_root(lst, children={**_template(lst), "path": ""}),
        {"version": "v0.9", "updateDataModel": {"surfaceId": lsid, "path": "/", "value": [{"title": "a"}]}},
    ]
    tabs = _example("Tabs")
    tab_root = next(c for c in tabs[2]["updateComponents"]["components"] if c["id"] == "root")
    tab_list = copy.deepcopy(tab_root["tabs"])
    tab_list[0]["title"] = {"path": "/ui"}  # A5-02: a tab title (inside the tabs items) bound to an object
    out["a5-02-tab-title-bound-to-object"] = _root(tabs, tabs=tab_list)
    tab_list = copy.deepcopy(tab_list)
    tab_list[0]["title"] = {"path": "/ui/tab"}  # a number: fine for a string prop (the renderer coerces it)
    out["a5-02-tab-title-bound-to-number"] = _root(tabs, tabs=tab_list)
    out["a5-02-table-rows-object"] = _root(table, rows={"path": "/transactions/0"})
    out["a5-02-table-rows-strings"] = _with_data(_root(table, rows={"path": "/x"}), ["a", "b"])
    comps = lambda *c: {"version": "v0.9", "updateComponents": {"surfaceId": sid, "components": list(c)}}  # noqa: E731
    out["boundary-cycle-then-overwrite"] = [
        text[0],
        comps({"id": "root", "component": "Flex", "children": ["root"]}),
        comps({"id": "root", "component": "Text", "text": "x"}),
    ]
    return {name: [messages] for name, messages in out.items()}
