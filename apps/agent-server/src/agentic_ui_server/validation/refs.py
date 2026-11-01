"""Offline ``$ref`` resolution over the bundled schemas (RESEARCH §F.3).

Documents: ``catalog.json`` (the contract; also registered as ``https://a2ui.org/specification/v0_9/catalog.json``,
the name ``server_to_client.json`` and ``common_types.json`` use for "the active catalog"), the A2UI v0.9
``common_types.json`` and ``server_to_client.json``. A reference is resolved against the ``$id`` of the document
it appears in; fragments are JSON pointers. Nothing is fetched.

Node parity (P4-D2, A3-05): ``@a2ui/agent`` checks the catalog with the contract's Zod objects, which strip unknown
keys except where the Zod source says ``.strict()``: each component's top level and the theme. ``catalog.json``
closes nested objects too (the generator's ``spec`` closure: column/tab/option items, each function's call
envelope and its ``args``), so the registry opens every ``additionalProperties``/``unevaluatedProperties: false``
of ``catalog.json`` below a component's top level and in every function. The A2UI ``common_types.json`` closures
(DataBinding, Action, its event, CheckRule, the ChildList template) are strict in Node too and stay. The component
envelope keys ``catalogId`` and ``metadata`` are stripped by web_core before any check, so every component accepts
them (``components.py`` checks a string ``catalogId``). ``JSON_ONLY_KEYWORDS``: keywords web_core's ``spec()``
annotation writes into a function's JSON schema that its Zod object never checks (``length``/``numeric`` need
neither ``min`` nor ``max``, ``length`` bounds may be negative, ``openUrl`` takes any string); the registry drops
them (the agreement test recomputes this table from Node's annotations).
A2-M1, same contract: Node's v0.9 envelope accepts ``version`` ``v0.9`` or ``v0.9.1`` on every message (the
``loadAgentToRendererSchema`` rule for 0.9.x), and its Zod function calls take any ``returnType`` of the
common_types enum whatever the function or the slot returns; so ``version`` becomes that enum and the
per-function / per-slot ``returnType`` ``const`` becomes a ``$ref`` to the common ``FunctionCall`` enum.
"""

import copy
from functools import cached_property
from typing import Any
from urllib.parse import unquote, urldefrag, urljoin

from ..resources import CATALOG_RESOURCE, SCHEMA_RESOURCES, read_data_json

SPEC_BASE = "https://a2ui.org/specification/v0_9/"
CATALOG_ALIAS = SPEC_BASE + "catalog.json"
COMMON_TYPES_ID = SPEC_BASE + "common_types.json"


JSON_ONLY_KEYWORDS: dict[str, dict[str, tuple[str, ...]]] = {
    "length": {"": ("anyOf",), "min": ("minimum",), "max": ("minimum",)},
    "numeric": {"": ("anyOf",)},
    "openUrl": {"url": ("format",)},
}
"""function → args field ("" = the args object) → keywords Zod does not check."""


class SchemaError(LookupError):
    """A ``$ref`` names a document or pointer the bundle does not hold (a broken contract, not a bad payload)."""


NODE_VERSIONS = ["v0.9", "v0.9.1"]
RETURN_TYPES = COMMON_TYPES_ID + "#/$defs/FunctionCall/properties/returnType"


def _node_parity(node: Any) -> None:
    """A2-M1: ``version`` const → Node's v0.9.x enum; a ``returnType`` ``const`` → the common_types enum."""
    if isinstance(node, list):
        for item in node:
            _node_parity(item)
        return
    if not isinstance(node, dict):
        return
    props = node.get("properties")
    if isinstance(props, dict):
        if isinstance(props.get("version"), dict) and "const" in props["version"]:
            props["version"] = {"enum": list(NODE_VERSIONS)}
        if isinstance(props.get("returnType"), dict) and set(props["returnType"]) == {"const"}:
            props["returnType"] = {"$ref": RETURN_TYPES}
    for value in node.values():
        _node_parity(value)


def _open_closures(node: Any) -> None:
    """Zod's strip mode: ``additionalProperties``/``unevaluatedProperties: false`` → open, everywhere in ``node``."""
    if isinstance(node, list):
        for item in node:
            _open_closures(item)
        return
    if not isinstance(node, dict):
        return
    for keyword in ("additionalProperties", "unevaluatedProperties"):
        if node.get(keyword) is False:
            del node[keyword]
    for value in node.values():
        _open_closures(value)


def _drop_json_only(name: str, function: Any) -> None:
    args = function.get("properties", {}).get("args") if isinstance(function, dict) else None
    for field, keywords in JSON_ONLY_KEYWORDS.get(name, {}).items():
        node = args if field == "" else (args or {}).get("properties", {}).get(field)
        for keyword in keywords if isinstance(node, dict) else ():
            node.pop(keyword, None)


class SchemaRegistry:
    def __init__(self, catalog: dict[str, Any], *schemas: dict[str, Any]) -> None:
        catalog = copy.deepcopy(catalog)
        schemas = tuple(copy.deepcopy(doc) for doc in schemas)
        for component in catalog.get("components", {}).values():
            for part in component.values() if isinstance(component, dict) else ():
                _open_closures(part)
            if isinstance(component, dict):
                component["properties"] = {**component.get("properties", {}), "catalogId": True, "metadata": True}
        for name, function in catalog.get("functions", {}).items():
            _open_closures(function)
            _drop_json_only(name, function)
        for doc in (catalog, *schemas):
            _node_parity(doc)
        self.catalog = catalog
        self.docs: dict[str, Any] = {doc["$id"]: doc for doc in schemas}
        self.docs[CATALOG_ALIAS] = catalog
        if isinstance(catalog.get("$id"), str):
            self.docs[catalog["$id"]] = catalog

    @classmethod
    def bundled(cls) -> "SchemaRegistry":
        return cls(read_data_json(CATALOG_RESOURCE), *(read_data_json(name) for name in SCHEMA_RESOURCES))

    @property
    def catalog_id(self) -> str:
        return self.catalog["catalogId"]

    @cached_property
    def catalog_base(self) -> str:
        return self.catalog.get("$id") or CATALOG_ALIAS

    def resolve(self, ref: str, base: str) -> tuple[Any, str]:
        """``(schema, document id)`` of ``ref`` written in the document ``base``."""
        # urljoin ignores fragment-only references against a urn: base (the catalog $id), so join those directly
        doc_id, fragment = (base, ref[1:]) if ref.startswith("#") else urldefrag(urljoin(base, ref))
        if doc_id not in self.docs:
            raise SchemaError(f"$ref {ref!r} (in {base}): unknown document {doc_id}")
        node = self.docs[doc_id]
        for token in (t for t in unquote(fragment).split("/") if t):
            key = token.replace("~1", "/").replace("~0", "~")
            try:
                node = node[int(key)] if isinstance(node, list) else node[key]
            except (KeyError, IndexError, ValueError) as exc:
                raise SchemaError(f"$ref {ref!r} (in {base}): no {fragment}") from exc
        return node, doc_id

    def component(self, name: str) -> Any:
        return self.catalog["components"].get(name)

    def message_schema(self, action: str) -> tuple[Any, str]:
        """The ``server_to_client.json`` branch for one message type (``createSurface`` → its ``$defs`` entry)."""
        envelope = self.docs[SPEC_BASE + "server_to_client.json"]
        for branch in envelope["oneOf"]:
            schema, doc = (
                self.resolve(branch["$ref"], envelope["$id"]) if "$ref" in branch else (branch, envelope["$id"])
            )
            if action in schema.get("properties", {}) and action in schema.get("required", ()):
                return schema, doc
        raise SchemaError(f"server_to_client.json has no message type {action!r}")
