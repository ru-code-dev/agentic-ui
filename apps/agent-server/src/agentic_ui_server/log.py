"""Stdlib logging setup with secret redaction (PLAN §5 "secrets leakage"; SV-C16 "zero silence").

Secret values are registered when the settings load (``register_settings_secrets``: the server env, ``agent.env``,
secret CLI flags; A2-M4, before: only at the first spawn) and again for every spawn env, and are replaced by ``***``
in every log record and in any text we surface (stderr tails in errors). The env itself is never logged (keys
only). A secret env name is exact (``is_secret_name``): ``KEY`` / ``TOKEN`` / ``SECRET`` as the whole name or its
last ``_`` part (``VENDOR_API_KEY``, ``HF_TOKEN``), ``PASSWORD``/``PASSWD`` anywhere, or a name listed in
``agent.env_names.secrets``; paths such as ``XAUTHORITY`` or ``SSH_AUTH_SOCK`` are not secrets.
Every package logger carries the redacting filter, so any handler (stderr, tests, future sinks) sees clean text.
Level and format come from ``log.level`` / ``log.format`` (default INFO to stderr).
"""

import logging
import re
import sys
import threading
from collections.abc import Callable, Mapping, Sequence

from .settings import LogSettings, Settings

LOGGER_NAME = "agentic_ui_server"
_SECRET_NAME = re.compile(r"(?:^|_)(?:KEY|TOKEN|SECRET)$|PASSWORD|PASSWD", re.IGNORECASE)
_SECRET_ARG = re.compile(r"KEY|TOKEN|SECRET|PASSW|CREDENTIAL", re.IGNORECASE)  # not AUTH: --auth-type is no secret
_MIN_SECRET_LEN = 6
_WIRE_MAX_CHARS = 2000
_secrets: set[str] = set()
_secret_names: set[str] = set()
_lock = threading.Lock()


def is_secret_name(name: str) -> bool:
    """An env var whose value is a secret: exact patterns (module doc) or a configured name."""
    with _lock:
        configured = name in _secret_names
    return configured or _SECRET_NAME.search(name) is not None


def register_secret(value: str) -> None:
    if len(value) >= _MIN_SECRET_LEN:
        with _lock:
            _secrets.add(value)


def register_env_secrets(env: Mapping[str, str]) -> None:
    """Register the values of env vars with a secret name (``is_secret_name``)."""
    for name, value in env.items():
        if is_secret_name(name):
            register_secret(value)


def register_settings_secrets(settings: Settings) -> None:
    """At settings load: the configured secret names, then every secret the agent could be given."""
    agent = settings.agent
    with _lock:
        _secret_names.update(agent.env_names.secrets)
    register_env_secrets(settings.environ)
    register_env_secrets(agent.env)
    register_arg_secrets([*agent.base_args, *agent.extra_args])


def _secret_args(args: Sequence[str]) -> dict[int, str]:
    """Index → masked form of each secret CLI value: ``--api-key X`` (X), ``--api-key=X`` / ``KEY=X``."""
    masked, hide = {}, False
    for index, arg in enumerate(args):
        name, sep, _ = arg.partition("=")
        if hide:
            masked[index] = "***"
        elif sep and _SECRET_ARG.search(name):
            masked[index] = f"{name}=***"
        hide = not hide and not sep and arg.startswith("-") and bool(_SECRET_ARG.search(arg))
    return masked


def mask_args(args: Sequence[str]) -> list[str]:
    masked = _secret_args(args)
    return [masked.get(index, arg) for index, arg in enumerate(args)]


def register_arg_secrets(args: Sequence[str]) -> None:
    """Register the values ``mask_args`` hides, so they are redacted wherever else they show up."""
    for index, shown in _secret_args(args).items():
        register_secret(args[index] if shown == "***" else args[index].partition("=")[2])


def printable(text: str) -> str:
    """A3-11: ``text`` with every non-printable character escaped (``\\x1b``, ``\\u2028``; like ``ascii()`` but
    keeping printable non-ASCII such as Cyrillic): an unauthenticated client or an agent cannot write terminal
    control sequences (erase line, colours) into the log."""
    if text.isprintable():
        return text
    return "".join(ch if ch.isprintable() else ascii(ch)[1:-1] for ch in text)


def redact(text: str) -> str:
    with _lock:
        secrets = sorted(_secrets, key=len, reverse=True)
    for secret in secrets:
        text = text.replace(secret, "***")
    return text


class _Escaped:
    """A log argument shown with every non-printable character escaped (``%s`` and ``%r`` alike)."""

    def __init__(self, value: object) -> None:
        self.value = value

    def __str__(self) -> str:
        return printable(str(self.value))

    def __repr__(self) -> str:
        return printable(repr(self.value))


def _escaped(arg: object) -> object:
    return arg if isinstance(arg, int | float | type(None)) else _Escaped(arg)


class RedactingFilter(logging.Filter):
    """Escapes every argument (A4-02: agent or client text cannot write control sequences or forge log lines; the
    format strings, ours, keep their layout) and redacts secrets from the formatted message and the traceback."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(_escaped(a) for a in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: _escaped(v) for k, v in record.args.items()}
        record.msg, record.args = redact(record.getMessage()), None
        if record.exc_info and not record.exc_text:
            record.exc_text = redact(logging.Formatter().formatException(record.exc_info))
        return True


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(f"{LOGGER_NAME}.{name}")
    if not any(isinstance(f, RedactingFilter) for f in logger.filters):
        logger.addFilter(RedactingFilter())
    return logger


def setup_logging(settings: LogSettings, stream=None) -> logging.Logger:
    """Configure the package logger (stderr by default); idempotent."""
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(settings.level.upper())
    logger.propagate = False
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
    handler = logging.StreamHandler(stream or sys.stderr)
    handler.setFormatter(logging.Formatter(settings.format))
    handler.addFilter(RedactingFilter())
    logger.addHandler(handler)
    return logger


def make_wire_logger(enabled: bool) -> Callable[[str, str], None] | None:
    """Return a ``(direction, line)`` logger for ACP frames, or ``None`` when wire logging is off."""
    if not enabled:
        return None
    logger = get_logger("acp.wire")

    def log_frame(direction: str, line: str) -> None:
        shown = (
            line
            if len(line) <= _WIRE_MAX_CHARS
            else f"{line[:_WIRE_MAX_CHARS]}… (+{len(line) - _WIRE_MAX_CHARS} chars)"
        )
        logger.debug("%s %s", direction, redact(shown))

    return log_frame
