"""chat_id → AgentSession with internal concurrency control (SV-C11, PLAN §3.1.10, RESEARCH §C, R6).

- One session (one process) per chat; two chats never share a session.
- Turns of one chat run in FIFO order (``asyncio.Lock`` is fair); more than ``max_queue_per_chat`` waiting
  turns → ``QueueFull`` (HTTP 429 later).
- ``cancel(chat_id)`` does not take the chat lock, so it reaches the busy session while others wait.
- At most ``max_live_agents`` processes: the least recently used idle session is closed (its session id is kept
  for ``session/load``); busy ones are never evicted, so a new chat waits for a slot when all are busy.
- The reaper closes processes idle longer than ``idle_ttl_s`` and forgets chats idle past ``forget_after_s``: their
  entry, their files (``forget.py``: work dir, the CLI's transcript under its HOME, A4-11) and (through ``on_reap``
  listeners) the chat service's state of them (A3-03).
- Across all chats at most ``max_waiting`` requests wait for a chat turn or a slot; one more → ``QueueFull`` (A4-07).
- A turn waiting for a slot ends with ``TurnCancelled`` when its ``cancelled()`` turns true (``wake()``), and with
  ``ManagerClosed`` when the manager shuts down (A3-01, A3-10).
"""

import asyncio
import contextlib
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field

from ..log import get_logger
from ..resources import AgentFiles
from ..settings import Settings
from .forget import remove_chat_files
from .session import AgentSession

_log = get_logger("agent.manager")

SessionFactory = Callable[[str], AgentSession]


class QueueFull(Exception):
    """Too many turns are waiting for this chat."""


class ManagerClosed(RuntimeError):
    """The manager was shut down."""


class TurnCancelled(Exception):
    """The request was cancelled while it waited for an agent slot (no prompt was sent)."""


ReapListener = Callable[[float, list[str]], None]
"""``(now, chat ids forgotten in this pass)``, called after every reaper pass."""


@dataclass
class _Entry:
    session: AgentSession
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    in_flight: int = 0
    reserved: bool = False
    """True while a turn holds a process slot (set before the session is live, so starts can't overbook)."""

    @property
    def occupies_slot(self) -> bool:
        return self.session.is_live or self.reserved


class SessionManager:
    def __init__(self, settings: Settings, *, files: AgentFiles, session_factory: SessionFactory | None = None) -> None:
        self._settings = settings
        self._factory = session_factory or (lambda chat_id: AgentSession(settings, chat_id, files=files))
        self._entries: dict[str, _Entry] = {}
        self._capacity = asyncio.Condition()
        self._reaper: asyncio.Task | None = None
        self._closed = False
        self._reap_listeners: list[ReapListener] = []

    @property
    def closed(self) -> bool:
        return self._closed

    def on_reap(self, listener: ReapListener) -> None:
        self._reap_listeners.append(listener)

    async def wake(self) -> None:
        """Re-check every turn waiting for a slot (one of them may have been cancelled)."""
        async with self._capacity:
            self._capacity.notify_all()

    @property
    def live_count(self) -> int:
        return sum(1 for entry in self._entries.values() if entry.session.is_live)

    def free_slot(self) -> bool:
        """A turn of a new chat would start at once (a slot is free or an idle agent can be evicted)."""
        busy = [e for e in self._entries.values() if e.occupies_slot]
        return len(busy) < self._settings.limits.max_live_agents or any(e.in_flight == 0 for e in busy)

    def live_models(self) -> dict | None:
        """The models a live session read in ``session/new`` (every session runs the same CLI)."""
        for entry in self._entries.values():
            models = getattr(entry.session, "models", None) if entry.session.is_live else None
            if isinstance(models, dict):
                return models
        return None

    def session(self, chat_id: str) -> AgentSession | None:
        entry = self._entries.get(chat_id)
        return entry.session if entry else None

    def start_reaper(self) -> None:
        if self._reaper is None:
            self._reaper = asyncio.get_running_loop().create_task(self._reap_loop())

    @contextlib.asynccontextmanager
    async def turn(self, chat_id: str, cancelled: Callable[[], bool] | None = None) -> AsyncIterator[AgentSession]:
        """Exclusive use of the chat's session for one turn (FIFO per chat, bounded queue, LRU slot)."""
        if self._closed:
            raise ManagerClosed("session manager is shut down")
        entry = self._entries.get(chat_id)
        if entry is None:
            entry = self._entries[chat_id] = _Entry(self._factory(chat_id))
        waiting = entry.in_flight - (1 if entry.lock.locked() else 0)
        if entry.lock.locked() and waiting >= self._settings.limits.max_queue_per_chat:
            _log.warning(
                "[%s] queue full: %d turns already waiting (limit %d)",
                chat_id,
                waiting,
                self._settings.limits.max_queue_per_chat,
            )
            raise QueueFull(f"chat {chat_id}: {waiting} turns already queued")
        waiting = sum(e.in_flight - (1 if e.reserved else 0) for e in self._entries.values())
        if waiting >= self._settings.limits.max_waiting:
            _log.warning(
                "[%s] server busy: %d requests already waiting (limit %d)",
                chat_id,
                waiting,
                self._settings.limits.max_waiting,
            )
            raise QueueFull(f"server busy: {waiting} requests already waiting, retry later")
        entry.in_flight += 1
        try:
            async with entry.lock:
                await self._make_room(entry, cancelled or (lambda: False))
                entry.reserved = True
                yield entry.session
        finally:
            entry.reserved = False
            entry.in_flight -= 1
            entry.session.last_used = time.monotonic()
            async with self._capacity:
                self._capacity.notify_all()

    async def cancel(self, chat_id: str) -> bool:
        """Cancel the chat's running turn without waiting for the chat lock."""
        entry = self._entries.get(chat_id)
        return await entry.session.cancel() if entry else False

    async def reap_idle(self, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        limits = self._settings.limits
        forgotten: list[str] = []
        for chat_id, entry in list(self._entries.items()):
            if entry.in_flight:
                continue
            idle = now - entry.session.last_used
            if entry.session.is_live and idle > limits.idle_ttl_s:
                _log.info("[%s] closing agent after %.0fs idle", chat_id, idle)
                await entry.session.close()
            if not entry.session.is_live and idle > limits.forget_after_s and not entry.in_flight:
                self._entries.pop(chat_id, None)
                remove_chat_files(self._settings, chat_id, getattr(entry.session, "cwd", None))
                forgotten.append(chat_id)
        for listener in self._reap_listeners:
            listener(now, forgotten)

    async def shutdown(self) -> None:
        self._closed = True
        await self.wake()  # turns waiting for a slot end with ManagerClosed
        if self._reaper is not None:
            self._reaper.cancel()
            await asyncio.gather(self._reaper, return_exceptions=True)
            self._reaper = None
        _log.info("shutting down %d chat sessions", len(self._entries))
        results = await asyncio.gather(
            *(entry.session.close() for entry in self._entries.values()), return_exceptions=True
        )
        for chat_id, result in zip(list(self._entries), results, strict=True):
            if isinstance(result, BaseException):
                _log.error("[%s] close failed during shutdown: %r", chat_id, result)

    async def _make_room(self, entry: _Entry, cancelled: Callable[[], bool]) -> None:
        cap = self._settings.limits.max_live_agents
        async with self._capacity:
            while not entry.session.is_live:
                if self._closed:
                    raise ManagerClosed("session manager is shut down")
                if cancelled():
                    _log.info("[%s] cancelled while waiting for an agent slot", entry.session.chat_id)
                    raise TurnCancelled(entry.session.chat_id)
                others = [e for e in self._entries.values() if e is not entry and e.occupies_slot]
                if len(others) < cap:
                    return
                idle = [e for e in others if e.in_flight == 0 and e.session.is_live]
                if idle:
                    victim = min(idle, key=lambda e: e.session.last_used)
                    _log.info("[%s] evicting idle agent (LRU, cap %d live agents)", victim.session.chat_id, cap)
                    await victim.session.close()
                    continue
                _log.info("[%s] all %d agent slots busy, waiting", entry.session.chat_id, cap)
                await self._capacity.wait()

    async def _reap_loop(self) -> None:
        while True:
            await asyncio.sleep(self._settings.limits.reap_interval_s)
            try:
                await self.reap_idle()
            except Exception:  # noqa: BLE001 - the reaper outlives one failed pass; logged
                _log.exception("idle reaper failed")
