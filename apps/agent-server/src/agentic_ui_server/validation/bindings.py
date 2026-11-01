"""Bound values vs what each prop expects, and template lists (project rules beyond web_core; A4-26, A4-27).

web_core renders whatever a binding resolves to, and React crashes on some of it (a Button ``label`` bound to an
object, an Avatar ``name`` bound to an array), replacing the whole preview. So, on the merged state of a surface:

- ``check_bindings``: walking the tree from ``root`` the way the renderer instantiates it (a ChildList template
  ``{componentId, path}`` renders its component once per array item, in the item's data context; at most
  ``MAX_TEMPLATE_ITEMS`` items per list and ``MAX_VISITS`` component instances are checked), a prop whose schema is
  ``DynamicString``/``DynamicNumber``/``DynamicBoolean`` bound with ``{path}`` to an object or an array is an
  error (also inside the items of a literal array prop: ``Tabs.tabs[].title``, A5-02), a row list
  (``ROW_LISTS``: ``Table.rows``) bound to anything but an array of objects is an error (the kit drops it, A5-02),
  and a template whose path holds something other than an array (or nothing yet) is an error. Each
  component/prop is reported once. Values that arrive later (inputs, the next ``updateDataModel``) are the
  renderer's own business (it coerces bound text).
- ``template_issues``: a template path ``""`` or ``"."`` (the whole data context, never an array) is an error.

The page store runs the same rules (``packages/ui-kit-one-catalog/src/project-rules.ts``, A5-01); the agreement
suites compare the two.
"""

from collections.abc import Iterator
from typing import Any

from . import datamodel
from .refs import COMMON_TYPES_ID, SchemaRegistry
from .schema import Issue
from .topology import ROOT_ID, RefFields, component_props, pointers

KINDS = {"DynamicString": "a string", "DynamicNumber": "a number", "DynamicBoolean": "a boolean"}
ROW_LISTS = {"Table": ("rows",)}
"""DynamicValue props the kit renders only from an array of objects (table.tsx drops anything else; A5-02)."""
ROW_KIND = "an array of objects"
MAX_TEMPLATE_ITEMS = 100
MAX_VISITS = 5000
BindingKinds = dict[str, dict[str, str]]
"""component type → prop (``tabs[].title`` = ``title`` of every item of ``tabs``) → the kind it needs."""


def binding_kinds(registry: SchemaRegistry) -> BindingKinds:
    prefix = COMMON_TYPES_ID + "#/$defs/"
    out: BindingKinds = {}

    def kind_of(sub: Any) -> str | None:
        ref = sub.get("$ref") if isinstance(sub, dict) else None
        return KINDS.get(ref[len(prefix) :]) if isinstance(ref, str) and ref.startswith(prefix) else None

    for name, schema in registry.catalog["components"].items():
        kinds = {}
        props = component_props(schema)
        for prop, sub in props.items():
            if kind := kind_of(sub):
                kinds[prop] = kind
            if isinstance(sub, dict) and sub.get("type") == "array":
                for key, item in component_props(sub.get("items")).items():
                    if item_kind := kind_of(item):
                        kinds[f"{prop}[].{key}"] = item_kind
        kinds |= {prop: ROW_KIND for prop in ROW_LISTS.get(name, ()) if prop in props}
        if kinds:
            out[name] = kinds
    return out


def _template(value: Any) -> bool:
    return isinstance(value, dict) and isinstance(value.get("componentId"), str) and isinstance(value.get("path"), str)


def _type_name(value: Any) -> str | None:
    return "an object" if isinstance(value, dict) else "an array" if isinstance(value, list) else None


def _misfit(kind: str, held: Any) -> str | None:
    """What ``held`` (a bound value) is when it does not fit a prop that needs ``kind``; ``None`` when it fits."""
    if held is datamodel.UNDEFINED or held is None:
        return None
    if kind != ROW_KIND:
        return _type_name(held)
    if isinstance(held, list):
        return None if all(isinstance(item, dict) for item in held) else "an array with a non-object item"
    return _type_name(held) or "a single value"


def _bindings(comp: dict, kinds: dict[str, str]) -> Iterator[tuple[str, str, str]]:
    """The ``{path}`` bindings of ``comp`` that ``kinds`` names: (label, path, kind)."""

    def bound(value: Any) -> bool:
        return isinstance(value, dict) and set(value) == {"path"} and isinstance(value["path"], str)

    for key, kind in kinds.items():
        prop, _, sub = key.partition("[].")
        if not sub:
            if bound(comp.get(prop)):
                yield prop, comp[prop]["path"], kind
        elif isinstance(comp.get(prop), list):
            for i, item in enumerate(comp[prop]):
                if isinstance(item, dict) and bound(item.get(sub)):
                    yield f"{prop}[{i}].{sub}", item[sub]["path"], kind


def _read(data: Any, path: str) -> Any:
    try:
        return datamodel.get(data, path)
    except datamodel.DataModelError:  # a forbidden segment: reported by integrity.py
        return datamodel.UNDEFINED


def template_issues(comp: dict, refs: dict[str, RefFields], path: str) -> list[Issue]:
    ctype = comp.get("component")
    fields = refs.get(ctype) if isinstance(ctype, str) else None
    if fields is None:
        return []
    return [
        Issue(
            f"{path}.{key}.path",
            "a template list needs the path of an array in the data model, not the "
            f"whole data context ('{comp[key]['path']}')",
        )
        for key in sorted(fields.lists)
        if _template(comp.get(key)) and comp[key]["path"] in ("", ".")
    ]


def _children(comp: dict, fields: RefFields | None, ctx: str, data: Any, problems: list) -> Iterator[tuple[str, str]]:
    for key in sorted(fields.single | fields.lists) if fields else ():
        value = comp.get(key)
        if not _template(value):
            yield from ((child, ctx) for child, _ in pointers(value, key, fields.nested.get(key)))
            continue
        list_path = datamodel.resolve(value["path"], ctx)
        items = _read(data, list_path)
        if isinstance(items, list):
            for i in range(min(len(items), MAX_TEMPLATE_ITEMS)):
                yield value["componentId"], datamodel.resolve(str(i), list_path)
        elif items is not datamodel.UNDEFINED and items is not None:
            problems.append((key, list_path, items))


def check_bindings(
    surface_id: str, components: dict[str, dict], data: Any, refs: dict[str, RefFields], kinds: BindingKinds, where: str
) -> list[Issue]:
    if ROOT_ID not in components:
        return []
    issues, reported, seen, visits = [], set(), set(), 0
    stack = [(ROOT_ID, "/")]
    at = f"{where} (surface '{surface_id}')"
    while stack and visits < MAX_VISITS:
        cid, ctx = stack.pop()
        comp = components.get(cid)
        if comp is None or (cid, ctx) in seen:
            continue
        seen.add((cid, ctx))
        visits += 1
        ctype = comp.get("component") if isinstance(comp.get("component"), str) else None
        for prop, path, kind in _bindings(comp, kinds.get(ctype, {})):
            bound = datamodel.resolve(path, ctx)
            held = _misfit(kind, _read(data, bound))
            if held and (cid, prop) not in reported:
                reported.add((cid, prop))
                issues.append(
                    Issue(
                        at,
                        f"Component '{cid}' binds '{prop}' to '{bound}', which holds {held}; '{prop}' needs "
                        f"{kind}: bind it to a field of that value or change the data model",
                    )
                )
        problems: list = []
        kids = list(_children(comp, refs.get(ctype) if ctype else None, ctx, data, problems))
        for key, list_path, items in problems:
            if (cid, key) not in reported:
                reported.add((cid, key))
                held = _type_name(items) or "a single value"
                issues.append(
                    Issue(
                        at,
                        f"Component '{cid}' repeats a template over '{list_path}', which holds "
                        f"{held}; a template list needs an array there",
                    )
                )
        stack.extend(reversed(kids))
    return issues
