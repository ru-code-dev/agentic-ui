"""The one settings source (SV-C4, PLAN §2.1).

Precedence: defaults < TOML file (``--config`` or ``AGENTIC_UI_CONFIG``) < env ``AGENTIC_UI_*`` < CLI flags.
This is the only module that reads ``os.environ``; everything else receives the frozen ``Settings``.
CLI shape and env registry mirror ru-code (RESEARCH §A.1-§A.5).
"""

import argparse
import dataclasses
import logging
import os
import re
import tomllib
from collections.abc import Mapping
from pathlib import Path
from types import MappingProxyType
from typing import Any

from .config_values import SCHEMA, ConfigError, flatten_toml, from_text
from .log import is_secret_name, mask_args, register_settings_secrets
from .settings import (
    AgentSettings,
    EnvNameSettings,
    LimitSettings,
    LogSettings,
    RepairSettings,
    ReplySettings,
    ServerSettings,
    Settings,
    TimeoutSettings,
)

__all__ = [
    "SCHEMA",
    "AgentSettings",
    "ConfigError",
    "EnvNameSettings",
    "LimitSettings",
    "LogSettings",
    "RepairSettings",
    "ReplySettings",
    "ServerSettings",
    "Settings",
    "TimeoutSettings",
    "add_arguments",
    "describe",
    "load_settings",
    "settings_from_args",
]


_BASE = re.compile(r"^(/|https?://[^/\s]+(/|$))\S*$")
_FLAGS = {
    "host": "server.host",
    "port": "server.port",
    "agent_bin": "agent.bin",
    "agent_home": "agent.home",
    "log_level": "log.level",
}


def add_arguments(parser: argparse.ArgumentParser) -> None:
    """Add the config flags to a CLI parser (``__main__`` adds its mode flags next to them)."""
    group = parser.add_argument_group("settings")
    group.add_argument("--config", metavar="PATH", help="TOML settings file")
    group.add_argument("--host")
    group.add_argument("--port")
    group.add_argument("--agent-bin")
    group.add_argument("--agent-home")
    group.add_argument("--log-level")
    group.add_argument(
        "--set", action="append", default=[], metavar="KEY=VALUE", help="any setting, e.g. limits.max_live_agents=2"
    )


def settings_from_args(args: argparse.Namespace, environ: Mapping[str, str] | None = None) -> Settings:
    env = dict(os.environ if environ is None else environ)
    values: dict[str, Any] = {
        key: f.default_factory() if f.default is dataclasses.MISSING else f.default for key, f in SCHEMA.items()
    }
    config_path = args.config or env.get("AGENTIC_UI_CONFIG")
    if config_path:
        try:
            flatten_toml(tomllib.loads(Path(config_path).read_text(encoding="utf-8")), "", values)
        except (OSError, tomllib.TOMLDecodeError) as exc:
            raise ConfigError(f"config file {config_path}: {exc}") from exc
    # A6-03: a relative bin from the TOML file is relative to its folder; from env / flag / --set, to the cwd.
    bin_base = Path(config_path).parent if config_path else Path()
    for key, f in SCHEMA.items():
        if f.metadata["env"] and f.metadata["env"] in env:
            values[key] = from_text(key, env[f.metadata["env"]])
            bin_base = Path() if key == "agent.bin" else bin_base
    for flag, key in _FLAGS.items():
        if getattr(args, flag, None) is not None:
            values[key] = from_text(key, getattr(args, flag))
            bin_base = Path() if key == "agent.bin" else bin_base
    for item in args.set:
        key, sep, text = item.partition("=")
        if not sep or key.strip() not in SCHEMA:
            raise ConfigError(f"{key.strip()}: unknown setting (--set KEY=VALUE)")
        values[key.strip()] = from_text(key.strip(), text)
        bin_base = Path() if key.strip() == "agent.bin" else bin_base
    _resolve_paths(values, env, bin_base)
    settings = dataclasses.replace(_build(Settings, values, ""), environ=MappingProxyType(env))
    _validate(settings)
    register_settings_secrets(settings)  # A2-M4: before anything can log them (startup line, first spawn)
    return settings


def load_settings(argv: list[str] | None = None, environ: Mapping[str, str] | None = None) -> Settings:
    """Parse config flags from ``argv`` and merge all sources; ``environ`` defaults to ``os.environ``."""
    parser = argparse.ArgumentParser(add_help=False)
    add_arguments(parser)
    return settings_from_args(parser.parse_args(argv or []), environ)


def describe(settings: Settings) -> dict[str, Any]:
    """Effective settings for the startup log: no process env, secret-looking ``agent.env`` values masked."""

    def plain(obj: Any) -> Any:
        if dataclasses.is_dataclass(obj):
            return {f.name: plain(getattr(obj, f.name)) for f in dataclasses.fields(obj) if f.name != "environ"}
        return dict(obj) if isinstance(obj, Mapping) else list(obj) if isinstance(obj, tuple) else obj

    out = plain(settings)
    out["agent"]["env"] = {k: ("***" if is_secret_name(k) else v) for k, v in settings.agent.env.items()}
    for key in ("base_args", "extra_args"):
        out["agent"][key] = mask_args(out["agent"][key])
    return out


def _resolve_paths(values: dict[str, Any], env: Mapping[str, str], bin_base: Path) -> None:
    home = Path(env.get("HOME") or Path.home())
    for key, f in SCHEMA.items():
        if f.metadata["kind"] == "path" and values[key].startswith("~"):
            values[key] = str(home / values[key][1:].lstrip("/"))
    agent_bin = values["agent.bin"]
    if agent_bin.startswith("~"):
        agent_bin = str(home / agent_bin[1:].lstrip("/"))
    # A6-03: a path (not a command on PATH) is made absolute once, so spawn (cwd = the chat dir),
    # --check-agent and /health all use the same file.
    if os.sep in agent_bin or (os.altsep and os.altsep in agent_bin):
        agent_bin = os.path.abspath(bin_base / agent_bin)
    values["agent.bin"] = agent_bin
    state = Path(env.get("XDG_STATE_HOME") or home / ".local" / "state")
    cache = Path(env.get("XDG_CACHE_HOME") or home / ".cache")
    values["agent.work_root"] = values["agent.work_root"] or str(state / "agentic-ui-server" / "chats")
    values["agent.cache_dir"] = values["agent.cache_dir"] or str(cache / "agentic-ui-server")


def _build(cls: type, values: Mapping[str, Any], prefix: str) -> Any:
    kwargs = {}
    for f in dataclasses.fields(cls):
        if f.name == "environ":
            continue
        key = prefix + f.name
        kwargs[f.name] = (
            _build(f.metadata["cls"], values, key + ".") if f.metadata["kind"] == "section" else values[key]
        )
    return cls(**kwargs)


def _validate(s: Settings) -> None:
    checks = [
        ("server.port", 0 <= s.server.port <= 65535, "must be 0..65535"),
        ("server.base_path", _BASE.match(s.server.base_path) is not None, "must be a path ('/api') or an http(s) URL"),
        ("agent.bin", bool(s.agent.bin), "must not be empty"),
        ("agent.model_apply", s.agent.model_apply in ("session", "every_turn"), "must be 'session' or 'every_turn'"),
        ("log.level", isinstance(logging.getLevelName(s.log.level.upper()), int), "unknown log level"),
        ("repair.max_attempts", s.repair.max_attempts >= 0, "must be >= 0"),
        ("reply.ui", s.reply.ui in ("always", "auto"), "must be 'always' or 'auto'"),
        ("reply.fallback", s.reply.fallback in ("surface", "text"), "must be 'surface' or 'text'"),
        ("reply.surfaces", s.reply.surfaces in ("many", "single"), "must be 'many' or 'single'"),
        ("limits.max_live_agents", s.limits.max_live_agents >= 1, "must be >= 1"),
        ("limits.max_queue_per_chat", s.limits.max_queue_per_chat >= 0, "must be >= 0"),
        ("limits.max_waiting", s.limits.max_waiting >= 1, "must be >= 1"),
    ]
    checks += [
        (f"timeouts.{f.name}", getattr(s.timeouts, f.name) > 0, "must be > 0")
        for f in dataclasses.fields(TimeoutSettings)
    ]
    for key, ok, message in checks:
        if not ok:
            raise ConfigError(f"{key}: {message}")
