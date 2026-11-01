"""A2UI payload checks around the schema: messages, versions, envelopes, surfaces (port of ``validatePayload`` and,
with a chat state, of ``RendererState``; SV-C28).

Semantics of ``@a2ui/agent`` 0.0.2 (RESEARCH §F.2) with Node's texts, but every problem is collected (CF-I4): each
message is an object stating ``v0.9``/``v0.9.1`` and exactly one message type, valid against its
``server_to_client.json`` branch (components through the catalog; a component update without ``component`` is checked
as the type the surface already holds); the messages are merged in order into the surfaces (``surfaces.py``: create,
delete, component and data-model updates, the whole tree of every touched surface, bound values); every message
passes web_core's nesting and path rules (``integrity.py``); every component passes ``validateComponent``'s id,
catalogId and nested-function rules (``components.py``) and the template rule (``bindings.py``). ``check(payload)``
is stateless (``validatePayload``: a surface the payload updates without creating is assumed to exist);
``step(payload, state)`` merges into a copy of a chat's ``SurfaceState`` (an unknown surface is an error) and
returns the merged state when valid. An issue several rules report at the same path is listed once.
"""

from dataclasses import dataclass
from typing import Any

from .bindings import binding_kinds, template_issues
from .components import ComponentRules
from .integrity import check_integrity
from .refs import SchemaRegistry
from .schema import Evaluator, Issue
from .surfaces import ACTIONS, COMPONENTS, Simulation, SurfaceState
from .topology import RefFields, ref_map

VERSIONS = ("v0.9", "v0.9.1")
RELEASE = "v0.9"


@dataclass(frozen=True)
class Step:
    issues: list[Issue]
    state: SurfaceState | None
    """The merged state (None when the payload is invalid: the chat keeps its state)."""


class PayloadChecker:
    def __init__(self, registry: SchemaRegistry) -> None:
        self.registry = registry
        self.refs: dict[str, RefFields] = ref_map(registry)
        self.kinds = binding_kinds(registry)
        self.rules = ComponentRules(registry)

    def check(self, payload: Any) -> list[Issue]:
        return self._run(payload, None).issues

    def step(self, payload: Any, state: SurfaceState) -> Step:
        return self._run(payload, state)

    def _run(self, payload: Any, state: SurfaceState | None) -> Step:
        messages = payload if isinstance(payload, list) else [payload]
        evaluator = Evaluator(self.registry)  # per payload: its memo holds this payload's objects only
        sim = Simulation(messages, state, self.registry.catalog_id, self.refs, self.kinds)
        issues: list[Issue] = []
        for index, message in enumerate(messages):
            integrity = check_integrity(index, message)
            issues += integrity.issues
            if integrity.too_deep:  # invalid anyway; skipping it bounds the recursion of the schema walk and copies
                continue
            issues += self._message(index, message, evaluator, sim.known_types(message))
            issues += sim.apply(index, message)
        issues += sim.finish()
        issues = list(dict.fromkeys(issues))
        return Step(issues, None if issues else sim.state)

    def _message(self, index: int, message: Any, evaluator: Evaluator, known: dict[str, str]) -> list[Issue]:
        path = f"messages[{index}]"
        if not isinstance(message, dict):
            return [Issue(path, f"Message {index} is not a JSON object.")]
        version = message.get("version")
        if version is None:
            return [Issue(path, f"Message {index} states no version, which {RELEASE} messages require.")]
        if not (isinstance(version, str) and version in VERSIONS):
            quoted = " or ".join(f"'{v}'" for v in sorted(VERSIONS))
            return [
                Issue(
                    path,
                    f"Message {index} states version '{_js_string(version)}', but the catalogs target "
                    f"{RELEASE}, whose messages state {quoted}.",
                )
            ]
        actions = [a for a in ACTIONS if a in message]
        if not actions:
            return [
                Issue(
                    path, f"Validation failed: unknown message type in envelope. Present keys: [{', '.join(message)}]"
                )
            ]
        if len(actions) > 1:
            return [
                Issue(
                    path,
                    f"one message holds {len(actions)} message types ({', '.join(actions)}); exactly one is allowed",
                )
            ]
        message = _typed(message, known) if actions[0] == COMPONENTS and known else message
        schema, doc = self.registry.message_schema(actions[0])
        issues = evaluator.check(schema, message, doc, path)
        body = message[actions[0]]
        components = body.get("components") if actions[0] == COMPONENTS and isinstance(body, dict) else None
        for i, comp in enumerate(components if isinstance(components, list) else ()):
            where = f"{path}.updateComponents.components[{i}]"
            issues += self.rules.check(comp, where, evaluator)
            issues += template_issues(comp, self.refs, where) if isinstance(comp, dict) else []
        return issues


def _typed(message: dict, known: dict[str, str]) -> dict:
    """The message with each component update that names no type checked as the type its surface holds (web_core
    ``validateComponent(comp, existing?.type)``)."""
    body = message[COMPONENTS]
    components = body.get("components") if isinstance(body, dict) else None
    if not isinstance(components, list):
        return message
    typed = [
        {**c, "component": known[c["id"]]}
        if isinstance(c, dict) and "component" not in c and isinstance(c.get("id"), str) and c["id"] in known
        else c
        for c in components
    ]
    return {**message, COMPONENTS: {**body, "components": typed}}


def _js_string(value: Any) -> str:
    """``String(value)`` for a JSON value as JavaScript prints it in Node's version message."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, dict):
        return "[object Object]"
    if isinstance(value, list):
        return ",".join(_js_string(v) for v in value)
    return str(value)
