"""Component rules of web_core 0.14 ``PayloadValidator.validateComponent`` beyond the schema (A3-04, A3-07).

``@a2ui/agent`` ``validatePayload`` runs it on every component of every ``updateComponents`` message:

- ``id``: missing, not a string or empty → Node's "Component '<type>' is missing an 'id'; …" (the schema's
  ``ComponentId`` is a plain string, so ``""`` passes it, and the renderer throws on it).
- envelope keys ``id``, ``component``, ``catalogId``, ``metadata`` are stripped before the property checks:
  ``metadata`` and a non-string ``catalogId`` are never checked (``refs.py`` opens them on every component), a
  string ``catalogId`` other than the bundled catalog is ``Catalog not found``.
- nested function calls (``validateNestedFunctions``): every object anywhere below the remaining properties whose
  ``call`` (else ``function``: JavaScript ``??``) is a non-empty string IS a call, whatever slot holds it (an action
  ``context`` value, a binding, another call's args): an unknown name → ``Unrecognized function '<name>'``; a known
  one → its ``args`` (missing or ``null`` → ``{}``) against the function's args schema (Zod strip semantics,
  ``refs.py``); more than ``MAX_FUNCTION_CALL_ARGS`` args → Node's limit text.
"""

from typing import Any

from .refs import SchemaRegistry
from .schema import Evaluator, Issue

ENVELOPE_KEYS = ("id", "component", "catalogId", "metadata")
MAX_FUNCTION_CALL_ARGS = 1000


def _js_template(value: Any) -> str:
    """``${value}`` of a component type in Node's text (absent → ``undefined``)."""
    if value is None:
        return "undefined"
    return value if isinstance(value, str) else str(value)


class ComponentRules:
    def __init__(self, registry: SchemaRegistry) -> None:
        self.registry = registry
        self.functions: dict[str, Any] = registry.catalog.get("functions", {})

    def check(self, comp: Any, path: str, evaluator: Evaluator) -> list[Issue]:
        if not isinstance(comp, dict):
            return []
        cid = comp.get("id")
        if not isinstance(cid, str) or not cid:
            kind = _js_template(comp.get("component"))
            return [Issue(path, f"Component '{kind}' is missing an 'id'; entries require a valid string 'id'.")]
        issues = []
        catalog_id = comp.get("catalogId")
        if isinstance(catalog_id, str) and catalog_id != self.registry.catalog_id:
            issues.append(Issue(f"{path}.catalogId", f"Catalog not found: {catalog_id}"))
        props = {k: v for k, v in comp.items() if k not in ENVELOPE_KEYS}
        return issues + self._calls(props, path, evaluator)

    def _calls(self, root: dict, path: str, evaluator: Evaluator) -> list[Issue]:
        """Iterative walk (depth is bounded by ``integrity.py`` before this runs)."""
        issues: list[Issue] = []
        stack: list[tuple[Any, str]] = [(v, f"{path}.{k}") for k, v in reversed(root.items())]
        while stack:
            value, where = stack.pop()
            if isinstance(value, list):
                stack.extend((item, f"{where}[{i}]") for i, item in reversed(list(enumerate(value))))
                continue
            if not isinstance(value, dict):
                continue
            key = "call" if value.get("call") is not None else "function"
            name = value.get(key)
            if isinstance(name, str) and name:
                issues += self._call(name, value, where, key, evaluator)
            stack.extend((v, f"{where}.{k}") for k, v in reversed(value.items()))
        return issues

    def _call(self, name: str, record: dict, where: str, key: str, evaluator: Evaluator) -> list[Issue]:
        args = record.get("args", {})
        if isinstance(args, dict) and len(args) > MAX_FUNCTION_CALL_ARGS:
            limit = f"exceeds maximum allowed arguments count ({MAX_FUNCTION_CALL_ARGS})"
            return [Issue(f"{where}.args", f"Function call '{name}' {limit}")]
        function = self.functions.get(name)
        if not isinstance(function, dict):
            return [Issue(f"{where}.{key}", f"Unrecognized function '{name}'")]
        schema = function.get("properties", {}).get("args")
        if schema is None:
            if "args" in record and not isinstance(args, dict):
                return [Issue(f"{where}.args", f"Validation failed for function '{name}': expected object")]
            return []
        return evaluator.check(schema, {} if args is None else args, self.registry.catalog_base, f"{where}.args")
