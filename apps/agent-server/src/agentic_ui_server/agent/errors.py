"""Errors raised by ``AgentSession`` (PLAN §3.1.9); the HTTP layer maps them to responses later."""

from ..acp.client import AcpProtocolError
from ..acp.jsonrpc import ConnectionClosed, RpcError


class AgentStartError(Exception):
    """Start failed. ``kind``: ``timeout`` | ``spawn`` | ``exited`` | ``rpc`` | ``protocol``."""

    def __init__(self, kind: str, message: str, stderr_tail: str = "", exit_code: int | None = None) -> None:
        super().__init__(f"agent start failed ({kind}): {message}")
        self.kind, self.stderr_tail, self.exit_code = kind, stderr_tail, exit_code


class AgentCrashed(Exception):
    def __init__(self, exit_code: int | None, stderr_tail: str) -> None:
        super().__init__(f"agent exited mid-turn (code {exit_code})")
        self.exit_code, self.stderr_tail = exit_code, stderr_tail


class TurnTimeout(TimeoutError):
    """The turn exceeded ``timeouts.turn_s``; it was cancelled."""


class SessionBusy(RuntimeError):
    """A turn is already running (the manager serializes turns per chat)."""


def start_failure(exc: BaseException, timeout: float, agent_bin: str) -> tuple[str, str]:
    """``(kind, message)`` of an ``AgentStartError`` for what interrupted the start."""
    if isinstance(exc, TimeoutError):
        return "timeout", f"not ready within {timeout}s"
    if isinstance(exc, ConnectionClosed):
        return "exited", "agent closed the connection during start"
    if isinstance(exc, RpcError):
        return "rpc", str(exc)
    if isinstance(exc, AcpProtocolError):
        return "protocol", str(exc)
    return "spawn", f"{agent_bin}: {exc}"
