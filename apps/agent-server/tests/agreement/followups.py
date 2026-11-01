"""SV-C28 follow-up fuzz operators: one random follow-up reply against a chat's merged surface state.

Each operator reads the shown surface (``SurfaceState``) and returns messages a model plausibly sends after it:
partial and type-changing component updates, added / dangling / unlinked / cyclic children, data-model writes on
existing paths and their edge variants (``-``, ``01``, ``10001``, forbidden keys, through primitives), rebinding a
prop to an existing path (object or array values), delete, delete-then-recreate, create without delete, a wrong
surfaceId. A follow-up holds 1–2 operators.
"""

import copy
import random
from collections.abc import Iterator
from typing import Any

from agentic_ui_server.validation import SurfaceState
from agentic_ui_server.validation.datamodel import UNDEFINED

V = "v0.9"
VALUES: list[Any] = ["x", 3, 2.5, True, None, {"a": "b"}, [1, 2], [], {}, [{"name": "n"}]]
SUFFIXES = ["", "/-", "/01", "/x", "/0", "/10001", "/__proto__", "/name", "/constructor/a"]


def _comps(sid: str, *components: dict) -> dict:
    return {"version": V, "updateComponents": {"surfaceId": sid, "components": list(components)}}


def _paths(value: Any, prefix: str = "", depth: int = 0) -> Iterator[str]:
    yield prefix or "/"
    if depth >= 3:
        return
    if isinstance(value, dict):
        for key, sub in list(value.items())[:6]:
            yield from _paths(sub, f"{prefix}/{key.replace('~', '~0').replace('/', '~1')}", depth + 1)
    elif isinstance(value, list):
        for index, sub in enumerate(value[:3]):
            if sub is not UNDEFINED:
                yield from _paths(sub, f"{prefix}/{index}", depth + 1)


def _with_children(comps: dict[str, dict]) -> list[dict]:
    return [c for c in comps.values() if isinstance(c.get("children"), list)]


def partial(rng: random.Random, sid: str, comps: dict, data: Any, base: list) -> list:
    comp = copy.deepcopy(rng.choice(list(comps.values())))
    comp.pop("component", None)
    for key, value in comp.items():
        if isinstance(value, str) and key != "id":
            comp[key] = "x"
            break
    return [_comps(sid, comp)]


def retype(rng: random.Random, sid: str, comps: dict, data: Any, base: list) -> list:
    cid = rng.choice(list(comps))
    return [_comps(sid, {"id": cid, "component": rng.choice(["Text", "Heading", "Tag"]), "text": "x"})]


def add_child(rng: random.Random, sid: str, comps: dict, data: Any, base: list) -> list:
    new = {"id": f"n{rng.randint(0, 99)}", "component": "Text", "text": "new"}
    parents = _with_children(comps)
    if not parents or rng.random() < 0.2:
        return [_comps(sid, new)]  # orphan
    parent = copy.deepcopy(rng.choice(parents))
    parent["children"].insert(rng.randint(0, len(parent["children"])), new["id"])
    return [_comps(sid, *rng.sample([parent, new], 2))]


def relink(rng: random.Random, sid: str, comps: dict, data: Any, base: list) -> list:
    parents = _with_children(comps)
    if not parents:
        return []
    parent = copy.deepcopy(rng.choice(parents))
    kind = rng.choice(["ghost", "unlink", "cycle", "self"])
    if kind == "unlink" and parent["children"]:
        parent["children"].pop(rng.randrange(len(parent["children"])))
    else:
        parent["children"].append({"ghost": "ghost", "cycle": "root", "self": parent["id"]}.get(kind, "ghost"))
    return [_comps(sid, parent)]


def write(rng: random.Random, sid: str, comps: dict, data: Any, base: list) -> list:
    path = rng.choice(list(_paths(data))).rstrip("/") + rng.choice(SUFFIXES)
    body: dict[str, Any] = {"surfaceId": sid, "path": path or "/"}
    if rng.random() < 0.9:
        body["value"] = copy.deepcopy(rng.choice(VALUES))
    return [{"version": V, "updateDataModel": body}]


def rebind(rng: random.Random, sid: str, comps: dict, data: Any, base: list) -> list:
    texts = [c for c in comps.values() if c.get("component") in ("Text", "Heading", "Button", "Tag", "Avatar")]
    if not texts:
        return []
    comp = copy.deepcopy(rng.choice(texts))
    prop = {"Button": "label", "Avatar": "name"}.get(comp["component"], "text")
    comp[prop] = {"path": rng.choice(list(_paths(data)))}
    return [_comps(sid, comp)]


def lifecycle(rng: random.Random, sid: str, comps: dict, data: Any, base: list) -> list:
    delete = {"version": V, "deleteSurface": {"surfaceId": sid}}
    kind = rng.choice(["delete", "recreate", "create-again", "wrong-surface", "update-after-delete"])
    if kind == "delete":
        return [delete]
    if kind == "recreate":
        return [delete, *copy.deepcopy(base)]
    if kind == "create-again":
        return copy.deepcopy(base[:1])
    if kind == "wrong-surface":
        return [_comps(f"{sid}-other", {"id": "root", "component": "Text", "text": "x"})]
    return [delete, _comps(sid, {"id": "root", "component": "Text", "text": "x"})]


OPERATORS = [partial, retype, add_child, relink, write, rebind, lifecycle]


def follow_up(rng: random.Random, state: SurfaceState | None, base: list) -> list:
    sid = next(m["createSurface"]["surfaceId"] for m in base if isinstance(m, dict) and "createSurface" in m)
    surface = state.surfaces.get(sid) if state is not None else None
    if surface is None or not surface.components:
        return copy.deepcopy(base)
    messages: list = []
    for operator in rng.sample(OPERATORS, rng.randint(1, 2)):
        messages += operator(rng, sid, surface.components, surface.data, base)
    return messages or copy.deepcopy(base)
