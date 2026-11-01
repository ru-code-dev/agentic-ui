"""Typed ACP client subset (PLAN §3.1.5; shapes verified on qwen 0.21.1, RESEARCH §B.2).

Outbound: initialize, authenticate, session/new, session/load, session/set_mode (fallback set_config_option),
session/prompt, session/cancel. Inbound: ``session/request_permission`` is answered by ``permissions.decide``
(always allow tools, reject questions); every other agent→client request (``fs/*``, ``terminal/*``,
``craft/*``, unknown) gets ``-32601``. ``session/update`` goes to ``on_update`` unless ``suppress_updates``
(set during ``session/load`` replay, RESEARCH §B.5).
"""

import asyncio
import logging
from collections.abc import Callable, Mapping
from typing import Any

from ..log import get_logger
from . import permissions
from . import protocol as p
from .jsonrpc import JsonRpcConnection, RpcError, WireLogger

UpdateSink = Callable[[str, Mapping[str, Any]], None]
PermissionSink = Callable[[Mapping[str, Any], Mapping[str, Any]], None]

_log = get_logger("acp.client")


class AcpProtocolError(Exception):
    """The agent answered with something we cannot work with (e.g. another protocol version)."""


class AcpClient:
    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: Any,
        *,
        client_name: str,
        client_version: str,
        rpc_timeout: float | None = None,
        wire_logger: WireLogger | None = None,
    ) -> None:
        self.connection = JsonRpcConnection(
            reader, writer, on_request=self._on_request, on_notification=self._on_notification, wire_logger=wire_logger
        )
        self._client_info = {"name": client_name, "version": client_version}
        self._rpc_timeout = rpc_timeout
        self.on_update: UpdateSink | None = None
        self.on_permission: PermissionSink | None = None
        self.suppress_updates = False
        self.agent_info: dict[str, Any] = {}
        self.auth_methods: list[Any] = []
        self.agent_capabilities: dict[str, Any] = {}

    async def run(self) -> None:
        await self.connection.run()

    async def close(self) -> None:
        await self.connection.close()

    @property
    def can_load_session(self) -> bool:
        return bool(self.agent_capabilities.get("loadSession"))

    async def initialize(self, timeout: float | None = None) -> dict[str, Any]:
        params = {
            "protocolVersion": p.PROTOCOL_VERSION,
            "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False},
            "clientInfo": dict(self._client_info),
        }
        result = await self.connection.request(p.INITIALIZE, params, timeout)
        if not isinstance(result, dict) or result.get("protocolVersion") != p.PROTOCOL_VERSION:
            version = result.get("protocolVersion") if isinstance(result, dict) else result
            raise AcpProtocolError(f"agent speaks protocolVersion {version!r}, client needs {p.PROTOCOL_VERSION}")
        self.agent_info = result.get("agentInfo") or {}
        self.auth_methods = result.get("authMethods") or []
        self.agent_capabilities = result.get("agentCapabilities") or {}
        return result

    async def authenticate(self, method_id: str) -> Any:
        return await self.connection.request(p.AUTHENTICATE, {"methodId": method_id}, self._rpc_timeout)

    async def new_session(
        self, cwd: str, mcp_servers: list | None = None, timeout: float | None = None
    ) -> dict[str, Any]:
        result = await self.connection.request(p.SESSION_NEW, {"cwd": cwd, "mcpServers": mcp_servers or []}, timeout)
        if not isinstance(result, dict) or not isinstance(result.get("sessionId"), str):
            raise AcpProtocolError(f"session/new returned no sessionId: {result!r:.200}")
        return result

    async def load_session(
        self, session_id: str, cwd: str, mcp_servers: list | None = None, timeout: float | None = None
    ) -> dict[str, Any]:
        params = {"sessionId": session_id, "cwd": cwd, "mcpServers": mcp_servers or []}
        result = await self.connection.request(p.SESSION_LOAD, params, timeout)
        return result if isinstance(result, dict) else {}

    async def set_mode(self, session_id: str, mode_id: str) -> Any:
        """``session/set_mode``; agents without it (``-32601``) get ``set_config_option {configId:"mode"}``."""
        try:
            return await self.connection.request(
                p.SESSION_SET_MODE, {"sessionId": session_id, "modeId": mode_id}, self._rpc_timeout
            )
        except RpcError as exc:
            if exc.code != p.ErrorCode.METHOD_NOT_FOUND:
                raise
        params = {"sessionId": session_id, "configId": p.MODE_CONFIG_ID, "value": mode_id}
        return await self.connection.request(p.SESSION_SET_CONFIG_OPTION, params, self._rpc_timeout)

    async def set_model(self, session_id: str, model_id: str) -> str:
        """Select the session model; returns the method used. ``set_config_option {configId:"model"}`` first (qwen:
        not persisted), ``session/set_model`` when that is missing (qwen: persists ``model.name``)."""
        params = {"sessionId": session_id, "configId": p.MODEL_CONFIG_ID, "value": model_id}
        try:
            await self.connection.request(p.SESSION_SET_CONFIG_OPTION, params, self._rpc_timeout)
            return p.SESSION_SET_CONFIG_OPTION
        except RpcError as exc:
            if exc.code not in (p.ErrorCode.METHOD_NOT_FOUND, p.ErrorCode.INVALID_PARAMS):
                raise
        await self.connection.request(
            p.SESSION_SET_MODEL, {"sessionId": session_id, "modelId": model_id}, self._rpc_timeout
        )
        return p.SESSION_SET_MODEL

    async def prompt(self, session_id: str, blocks: list[dict[str, Any]], timeout: float | None = None) -> str:
        """Run one turn; returns the stop reason (unknown reasons are passed through as strings)."""
        result = await self.connection.request(p.SESSION_PROMPT, {"sessionId": session_id, "prompt": blocks}, timeout)
        stop = result.get("stopReason") if isinstance(result, dict) else None
        if not isinstance(stop, str):
            raise AcpProtocolError(f"session/prompt returned no stopReason: {result!r:.200}")
        return stop

    async def cancel(self, session_id: str) -> None:
        await self.connection.notify(p.SESSION_CANCEL, {"sessionId": session_id})

    async def _on_request(self, method: str, params: Any) -> Any:
        if method == p.SESSION_REQUEST_PERMISSION:
            decision = permissions.decide(params)
            tool_call = params.get("toolCall") if isinstance(params, dict) else None
            tool_call = tool_call if isinstance(tool_call, dict) else {}
            name = (tool_call.get("_meta") or {}).get("toolName") or tool_call.get("title", "?")
            verdict = "question rejected" if permissions.is_question(tool_call) else "tool allowed"
            _log.info(
                "permission request for %s: %s → %s", name, verdict, decision["outcome"].get("optionId", "cancelled")
            )
            if self.on_permission is not None:
                try:
                    self.on_permission(params if isinstance(params, dict) else {}, decision)
                except Exception:  # noqa: BLE001 - a failing sink must not block the permission answer; logged
                    _log.exception("permission sink failed")
            return decision
        known = method == p.CRAFT_DRAIN_MID_TURN_QUEUE or method.startswith(("fs/", "terminal/"))
        _log.log(logging.INFO if known else logging.WARNING, "agent request %s not supported → -32601", method)
        raise RpcError(p.ErrorCode.METHOD_NOT_FOUND, f"method not supported by client: {method}")

    def _on_notification(self, method: str, params: Any) -> None:
        if method != p.SESSION_UPDATE:
            _log.info("ignored agent notification %s", method)
            return
        if self.suppress_updates or self.on_update is None or not isinstance(params, dict):
            return
        update = params.get("update")
        if isinstance(update, dict):
            self.on_update(str(params.get("sessionId", "")), update)
