"""JSON Schema 2020-12 subset evaluator for the bundled contract, reporting every issue (RESEARCH §F.3, CF-I4).

Keywords (the ones catalog.json, common_types.json and server_to_client.json use): ``$ref`` (with siblings),
``type``, ``const``, ``enum``, ``properties``, ``required``, ``additionalProperties``, ``items``, ``minItems``,
``minimum``, ``maximum``, ``pattern``, ``format: uri``, ``allOf``, ``anyOf``, ``oneOf`` (exactly one) and
``unevaluatedProperties`` with evaluated-property tracking through ``$ref``/``allOf``/``anyOf``/``oneOf`` (only
passing alternatives count). A schema keyword outside this set raises ``SchemaError``: an unknown rule is never
silently accepted (SV-C7). When no alternative of a ``oneOf``/``anyOf`` passes, the issues of the closest one are
reported (``discriminator``/``const`` match first, then type match, then fewest issues).
"""

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from .refs import SchemaError, SchemaRegistry
from .values import is_type, json_equal, json_type

APPLIED = frozenset(
    {"$ref", "type", "const", "enum", "properties", "required", "additionalProperties", "items", "minItems"}
    | {"minimum", "maximum", "pattern", "format", "allOf", "anyOf", "oneOf", "unevaluatedProperties"}
)
ANNOTATIONS = frozenset({"description", "title", "default", "examples", "$schema", "$id", "$defs", "discriminator"})
URI_RE = re.compile(r"[A-Za-z][A-Za-z0-9+.-]*:\S*")


@dataclass(frozen=True)
class Issue:
    path: str
    message: str


@lru_cache(maxsize=64)
def _js_pattern(pattern: str) -> re.Pattern[str]:
    # JavaScript `$` (no m flag) matches only at the very end; Python's also before a final newline.
    if pattern.endswith("$") and not pattern.endswith("\\$"):
        pattern = pattern[:-1] + r"\Z"
    return re.compile(pattern)


def _show(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


class Evaluator:
    """One evaluator per payload: results are memoized per (schema, instance, path), so the alternatives of nested
    ``anyOf``/``oneOf`` (function calls inside function arguments) cost linear, not exponential, time."""

    def __init__(self, registry: SchemaRegistry) -> None:
        self.registry = registry
        self._memo: dict[tuple[int, int, str, str], tuple[list[Issue], set[str]]] = {}

    def check(self, schema: Any, instance: Any, base: str, path: str) -> list[Issue]:
        return self.evaluate(schema, instance, base, path)[0]

    def evaluate(self, schema: Any, inst: Any, base: str, path: str) -> tuple[list[Issue], set[str]]:
        """``(issues, evaluated property names)`` of ``inst`` against ``schema`` (document ``base``); fresh copies."""
        key = (id(schema), id(inst), base, path)
        if key not in self._memo:
            self._memo[key] = self._evaluate(schema, inst, base, path)
        issues, seen = self._memo[key]
        return list(issues), set(seen)

    def _evaluate(self, schema: Any, inst: Any, base: str, path: str) -> tuple[list[Issue], set[str]]:
        if schema is True:
            return [], set()
        if schema is False:
            return [Issue(path, "is not allowed here")], set()
        unknown = set(schema) - APPLIED - ANNOTATIONS
        if unknown:
            raise SchemaError(f"unsupported schema keyword(s) {sorted(unknown)} in {base}")
        issues: list[Issue] = []
        seen: set[str] = set()
        if "$ref" in schema:
            sub, sub_base = self.registry.resolve(schema["$ref"], base)
            issues, seen = self.evaluate(sub, inst, sub_base, path)
        if "type" in schema and not is_type(inst, schema["type"]):
            wanted = schema["type"] if isinstance(schema["type"], str) else " or ".join(schema["type"])
            return [*issues, Issue(path, f"expected {wanted}, got {json_type(inst)}")], seen
        if "const" in schema and not json_equal(inst, schema["const"]):
            issues.append(Issue(path, f"must be {_show(schema['const'])}, got {_show(inst)}"))
        if "enum" in schema and not any(json_equal(inst, item) for item in schema["enum"]):
            allowed = ", ".join(_show(item) for item in schema["enum"])
            issues.append(Issue(path, f"must be one of {allowed}; got {_show(inst)}"))
        if isinstance(inst, dict):
            issues += self._object(schema, inst, base, path, seen)
        elif isinstance(inst, list):
            issues += self._array(schema, inst, base, path)
        elif isinstance(inst, str):
            issues += self._string(schema, inst, path)
        elif is_type(inst, "number"):
            if "minimum" in schema and inst < schema["minimum"]:
                issues.append(Issue(path, f"must be >= {schema['minimum']}, got {_show(inst)}"))
            if "maximum" in schema and inst > schema["maximum"]:
                issues.append(Issue(path, f"must be <= {schema['maximum']}, got {_show(inst)}"))
        for sub in schema.get("allOf", ()):
            sub_issues, sub_seen = self.evaluate(sub, inst, base, path)
            issues += sub_issues
            seen |= sub_seen
        for keyword in ("anyOf", "oneOf"):
            if keyword in schema:
                issues += self._alternatives(schema, keyword, inst, base, path, seen)
        if "unevaluatedProperties" in schema and isinstance(inst, dict):
            rest = schema["unevaluatedProperties"]
            for key in inst:
                if key not in seen:
                    sub_path = f"{path}.{key}"
                    issues += (
                        [Issue(sub_path, f"unknown property '{key}'")]
                        if rest is False
                        else self.check(rest, inst[key], base, sub_path)
                    )
            seen |= set(inst)
        return issues, seen

    def _object(self, schema: dict, inst: dict, base: str, path: str, seen: set[str]) -> list[Issue]:
        issues = []
        props = schema.get("properties", {})
        for key, sub in props.items():
            if key in inst:
                issues += self.check(sub, inst[key], base, f"{path}.{key}")
                seen.add(key)
        issues += [
            Issue(path, f"missing required property '{key}'") for key in schema.get("required", ()) if key not in inst
        ]
        if "additionalProperties" in schema:
            extra = schema["additionalProperties"]
            for key in inst:
                if key not in props:
                    sub_path = f"{path}.{key}"
                    issues += (
                        [Issue(sub_path, f"unknown property '{key}'")]
                        if extra is False
                        else self.check(extra, inst[key], base, sub_path)
                    )
                    seen.add(key)
        return issues

    def _array(self, schema: dict, inst: list, base: str, path: str) -> list[Issue]:
        issues = []
        if "minItems" in schema and len(inst) < schema["minItems"]:
            issues.append(Issue(path, f"must have at least {schema['minItems']} item(s), got {len(inst)}"))
        if "items" in schema:
            for index, item in enumerate(inst):
                issues += self.check(schema["items"], item, base, f"{path}[{index}]")
        return issues

    def _string(self, schema: dict, inst: str, path: str) -> list[Issue]:
        issues = []
        if "pattern" in schema and not _js_pattern(schema["pattern"]).search(inst):
            issues.append(Issue(path, f"must match the pattern {schema['pattern']}, got {_show(inst)}"))
        if schema.get("format") == "uri" and not URI_RE.fullmatch(inst):
            issues.append(Issue(path, f"must be an absolute URI, got {_show(inst)}"))
        return issues

    def _alternatives(self, schema: dict, keyword: str, inst: Any, base: str, path: str, seen: set[str]) -> list[Issue]:
        branches = schema[keyword]
        if "discriminator" in schema and isinstance(inst, dict):
            return self._discriminated(schema, branches, inst, base, path, seen)
        results = [self.evaluate(branch, inst, base, path) for branch in branches]
        passing = [result for result in results if not result[0]]
        if keyword == "oneOf" and len(passing) > 1:
            return [Issue(path, f"matches {len(passing)} alternatives of a oneOf; exactly one is allowed")]
        if passing:
            for _, branch_seen in passing:
                seen |= branch_seen
            return []
        return self._closest(schema, branches, results, inst, base, path)

    def _closest(self, schema: dict, branches: list, results: list, inst: Any, base: str, path: str) -> list[Issue]:
        def type_mismatch(issues: list[Issue]) -> bool:
            return any(i.path == path and i.message.startswith("expected ") for i in issues)

        def matches_consts(branch: Any) -> bool:
            consts = self._consts(branch, base)
            return (
                isinstance(inst, dict)
                and any(k in inst for k in consts)
                and all(json_equal(inst[k], v) for k, v in consts.items() if k in inst)
            )

        shared = set.intersection(*(set(self._consts(b, base)) for b in branches)) if branches else set()
        for key in sorted(shared):
            if isinstance(inst, dict) and key in inst and not any(matches_consts(b) for b in branches):
                what = "Unrecognized function" if key == "call" else f"Unknown {key}"
                return [Issue(f"{path}.{key}", f"{what} '{inst[key]}'")]
        indexed = list(enumerate(results))
        named = [pair for pair in indexed if matches_consts(branches[pair[0]])]
        typed = [pair for pair in indexed if not type_mismatch(pair[1][0])]
        pool = named or typed
        if not pool:
            labels = ", ".join(self._label(branch) for branch in branches)
            return [Issue(path, f"must be one of: {labels}; got {json_type(inst)}")]
        return min(pool, key=lambda pair: len(pair[1][0]))[1][0]

    def _discriminated(self, schema: dict, branches: list, inst: dict, base: str, path: str, seen: set) -> list[Issue]:
        """``discriminator.propertyName`` picks the one branch whose const it equals (A2UI: ``component``)."""
        prop = schema["discriminator"]["propertyName"]
        if prop not in inst:
            return [Issue(path, f"missing required property '{prop}'")]
        chosen = [b for b in branches if json_equal(self._consts(b, base).get(prop, object()), inst[prop])]
        if len(chosen) != 1:
            where = f"not found in catalog '{self.registry.catalog_id}'"
            return [Issue(f"{path}.{prop}", f"Unknown component type '{inst[prop]}' {where}")]
        issues, branch_seen = self.evaluate(chosen[0], inst, base, path)
        seen |= branch_seen
        return issues

    def _consts(self, schema: Any, base: str, depth: int = 0) -> dict[str, Any]:
        if not isinstance(schema, dict) or depth > 4:
            return {}
        out = {k: v["const"] for k, v in schema.get("properties", {}).items() if isinstance(v, dict) and "const" in v}
        if "$ref" in schema:
            out |= self._consts(*self.registry.resolve(schema["$ref"], base), depth + 1)
        for sub in schema.get("allOf", ()):
            out |= self._consts(sub, base, depth + 1)
        return out

    @staticmethod
    def _label(branch: Any) -> str:
        if isinstance(branch, dict) and "$ref" in branch:
            return branch["$ref"].rsplit("/", 1)[-1]
        if isinstance(branch, dict) and "type" in branch:
            return str(branch["type"])
        refs = [Evaluator._label(sub) for sub in branch.get("allOf", ())] if isinstance(branch, dict) else []
        return "+".join(refs) or "an alternative"
