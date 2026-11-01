"""Component tree checks of a created surface (port of web_core ``SurfaceComponentsModel`` + ``checkTopology``).

Child references come from the catalog like web_core's ``componentRefMap``: a prop whose schema is
``common_types#/$defs/ComponentId`` is a single reference, ``ChildList`` a list (ids or a template
``{componentId, path}``), and an array of objects with a ``ComponentId`` field (``Tabs.tabs[].child``) a nested one.
Checks (Node's texts, but every problem instead of the first): root ``root`` exists, no dangling reference, no
self-reference, no cycle, depth <= 50, every component of the payload reachable from the root.
"""

from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

from .refs import COMMON_TYPES_ID, SchemaRegistry
from .schema import Issue

ROOT_ID = "root"
MAX_DEPTH = 50
SINGLE, LIST = COMMON_TYPES_ID + "#/$defs/ComponentId", COMMON_TYPES_ID + "#/$defs/ChildList"


@dataclass(frozen=True)
class RefFields:
    single: frozenset[str] = frozenset()
    lists: frozenset[str] = frozenset()
    nested: dict[str, frozenset[str]] = field(default_factory=dict)


def component_props(schema: Any, depth: int = 0) -> dict[str, Any]:
    """Own and ``allOf`` properties of a component schema (``$ref`` into common types is not followed)."""
    if not isinstance(schema, dict) or depth > 4:
        return {}
    out = dict(schema.get("properties", {}))
    for sub in schema.get("allOf", ()):
        if isinstance(sub, dict) and "$ref" not in sub:
            out |= component_props(sub, depth + 1)
    return out


def ref_map(registry: SchemaRegistry) -> dict[str, RefFields]:
    """Component type → its reference fields (what web_core's ``buildComponentRefMap`` derives from the schemas)."""
    out = {}
    for name, schema in registry.catalog["components"].items():
        single, lists, nested = set(), set(), {}
        for prop, sub in component_props(schema).items():
            ref = sub.get("$ref") if isinstance(sub, dict) else None
            if ref == SINGLE:
                single.add(prop)
            elif ref == LIST:
                lists.add(prop)
            elif isinstance(sub, dict) and sub.get("type") == "array" and isinstance(sub.get("items"), dict):
                keys = {
                    k
                    for k, v in component_props(sub["items"]).items()
                    if isinstance(v, dict) and v.get("$ref", "").endswith("/ComponentId")
                }
                if keys:
                    lists.add(prop)
                    nested[prop] = frozenset(keys)
        if single or lists:
            out[name] = RefFields(frozenset(single), frozenset(lists), nested)
    return out


def pointers(value: Any, path: str, nested: frozenset[str] | None) -> Iterator[tuple[str, str]]:
    """Port of integrity-checker ``extractPointers``: ``(referenced id, field path)``."""
    if isinstance(value, str):
        yield value, path
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from pointers(item, f"{path}[{index}]", nested)
    elif isinstance(value, dict):
        if isinstance(value.get("componentId"), str) and ("path" in value or "dataBinding" in value):
            yield value["componentId"], f"{path}.componentId"
        elif nested:
            for key in nested:
                if key in value:
                    yield from pointers(value[key], f"{path}.{key}", None)
        else:
            for key, sub in value.items():
                yield from pointers(sub, f"{path}.{key}", None)


def child_refs(component: dict[str, Any], refs: dict[str, RefFields]) -> list[tuple[str, str]]:
    fields = refs.get(component.get("component")) if isinstance(component.get("component"), str) else None
    if fields is None:
        return []
    return [
        ref
        for key, value in component.items()
        if key in fields.single | fields.lists
        for ref in pointers(value, key, fields.nested.get(key))
    ]


def check_tree(
    surface_id: str, components: dict[str, dict], changed: list[str], refs: dict[str, RefFields], path: str
) -> list[Issue]:
    """Every topology problem of one surface (``components`` = id → component, in arrival order). Called once the
    surface received components: without any with a usable id the root is missing."""
    issues, children = [], {cid: child_refs(comp, refs) for cid, comp in components.items()}
    where = f"{path} (surface '{surface_id}')"
    if ROOT_ID not in components:
        issues.append(Issue(where, f"Missing root component: No component has id='{ROOT_ID}'"))
    for cid, kids in children.items():
        for child, fieldname in kids:
            if child == cid:
                issues.append(
                    Issue(
                        where,
                        f"Circular reference detected: Component '{cid}' references itself in field "
                        f"'{fieldname}' (Self-reference detected)",
                    )
                )
            elif child not in components:
                issues.append(
                    Issue(
                        where,
                        f"Component '{cid}' references non-existent component '{child}' in field "
                        f"'{fieldname}' (Dangling reference '{child}' in component '{cid}')",
                    )
                )
    visited: set[str] = set()
    if ROOT_ID in components:
        issues += _walk(children, components, visited, where, ROOT_ID)
    issues += _cycles_outside(children, components, set(visited), where)
    for cid in sorted(c for c in set(changed) if c in components and c not in visited and ROOT_ID in components):
        issues.append(
            Issue(
                where,
                f"Component '{cid}' is not reachable from '{ROOT_ID}' (Orphaned component '{cid}' "
                "is not reachable from root)",
            )
        )
    return issues


def _walk(children: dict[str, list], components: dict, visited: set[str], where: str, start: str) -> list[Issue]:
    issues: list[Issue] = []
    stack: list[tuple[str, int, Iterator[str]]] = []
    on_path: set[str] = set()

    def enter(node: str, depth: int) -> None:
        if depth > MAX_DEPTH and not any("recursion limit" in i.message for i in issues):
            issues.append(Issue(where, f"Global recursion limit exceeded: logical depth > {MAX_DEPTH}"))
        visited.add(node)
        on_path.add(node)
        kids = (c for c, _ in children.get(node, ()) if c in components and c != node)
        stack.append((node, depth, kids))

    enter(start, 0)
    while stack:
        node, depth, kids = stack[-1]
        child = next(kids, None)
        if child is None:
            on_path.discard(node)
            stack.pop()
        elif child not in visited:
            enter(child, depth + 1)
        elif child in on_path:
            issues.append(Issue(where, f"Circular reference detected involving component '{child}'"))
    return issues


def _cycles_outside(children: dict[str, list], components: dict, visited: set[str], where: str) -> list[Issue]:
    """web_core's in-progress ``detectCycles``: a walk from every component not yet visited, in id order."""
    issues: list[Issue] = []
    for cid in sorted(components):
        if cid not in visited:
            issues += _walk(children, components, visited, where, cid)
    return issues


def check_cycles(surface_id: str, components: dict[str, dict], refs: dict[str, RefFields], path: str) -> list[Issue]:
    """Self-references and cycles of a surface whose tree is not checked (assumed to exist, web_core applies them)."""
    children = {cid: child_refs(comp, refs) for cid, comp in components.items()}
    where = f"{path} (surface '{surface_id}')"
    issues = [
        Issue(
            where,
            f"Circular reference detected: Component '{cid}' references itself in field '{fieldname}' "
            "(Self-reference detected)",
        )
        for cid, kids in children.items()
        for child, fieldname in kids
        if child == cid
    ]
    return issues + _cycles_outside(children, components, set(), where)
