"""One chat = one agent process + one ACP session (PLAN §3.1.9, RESEARCH §C, risks R3/R5/R7).

States: ``idle → starting → ready → busy → ready | dead``. ``dead`` sessions restart on the next turn and resume
with ``session/load`` (replay suppressed), falling back to ``session/new``. Cancel = ``session/cancel``, then a
SIGKILL of the process group after ``cancel_grace_s`` (ru-code ACP_CANCEL_GRACE_MS). Any prompt outcome after a
cancel (late RPC error, EOF from our own kill) is reported as ``cancelled`` (RESEARCH §B.2 race); a cancel while the
turn still starts the agent or applies the model drops the prompt (the turn returns ``cancelled`` unsent).
"""

import asyncio
import time
from pathlib import Path
from typing import Any

from ..acp.client import AcpClient, AcpProtocolError
from ..acp.jsonrpc import ConnectionClosed, RpcError
from ..acp.protocol import StopReason
from ..log import get_logger
from ..resources import AgentFiles
from ..settings import Settings
from .errors import AgentCrashed, AgentStartError, SessionBusy, TurnTimeout, start_failure
from .handshake import apply_model, make_client, open_session, wanted_model
from .process import AgentProcess
from .spawn import build_spawn
from .state import SessionState, chat_dir_name
from .turn import TurnCollector, TurnResult

_log = get_logger("agent.session")

__all__ = ["AgentCrashed", "AgentSession", "AgentStartError", "SessionBusy", "SessionState", "TurnTimeout"]
__all__ += ["chat_dir_name"]


class AgentSession:
    def __init__(self, settings: Settings, chat_id: str, *, files: AgentFiles) -> None:
        self.settings, self.chat_id = settings, chat_id
        self.cwd = Path(settings.agent.work_root) / chat_dir_name(chat_id)
        self.state = SessionState.IDLE
        self.session_id: str | None = None
        self.resumed = False
        self.agent_info: dict[str, Any] = {}
        self.auth_methods: list[Any] = []
        self.modes: dict[str, Any] | None = None
        self.models: dict[str, Any] | None = None
        self.applied_model: str | None = None
        """The model this process runs (SV-C15); re-applied after new/load and when the wanted model changes."""
        self.last_used = time.monotonic()
        self._files = files
        self._proc: AgentProcess | None = None
        self._client: AcpClient | None = None
        self._reader: asyncio.Task | None = None
        self._prompt: asyncio.Task | None = None
        self._collector: TurnCollector | None = None
        self._cancel_requested = False
        self._early: bool | None = None  # False: a turn is starting the agent / model; True: cancelled meanwhile

    @property
    def is_live(self) -> bool:
        return self.state in (SessionState.STARTING, SessionState.READY, SessionState.BUSY)

    @property
    def pid(self) -> int | None:
        return self._proc.pid if self._proc else None

    def stderr_tail(self) -> str:
        return self._proc.stderr_tail() if self._proc else ""

    async def start(self) -> None:
        if self._alive():
            return
        await self._teardown()
        self.state = SessionState.STARTING
        timeout = self.settings.timeouts.start_s
        try:
            async with asyncio.timeout(timeout):
                await self._boot()
        except (TimeoutError, ConnectionClosed, RpcError, AcpProtocolError, OSError) as exc:
            await self._fail_start(*start_failure(exc, timeout, self.settings.agent.bin))
        self.state = SessionState.READY
        _log.info("[%s] ready: session=%s resumed=%s pid=%s", self.chat_id, self.session_id, self.resumed, self.pid)

    async def run_turn(self, text: str, model: str | None = None) -> TurnResult:
        """One prompt turn; ``model`` overrides ``agent.model`` for this turn (applied only when it differs)."""
        if self.state == SessionState.BUSY:
            raise SessionBusy(self.chat_id)
        self._early = False
        try:
            booted = not self._alive()  # the boot just tried agent.model: a refusal is retried next turn
            if booted:
                await self.start()
            wanted = wanted_model(model or self.settings.agent.model, self.applied_model, self.models)
            tried = booted and wanted == self.settings.agent.model
            again = self.settings.agent.model_apply == "every_turn" or (wanted != self.applied_model and not tried)
            if wanted and again and await apply_model(self._client, self.session_id, wanted, self.chat_id):
                self.applied_model = wanted  # A3-12: only an accepted call counts; a refused one is retried next turn
        finally:
            early, self._early = self._early, None
        if early:
            _log.info("[%s] turn cancelled before its prompt was sent", self.chat_id)
            return TurnResult("", "", {}, None, None, StopReason.CANCELLED, 0)
        started = time.monotonic()
        _log.info("[%s] turn start (%d chars)", self.chat_id, len(text))
        self.state, self.last_used = SessionState.BUSY, started
        self._collector, self._cancel_requested = TurnCollector(), False
        collector = self._collector
        self._prompt = task = asyncio.get_running_loop().create_task(
            self._client.prompt(self.session_id, [{"type": "text", "text": text}])
        )
        task.add_done_callback(lambda t: t.cancelled() or t.exception())  # retrieved even if the caller left
        try:
            done, _ = await asyncio.wait({task}, timeout=self.settings.timeouts.turn_s)
            if not done:
                _log.warning("[%s] turn timed out after %ss, cancelling", self.chat_id, self.settings.timeouts.turn_s)
                await self.cancel()
                await asyncio.wait({task}, timeout=self.settings.timeouts.kill_grace_s)
                raise TurnTimeout(f"turn exceeded {self.settings.timeouts.turn_s}s (cancelled)")
            res = collector.result(await self._stop_reason(task))
            ms = (time.monotonic() - started) * 1000
            log_args = (self.chat_id, res.stop_reason, ms, res.updates_count, len(res.text))
            _log.info("[%s] turn end: stop=%s duration=%dms updates=%d chars=%d", *log_args)
            return res
        except asyncio.CancelledError:
            _log.warning("[%s] caller abandoned the turn, killing the agent", self.chat_id)
            self._kill()  # never leave a turn running behind a "ready" state
            raise
        except RpcError as exc:
            _log.error("[%s] turn failed with agent error %s: %s", self.chat_id, exc.code, exc.message)
            raise
        finally:
            self._collector, self._prompt, self.last_used = None, None, time.monotonic()
            if self.state == SessionState.BUSY:
                self.state = SessionState.READY

    async def cancel(self) -> bool:
        """Cancel the running turn; returns False when idle. Kills the agent if it ignores the cancel."""
        if self._early is False:  # the agent is still starting for this turn: the prompt will not be sent
            self._early = True
            _log.info("[%s] cancel while the turn prepares (agent start / model): prompt dropped", self.chat_id)
            return True
        task = self._prompt
        if self.state != SessionState.BUSY or task is None or task.done():
            return False
        self._cancel_requested = True
        _log.info("[%s] cancelling the running turn", self.chat_id)
        try:
            await self._client.cancel(self.session_id)
        except ConnectionClosed as exc:
            _log.warning("[%s] session/cancel not delivered (connection closed): %s", self.chat_id, exc)
        done, _ = await asyncio.wait({task}, timeout=self.settings.timeouts.cancel_grace_s)
        if not done:
            grace = self.settings.timeouts.cancel_grace_s
            _log.warning("[%s] agent ignored session/cancel for %.1fs, killing", self.chat_id, grace)
            self._kill()
            await self._client.close()
        return True

    async def close(self) -> None:
        """Stop the process; the session id is kept so a later turn can resume with session/load."""
        if self.state == SessionState.BUSY:
            self._cancel_requested = True  # stopped by us (shutdown): the turn ends cancelled, not as a crash
            self._kill()
        await self._teardown()
        self.state = SessionState.DEAD if self.session_id else SessionState.IDLE

    async def _boot(self) -> None:
        settings = self.settings
        self.cwd.mkdir(parents=True, exist_ok=True)
        restarting = self.session_id is not None
        if restarting:
            _log.info("[%s] restarting the agent, resuming session %s", self.chat_id, self.session_id)
        spec = build_spawn(settings, cwd=str(self.cwd), files=self._files)
        self._proc = await AgentProcess.start(spec, settings.limits, label=self.chat_id)
        self._client = client = make_client(self._proc, settings)
        client.on_update, client.on_permission = self._route_update, self._route_permission
        self._reader = asyncio.get_running_loop().create_task(client.run())
        opened = await open_session(
            client,
            settings.agent,
            cwd=str(self.cwd),
            label=self.chat_id,
            previous_id=self.session_id,
            rpc_timeout=settings.timeouts.rpc_s,
        )
        self.agent_info, self.auth_methods = client.agent_info, client.auth_methods
        self.session_id, self.resumed = opened.session_id, opened.resumed
        self.modes, self.models = opened.modes or self.modes, opened.models or self.models
        self.applied_model = None
        if settings.agent.model and await apply_model(client, self.session_id, settings.agent.model, self.chat_id):
            self.applied_model = settings.agent.model

    async def _stop_reason(self, task: asyncio.Task) -> str:
        try:
            return task.result()
        except RpcError:
            if self._cancel_requested:
                return StopReason.CANCELLED
            raise
        except ConnectionClosed:
            if self._cancel_requested:
                return StopReason.CANCELLED
            code = await self._proc.wait_exit(self.settings.timeouts.kill_grace_s)
            tail = self._proc.stderr_tail()
            self._kill()
            msg = "[%s] agent crashed mid-turn (exit code %s); next turn restarts it. stderr tail:\n%s"
            _log.error(msg, self.chat_id, code, tail)
            raise AgentCrashed(code, tail) from None

    def _route_update(self, _session_id: str, update: dict[str, Any]) -> None:
        if self._collector is not None:  # one process per chat: every update belongs to this turn
            self._collector.feed(update)

    def _route_permission(self, params: dict[str, Any], decision: dict[str, Any]) -> None:
        if self._collector is not None:
            self._collector.feed_permission(params, decision)

    def _alive(self) -> bool:
        return (
            self.state in (SessionState.READY, SessionState.BUSY)
            and self._proc is not None
            and self._proc.returncode is None
            and not self._client.connection.closed
        )

    def _kill(self) -> None:
        if self._proc is not None:
            self._proc.kill()
        self.state = SessionState.DEAD

    async def _fail_start(self, kind: str, message: str) -> None:
        code, tail = None, ""
        if self._proc is not None:
            code = await self._proc.wait_exit(0.5) if kind == "exited" else None
            tail = self._proc.stderr_tail()
        await self._teardown()
        self.state = SessionState.DEAD if self.session_id else SessionState.IDLE
        _log.error(
            "[%s] agent start failed (%s): %s (exit code %s). stderr tail:\n%s", self.chat_id, kind, message, code, tail
        )
        raise AgentStartError(kind, message, tail, code)

    async def _teardown(self) -> None:
        proc, client, reader = self._proc, self._client, self._reader
        self._proc = self._client = self._reader = None
        if proc is not None:
            await proc.terminate(self.settings.timeouts.kill_grace_s)
        if client is not None:
            await client.close()
        if reader is not None:
            await asyncio.wait({reader}, timeout=1.0)
