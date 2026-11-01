"""ACP start handshake and session settings (PLAN §3.1.9; RESEARCH §B.2; SV-C15 model, no-yolo constraint).

``open_session``: initialize → authenticate (only when ``agent.auth_method`` is set; failure = warning) →
``session/load`` of the previous id (replay suppressed; failure → ``session/new``) → mode (only when
``agent.mode`` is set and advertised). ``apply_model``: select ``agent.model`` (a plain name; never a provider)
via ``set_config_option {configId:"model"}``, else ``session/set_model``; failure = warning, the agent keeps
its own model. qwen keeps the selection in the live session only (persistDefault:false, acpAgent.ts:4817-4826)
and a respawned process rebuilds it from settings on load (acpAgent.ts:4379-4400), so callers re-apply after
every new/load.
"""

from dataclasses import dataclass, field
from typing import Any

from .. import __version__
from ..acp.client import AcpClient, AcpProtocolError
from ..acp.jsonrpc import ConnectionClosed, RpcError, RpcTimeout
from ..log import get_logger, make_wire_logger
from ..settings import AgentSettings, Settings
from .process import AgentProcess

_log = get_logger("agent.handshake")


def make_client(proc: AgentProcess, settings: Settings) -> AcpClient:
    """The ACP client over the agent's stdio pipes."""
    return AcpClient(
        proc.stdout,
        proc.stdin,
        client_name=settings.agent.client_name,
        client_version=__version__,
        rpc_timeout=settings.timeouts.rpc_s,
        wire_logger=make_wire_logger(settings.log.acp_wire),
    )


@dataclass
class OpenedSession:
    session_id: str
    resumed: bool
    modes: dict[str, Any] | None = None
    models: dict[str, Any] | None = None
    extra: dict[str, Any] = field(default_factory=dict)


async def open_session(
    client: AcpClient, agent: AgentSettings, *, cwd: str, label: str, previous_id: str | None, rpc_timeout: float
) -> OpenedSession:
    init = await client.initialize()
    _log.info(
        "[%s] agent %s, protocol %s, loadSession=%s, authMethods=%s",
        label,
        client.agent_info,
        init.get("protocolVersion"),
        client.can_load_session,
        [m.get("id") for m in client.auth_methods if isinstance(m, dict)],
    )
    if agent.auth_method:
        try:
            await client.authenticate(agent.auth_method)
            _log.info("[%s] authenticated with method %r", label, agent.auth_method)
        except (RpcError, RpcTimeout) as exc:  # optional when auth is preselected (RESEARCH §B.2, R5)
            _log.warning("[%s] authenticate(%s) failed, continuing: %s", label, agent.auth_method, exc)
    result = (
        await _load(client, previous_id, cwd, label, rpc_timeout) if previous_id and client.can_load_session else None
    )
    resumed = result is not None
    if result is None:
        result = await client.new_session(cwd)
        _log.info("[%s] session/new → %s", label, result["sessionId"])
    opened = OpenedSession(result.get("sessionId") or previous_id, resumed, result.get("modes"), result.get("models"))
    await apply_mode(client, opened.session_id, agent.mode, opened.modes, label)
    return opened


async def _load(client: AcpClient, session_id: str, cwd: str, label: str, timeout: float) -> dict[str, Any] | None:
    client.suppress_updates = True
    try:
        result = await client.load_session(session_id, cwd, timeout=timeout)
        _log.info("[%s] session/load %s ok (history replay suppressed)", label, session_id)
        return {**result, "sessionId": session_id}
    except (RpcError, RpcTimeout, AcpProtocolError) as exc:
        _log.warning("[%s] session/load %s failed, starting a new session: %s", label, session_id, exc)
        return None
    finally:
        client.suppress_updates = False


async def apply_mode(client: AcpClient, session_id: str, mode: str, modes: dict[str, Any] | None, label: str) -> None:
    """Set ``mode`` only when configured; a mode the agent doesn't advertise is a warning, never an error."""
    if not mode:
        return
    available = [m.get("id") for m in (modes or {}).get("availableModes", []) if isinstance(m, dict)]
    if available and mode not in available:
        _log.warning("[%s] mode %r not advertised (have %s), leaving the agent's mode", label, mode, available)
        return
    try:
        await client.set_mode(session_id, mode)
        _log.info("[%s] mode set to %r", label, mode)
    except (RpcError, RpcTimeout) as exc:
        _log.warning("[%s] set mode %r failed, continuing: %s", label, mode, exc)


async def apply_model(client: AcpClient, session_id: str, model: str, label: str) -> bool:
    """Select ``model`` for the session; False (logged warning) when the agent can't, the turn still runs."""
    try:
        method = await client.set_model(session_id, model)
    except (RpcError, RpcTimeout, ConnectionClosed) as exc:
        _log.warning("[%s] cannot select model %r, the agent keeps its own model: %s", label, model, exc)
        return False
    _log.info("[%s] model %r applied via %s", label, model, method)
    return True


def wanted_model(chosen: str, applied: str | None, models: dict[str, Any] | None) -> str:
    """The model a turn must run: the chosen one, else (a model was applied before) the CLI's default from
    ``session/new`` (``""`` = back to the default, SV-C25), else ``""`` (leave the model untouched, SV-C15)."""
    if chosen or not applied:
        return chosen
    default = (models or {}).get("currentModelId")
    if not isinstance(default, str) or not default:
        _log.warning("cannot return to the CLI default model (session/new named none), keeping %r", applied)
        return applied
    return default
