"""Python A2UI validator for the ui-kit-one contract (SV-C7): every problem of a payload at once (CF-I4).

``validate_payload(messages)`` → list of ``ValidationError(path, message)``; empty = valid (stateless: a surface the
payload only updates is assumed to exist). ``validate_step(messages, state)`` checks a reply against what the chat
already shows (SV-C28) and returns the merged state. Schema checks run
offline over the bundled ``catalog.json`` + A2UI v0.9 ``common_types.json`` / ``server_to_client.json``
(``schema.py``, ``refs.py``); payload and surface rules follow ``@a2ui/agent`` ``validatePayload``
(``structure.py``, ``topology.py``). Agreement with the Node verdict: ``tests/agreement/test_validator_agreement.py``.
"""

from functools import cache
from typing import Any

from .refs import SchemaRegistry
from .schema import Issue
from .structure import PayloadChecker, Step
from .surfaces import SurfaceState

ValidationError = Issue

__all__ = ["SurfaceState", "ValidationError", "checker", "format_errors", "validate_payload", "validate_step"]


@cache
def checker() -> PayloadChecker:
    return PayloadChecker(SchemaRegistry.bundled())


def validate_payload(messages: Any) -> list[ValidationError]:
    return checker().check(messages)


def validate_step(messages: Any, state: SurfaceState) -> Step:
    """SV-C28: ``messages`` merged into a copy of a chat's surface state; ``Step.state`` = the merged state when
    valid (None: invalid, the chat keeps ``state``)."""
    return checker().step(messages, state)


def format_errors(errors: list[ValidationError]) -> str:
    """One line per problem (``<path>: <message>``), the text the repair message quotes."""
    return "\n".join(f"- {error.path}: {error.message}" for error in errors)
