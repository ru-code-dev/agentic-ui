"""JSON value semantics the schema evaluator needs: equality, type names and type tests as JSON Schema defines them."""

from typing import Any

JSON_TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


def json_equal(a: Any, b: Any) -> bool:
    """JSON value equality: booleans never equal numbers, 1 == 1.0."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(json_equal(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(json_equal(x, y) for x, y in zip(a, b, strict=True))
    if isinstance(a, int | float) and isinstance(b, int | float):
        return a == b
    return type(a) is type(b) and a == b


def json_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int | float):
        return "integer" if isinstance(value, int) or value.is_integer() else "number"
    return next((name for name, cls in JSON_TYPES.items() if isinstance(value, cls)), type(value).__name__)


def is_type(value: Any, wanted: str | list[str]) -> bool:
    if isinstance(wanted, list):
        return any(is_type(value, w) for w in wanted)
    if wanted in ("number", "integer"):
        ok = isinstance(value, int | float) and not isinstance(value, bool)
        return ok and (wanted == "number" or float(value).is_integer())
    return isinstance(value, JSON_TYPES[wanted]) and not (wanted != "boolean" and isinstance(value, bool))
