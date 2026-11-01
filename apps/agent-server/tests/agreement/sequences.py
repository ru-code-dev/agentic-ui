"""SV-C28 multi-turn corpus: chats as reply sequences (each step = one reply's messages, from an empty chat).

``scenarios()``: the hand-written chats (create → update → action → update → delete, delete-then-create, update
after delete, unknown surface, the A4-09/A4-24/A4-25/A4-28/A4-31 vectors). ``as_chat``: a single payload as a chat
(a mock-rules follow-up gets its base composition as step 1). ``fuzz(seed, count)``: seeded follow-up chats built
from every composition. ``judge_chats``: the surface referee (``surface-referee.mjs``) and ``validate_step`` per step.
"""

import copy
import itertools
import json
import random
from typing import Any

from agentic_ui_server.conversation.turns import ChatSurfaces
from agentic_ui_server.resources import read_data_json
from agentic_ui_server.validation import SurfaceState, format_errors, validate_step

from ..support.node import run_referee
from .boundaries import boundaries
from .followups import follow_up

CATALOG_ID = read_data_json("catalog.json")["catalogId"]
V = "v0.9"
ROLLBACK = "rollback"
"""DEC-064 step: the page rejected the previous reply and its repair names it (``repairOf``): undo it if accepted."""


def create(sid: str = "s") -> dict:
    return {"version": V, "createSurface": {"surfaceId": sid, "catalogId": CATALOG_ID}}


def comps(*components: dict, sid: str = "s") -> dict:
    return {"version": V, "updateComponents": {"surfaceId": sid, "components": list(components)}}


def data(path: str, value: Any = None, sid: str = "s", *, drop: bool = False) -> dict:
    body = {"surfaceId": sid, "path": path} | ({} if drop else {"value": value})
    return {"version": V, "updateDataModel": body}


def delete(sid: str = "s") -> dict:
    return {"version": V, "deleteSurface": {"surfaceId": sid}}


def text(cid: str, value: Any = "a") -> dict:
    return {"id": cid, "component": "Text", "text": value}


def flex(*children: str, cid: str = "root") -> dict:
    return {"id": cid, "component": "Flex", "children": list(children)}


def button(cid: str, label: Any) -> dict:
    return {"id": cid, "component": "Button", "label": label, "action": {"event": {"name": "save"}}}


BASE = [
    create(),
    comps(flex("title", "save"), text("title", "Hi"), button("save", {"path": "/form/label"})),
    data("/form", {"label": "Save", "name": ""}),
]
LIST = [
    create(),
    comps(
        {"id": "root", "component": "List", "children": {"componentId": "row", "path": "/items"}},
        text("row", {"path": "name"}),
    ),
    data("/items", [{"name": "a"}, {"name": "b"}]),
]


def scenarios() -> dict[str, list[list]]:
    return {
        "svc28-lifecycle": [
            BASE,
            [comps({"id": "title", "text": "Hello"})],
            [data("/form/name", "Ivan")],
            [comps(flex("title", "save", "note"), text("note", "saved"))],
            [delete()],
        ],
        "svc28-delete-then-create": [BASE, [delete(), create(), comps(text("root"))]],
        "svc28-update-after-delete": [BASE, [delete()], [comps(text("root"))]],
        "svc28-update-after-delete-same-reply": [BASE, [delete(), comps(text("root"))]],
        "svc28-unknown-surface": [BASE, [comps(text("root", "x"), sid="s2")]],
        "svc28-unknown-surface-first-reply": [[comps(text("root"))]],
        "svc28-update-other-surface-same-reply": [[*BASE, comps(text("root"), sid="other")]],
        "svc28-create-shown-surface": [BASE, [create(), comps(text("root"))]],
        "svc28-delete-unknown-surface": [BASE, [delete("nope")]],
        "svc28-patch-dangling": [BASE, [comps(flex("title", "nope"))]],
        "svc28-patch-orphan": [BASE, [comps(text("extra", "new"))]],
        "svc28-patch-orphan-by-unlinking": [BASE, [comps(flex("title"))]],
        "svc28-patch-missing-root-cycle": [BASE, [comps(flex("title", cid="title"))]],
        "svc28-patch-partial-type": [BASE, [comps({"id": "title", "text": "Hello"})]],
        "svc28-patch-partial-unknown-id": [BASE, [comps({"id": "ghost", "text": "Hello"})]],
        "svc28-patch-component-nonstring": [BASE, [comps({"id": "title", "component": 5, "text": "x"})]],
        "svc28-invalid-step-rolls-back": [
            BASE,
            [comps(flex("title", "x"))],
            [comps(text("x"))],
            [comps(flex("title", "x"), text("x"))],
        ],
        "svc28-data-append-dash": [BASE, [data("/items", [])], [data("/items/-", 1)]],
        "svc28-data-through-primitive": [BASE, [data("/user", "Ivan")], [data("/user/name", "x")]],
        "svc28-data-forbidden-segment": [BASE, [data("/constructor", 1)]],
        "svc28-data-index-10001": [BASE, [data("/rows/10001", 1)]],
        "svc28-data-leading-zero": [BASE, [data("/rows", [1])], [data("/rows/01", 2)]],
        "svc28-data-primitive-root": [BASE, [data("/", 5)], [data("/a", 1)]],
        "svc28-data-delete": [BASE, [data("/form/name", drop=True)], [data("/form/label", None)]],
        "svc28-bound-object-after-data": [BASE, [data("/form/label", {"text": "Save"})]],
        "svc28-template-non-array-after-data": [LIST, [data("/items", {"name": "a"})]],
        "svc28-template-row-object": [LIST, [data("/items/1/name", {"first": "b"})]],
        "svc28-two-surfaces": [
            [create("a"), comps(text("root"), sid="a")],
            [create("b"), comps(text("root"), sid="b")],
            [delete("a")],
            [comps(text("root", "b2"), sid="b")],
            [comps(text("root"), sid="a")],
        ],
        "svc28-blank-surface-id": [[create(" "), comps(text("root"), sid=" ")]],
        "svc28-create-delete-create-one-reply": [
            [create(), comps(text("root")), delete(), create(), comps(text("root"))]
        ],
        "svc28-create-without-components": [[create()], [comps(text("root"))]],
        "svc28-update-uncreated-without-root": [[comps(text("a"))]],
        "svc28-delete-then-update-later": [BASE, [delete()], [data("/a", 1)]],
        "tree-depth-50": [[create(), comps(*chain(50))]],
        "tree-depth-51": [[create(), comps(*chain(51))]],
    } | boundaries()


def repair_scenarios() -> dict[str, list]:
    """DEC-064 chats with ``ROLLBACK`` steps (not validator cases: a bundle case is a chat without a client)."""
    shown2 = [create("s2"), comps(text("root"), sid="s2")]
    return {
        "dec064-repair-recreates-the-rejected-surface": [
            BASE,
            shown2,
            ROLLBACK,
            [create("s2"), comps(text("root"), sid="s2")],
        ],
        "dec064-control-without-rollback": [BASE, shown2, [create("s2"), comps(text("root"), sid="s2")]],
        "dec064-rollback-of-the-first-reply": [shown2, ROLLBACK, [comps(text("root"), sid="s2")], shown2],
        "dec064-rollback-after-an-invalid-reply-keeps-the-state": [
            BASE,
            [comps(flex("title", "x"))],
            ROLLBACK,
            [comps(text("title", "Hello"))],
        ],
        "dec064-rollback-restores-the-retyped-component": [
            BASE,
            [comps(text("save", "x"))],
            ROLLBACK,
            [comps(button("save", "y"))],
        ],
    }


def chain(depth: int) -> list[dict]:
    """root → n1 → … → n<depth> (root = level 0; a child reference adds 1; A4b-H1)."""
    ids = ["root", *(f"n{i}" for i in range(1, depth + 1))]
    return [{"id": a, "component": "Box", "children": [b]} for a, b in itertools.pairwise(ids)] + [text(ids[-1])]


def as_chat(messages: list, bases: dict[str, list]) -> list[list]:
    """A payload as a chat from an empty state: a follow-up (it creates no surface it updates) gets the composition
    that creates its surface as step 1."""
    created = {m["createSurface"].get("surfaceId") for m in messages if isinstance(m, dict) and "createSurface" in m}
    updated = [_sid(m) for m in messages if _sid(m) is not None]
    missing = [sid for sid in dict.fromkeys(updated) if sid not in created and sid in bases]
    return [bases[missing[0]], messages] if missing else [messages]


def _sid(message: Any) -> str | None:
    if not isinstance(message, dict):
        return None
    for body in message.values():
        if isinstance(body, dict) and isinstance(body.get("surfaceId"), str):
            return body["surfaceId"]
    return None


def bases(examples: list[tuple[str, list]]) -> dict[str, list]:
    """surfaceId → the first composition creating it."""
    out: dict[str, list] = {}
    for name, messages in examples:
        for m in messages:
            if name.startswith("compositions/") and isinstance(m, dict) and "createSurface" in m:
                out.setdefault(m["createSurface"]["surfaceId"], messages)
    return out


def fuzz(examples: list[tuple[str, list]], seed: int, count: int) -> dict[str, list[list]]:
    rng = random.Random(seed)
    starts = [(n, m) for n, m in examples if n.startswith("compositions/")]
    chats = {}
    for i in range(count):
        name, messages = starts[i % len(starts)]
        steps, state = [copy.deepcopy(messages)], validate_step(messages, SurfaceState()).state
        for _ in range(rng.randint(1, 3)):
            step = follow_up(rng, state, steps[0])
            steps.append(step)
            state = validate_step(step, state).state or state
        chats[f"fuzz{seed}-{i}:{name}"] = steps
    return chats


def judge_chats(chats: dict[str, list[list]]) -> list[dict[str, Any]]:
    """Per step: the referee's verdict/state and Python's errors/state (each chat from an empty state; a ``ROLLBACK``
    step undoes the previous reply through the server's ``ChatSurfaces``, DEC-064)."""
    ref = run_referee("surface-referee.mjs", [{"id": k, "steps": v} for k, v in chats.items()], timeout=600)
    out = []
    for item in ref:
        chat, turn = ChatSurfaces(), None
        for index, (messages, verdict) in enumerate(zip(chats[item["id"]], item["steps"], strict=True)):
            if messages == ROLLBACK:
                chat.rollback(turn)
                step, turn = None, None
            else:
                step = validate_step(json.loads(json.dumps(messages)), chat.state)
                turn = chat.accept(step.state) if step.state is not None else None
            state = chat.state
            out.append(
                {
                    "chat": item["id"],
                    "step": index,
                    "messages": messages,
                    "node": verdict,
                    "python_errors": format_errors(step.issues).splitlines() if step else [],
                    "python_state": state.to_json(),
                }
            )
    return out
