"""Setting values from text (env, ``--set``, flags) and TOML, coerced by the kind each field declares (SV-C4).

Errors name the key (``ConfigError``). ``SCHEMA`` maps every dotted key to its dataclass field.
"""

import dataclasses
import json
import shlex
from collections.abc import Mapping
from types import MappingProxyType
from typing import Any

from .settings import Settings


class ConfigError(ValueError):
    """A setting is unknown or has a bad value; the message names the key."""


def _schema(cls: type, prefix: str = "") -> dict[str, dataclasses.Field]:
    out: dict[str, dataclasses.Field] = {}
    for f in dataclasses.fields(cls):
        if f.name == "environ":
            continue
        if f.metadata["kind"] == "section":
            out.update(_schema(f.metadata["cls"], f"{prefix}{f.name}."))
        else:
            out[prefix + f.name] = f
    return out


SCHEMA = _schema(Settings)
SECTIONS = {key.rsplit(".", 1)[0] for key in SCHEMA} | {"agent.env_names"}
_TRUE, _FALSE = {"1", "true", "yes", "on"}, {"0", "false", "no", "off"}


def from_text(key: str, text: str) -> Any:
    kind = SCHEMA[key].metadata["kind"]
    try:
        if kind == "int":
            return int(text)
        if kind == "float":
            return float(text)
        if kind == "bool":
            if text.strip().lower() not in _TRUE | _FALSE:
                raise ValueError("expected a boolean (true/false, 1/0, yes/no, on/off)")
            return text.strip().lower() in _TRUE
        if kind == "args":
            return tuple(shlex.split(text))
        if kind == "list":
            return tuple(part.strip() for part in text.split(",") if part.strip())
        if kind == "json":
            return _json_object(text)
        if kind == "map":
            pairs = [part.split("=", 1) for part in text.split(",") if part.strip()]
            if any(len(pair) != 2 for pair in pairs):
                raise ValueError("expected K=V,K=V")
            return MappingProxyType({k.strip(): v.strip() for k, v in pairs})
        return text
    except ValueError as exc:  # int()/float() messages quote the text, which may be a secret: report the kind only
        raise ConfigError(f"{key}: {f'expected {kind}' if kind in ('int', 'float') else exc}") from exc


def from_toml(key: str, value: Any) -> Any:
    kind = SCHEMA[key].metadata["kind"]
    if kind in ("str", "path") and isinstance(value, str):
        return value
    if kind == "bool" and isinstance(value, bool):
        return value
    if kind == "int" and isinstance(value, int) and not isinstance(value, bool):
        return value
    if kind == "float" and isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if kind in ("args", "list") and isinstance(value, list) and all(isinstance(v, str) for v in value):
        return tuple(value)
    if kind == "json" and isinstance(value, (dict, str)):
        try:
            return _json_object(value if isinstance(value, str) else json.dumps(value))
        except ValueError as exc:
            raise ConfigError(f"{key}: {exc}") from exc
    if (
        kind == "map"
        and isinstance(value, dict)
        and all(isinstance(v, (str, int, float, bool)) for v in value.values())
    ):
        return MappingProxyType({k: (str(v).lower() if isinstance(v, bool) else str(v)) for k, v in value.items()})
    raise ConfigError(f"{key}: expected {kind}, got {type(value).__name__}")  # never the value: it may be a key


def _json_object(text: str) -> str:
    """A JSON object as canonical text (``""`` = none)."""
    if not text.strip():
        return ""
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("expected a JSON object")
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def flatten_toml(table: Mapping[str, Any], prefix: str, out: dict[str, Any]) -> None:
    for name, value in table.items():
        key = prefix + name
        if key in SCHEMA:
            out[key] = from_toml(key, value)
        elif key in SECTIONS and isinstance(value, dict):
            flatten_toml(value, key + ".", out)
        else:
            raise ConfigError(f"{key}: unknown setting")
