"""Chat use cases over ``SessionManager`` (PLAN §4 P5): prompt, action, cancel, progress, models (SV-C20, SV-C25).

- ``prompt``/``action``: one request = the repair loop in the chat's own agent session (FIFO per chat, SV-C11; the
  ``reply`` modes of SV-C27: ``ui``, ``fallback``, ``surfaces``),
  bounded by ``timeouts.request_s`` (then the turn is abandoned, the agent killed, the fallback returned);
  ``QueueFull``/``ManagerClosed`` propagate (429/503); ``agent.retry`` (the fallback's button) re-sends the last prompt.
- ``cancel``: cancels the running ACP turn without waiting for the chat lock; the request ends ``cancelled``. A request
  still waiting for an agent slot is cancelled too (it ends at once, no prompt sent; A3-01).
- a ``/prompt`` with the same text as the chat's still running prompt (a client retry after a proxy timeout) joins
  it: one agent turn, both callers get its outcome (A3-19); so does any ``/prompt`` or ``/action`` carrying the
  running request's ``requestId`` (A4-08: a retried button press). Any other request queues behind it (FIFO).
- SV-C28: each chat keeps the surfaces the page shows (``SurfaceState``); every reply is checked merged into them,
  and a valid one (``ok``) becomes the new state; a fallback, a cancel or an error leave it as it was. An action's
  ``dataModel`` (the page's data, inputs included) replaces that surface's data model first. DEC-064: ``repairOf`` =
  the ``turnId`` of the latest ``ok`` reply (the page rejected it) rolls the state back first (``turns.py``).
- shutdown: a turn the server stopped (not the user) raises ``ManagerClosed`` (503 ``shutting_down``, A3-10).
- per-chat state is dropped when the reaper forgets the chat, or after ``limits.forget_after_s`` idle without a session
  (A3-03). ``progress``: the live snapshot of the chat's current or last request.
- ``models``: what the CLI offers in ``session/new`` (``models.availableModels``/``currentModelId``), from a live
  session or a one-off probe that never waits for a slot (all busy → ``AgentStartError``, 503; bounded by
  ``timeouts.start_s``; an empty list is cached too, A4-06); ``set_model`` picks one per chat (applied via the SV-C15
  model call on the chat's next turn; ``""`` = the CLI default).
"""

import asyncio
import time
from collections.abc import Callable
from typing import Any

from ..agent.errors import AgentStartError
from ..agent.manager import ManagerClosed, SessionManager, TurnCancelled
from ..log import get_logger
from ..settings import Settings
from .chats import Chat, UnknownModel
from .fallback import RETRY_EVENT
from .progress import Progress, ProgressBoard
from .prompts import action_prompt, user_prompt
from .repair import Outcome, converse, fallback_outcome
from .turns import ChatSurfaces

_log = get_logger("conversation.service")
MODELS_PROBE_CHAT = "\tmodels-probe"  # not printable: the HTTP API refuses it as a chatId, no client chat shares it


class ChatService:
    def __init__(self, settings: Settings, manager: SessionManager) -> None:
        self.settings, self.manager = settings, manager
        self.board = ProgressBoard()
        self._chats: dict[str, Chat] = {}
        self._offered: dict[str, Any] | None = None
        manager.on_reap(self._forget)

    def _chat(self, chat_id: str) -> Chat:
        chat = self._chats.setdefault(chat_id, Chat())
        chat.touched = time.monotonic()
        return chat

    def _forget(self, now: float, forgotten: list[str]) -> None:
        """Reaper hook (A3-03): drop the state of forgotten chats and of idle chats without a session."""
        idle = self.settings.limits.forget_after_s
        stale = [
            c
            for c, chat in self._chats.items()
            if chat.running is None
            and (c in forgotten or (self.manager.session(c) is None and now - chat.touched > idle))
        ]
        for chat_id in stale:
            self._chats.pop(chat_id, None)
            self.board.forget(chat_id)

    async def prompt(
        self, chat_id: str, text: str, request_id: str | None = None, repair_of: str | None = None
    ) -> Outcome:
        chat = self._chat(chat_id)
        chat.last_prompt = text
        key = ("id", request_id) if request_id else ("prompt", text)
        undo = (lambda s: s.rollback(repair_of, chat_id)) if repair_of else None
        reply = self.settings.reply
        first = user_prompt(text, reply.ui, reply.surfaces)
        need_ui = reply.ui == "always" or bool(repair_of)  # SV-C27: a repair of a rejected UI asks for UI
        return await self._joined(chat_id, key, lambda: self._run(chat_id, first, undo, need_ui))

    async def action(
        self,
        chat_id: str,
        surface_id: str,
        event: dict[str, Any],
        data_model: Any = None,
        request_id: str | None = None,
    ) -> Outcome:
        last = self._chat(chat_id).last_prompt
        if event.get("name") == RETRY_EVENT and last is not None:
            _log.info("[%s] %s: re-sending the last prompt", chat_id, RETRY_EVENT)
            return await self.prompt(chat_id, last, request_id)
        first = action_prompt(surface_id, event, data_model, self.settings.reply.surfaces)
        data = (lambda s: s.replace(s.state.with_data(surface_id, data_model))) if data_model is not None else None
        if not request_id:
            return await self._run(chat_id, first, data)
        return await self._joined(chat_id, ("id", request_id), lambda: self._run(chat_id, first, data))

    async def _joined(self, chat_id: str, key: tuple[str, str], start: Any) -> Outcome:
        """Join the chat's running request with the same key (A3-19, A4-08), else run a new one."""
        chat = self._chat(chat_id)
        if chat.running is not None and chat.running[0] == key and not chat.running[1].done():
            _log.info("[%s] the same request is still running: this one joins it", chat_id)
            return await asyncio.shield(chat.running[1])
        task = asyncio.get_running_loop().create_task(start())
        chat.running = (key, task)
        try:
            return await task
        finally:
            if chat.running is not None and chat.running[1] is task:
                chat.running = None

    async def cancel(self, chat_id: str) -> bool:
        """True when an unfinished request was marked (it ends ``cancelled``: the mark is checked before every turn and
        after every reply, A4-12) or a running turn was cancelled."""
        marked = self.board.request_cancel(chat_id)
        if marked == "queued":
            await self.manager.wake()
        running = await self.manager.cancel(chat_id)
        _log.info("[%s] cancel requested (marked: %s, turn running: %s)", chat_id, marked, running)
        return running or marked is not None

    def progress(self, chat_id: str) -> dict[str, Any] | None:
        progress = self.board.get(chat_id)
        return progress.snapshot() if progress else None

    async def models(self) -> dict[str, Any]:
        """``{"models": [{id, name, description}], "current": id | None}`` as the CLI offers them."""
        if self._offered is None:
            self._remember(self.manager.live_models())
        if self._offered is None:
            await self._probe_models()
        offered = self._offered or {}
        models = [
            {"id": m.get("modelId"), "name": m.get("name") or m.get("modelId"), "description": m.get("description")}
            for m in offered.get("availableModels") or []
            if isinstance(m, dict) and m.get("modelId")
        ]
        return {"models": models, "current": offered.get("currentModelId")}

    async def _probe_models(self) -> None:
        if not self.manager.free_slot():
            raise AgentStartError("busy", "every agent slot is busy, the model list is not known yet: retry later")
        try:
            async with asyncio.timeout(self.settings.timeouts.start_s), self.manager.turn(MODELS_PROBE_CHAT) as session:
                await session.start()
                models = getattr(session, "models", None)
                self._offered = models if isinstance(models, dict) else {}
        except TimeoutError as exc:
            raise AgentStartError(
                "timeout", f"the model probe did not start within {self.settings.timeouts.start_s}s"
            ) from exc

    async def set_model(self, chat_id: str, model: str) -> None:
        if model:
            ids = {m["id"] for m in (await self.models())["models"]}
            if ids and model not in ids:
                raise UnknownModel(f"model {model!r} is not offered by the agent CLI ({', '.join(sorted(ids))})")
        chat = self._chat(chat_id)
        chat.model, chat.ran_known = model or None, False
        chat.model_version += 1
        _log.info("[%s] model set to %s (applied on the next turn)", chat_id, model or "the CLI default")

    def chat_model(self, chat_id: str) -> str | None:
        """The chosen model until a turn ran, then the model that turn really ran (A3-12: a refused model call
        is not reported as applied)."""
        chat = self._chats.get(chat_id)
        if chat is None:
            return None
        return chat.ran if chat.ran_known else chat.model

    async def _run(
        self, chat_id: str, first: str, prepare: Callable[[ChatSurfaces], Any] | None = None, need_ui: bool = True
    ) -> Outcome:
        chat = self._chat(chat_id)
        max_repairs, surface = self.settings.repair.max_attempts, self.settings.reply.fallback == "surface"
        progress = Progress(chat_id, max_repairs + 1)
        self.board.publish(progress, unless_running=True)  # queued: running, attempt 0 (cancellable, A3-01)
        deadline = self.settings.timeouts.request_s
        try:
            async with (
                asyncio.timeout(deadline),
                self.manager.turn(chat_id, lambda: progress.cancel_requested) as session,
            ):
                self.board.publish(progress)
                if prepare is not None:
                    prepare(chat.surfaces)
                version = chat.model_version
                outcome = await converse(
                    session,
                    first,
                    max_repairs=max_repairs,
                    progress=progress,
                    label=chat_id,
                    model=chat.model,
                    state=chat.surfaces.state,
                    ui_required=need_ui,
                    fallback_surface=surface,
                )
                self._remember(getattr(session, "models", None))
                outcome.model = getattr(session, "applied_model", None)
                if chat.model_version == version:  # a model chosen during the turn stays the chat's (A4-05)
                    chat.ran, chat.ran_known = outcome.model, True
                if outcome.status == "ok" and outcome.state is not None:
                    outcome.turn_id = chat.surfaces.accept(outcome.state)
        except TurnCancelled:
            outcome = Outcome("cancelled", attempts=0, duration_ms=int((time.monotonic() - progress.started) * 1000))
        except TimeoutError:
            outcome = fallback_outcome(
                chat_id,
                "timeout",
                [*progress.last_errors, f"request exceeded {deadline}s"],
                progress.attempt,
                progress.started,
                surface=surface,
            )
        except AgentStartError as exc:
            outcome = fallback_outcome(
                chat_id, "start_failed", [str(exc)], progress.attempt, progress.started, surface=surface
            )
        progress.finish({"ok": "done"}.get(outcome.status, outcome.status))
        self.board.publish(progress, unless_running=True)  # e.g. the deadline passed while it was queued
        if outcome.status == "cancelled" and self.manager.closed and not progress.cancel_requested:
            _log.warning("[%s] request stopped by the server shutdown (503, not a user cancel)", chat_id)
            raise ManagerClosed("server shutting down: the request was stopped, retry later")
        _log.info(
            "[%s] request %s: attempts=%d duration=%dms reason=%s",
            chat_id,
            outcome.status,
            outcome.attempts,
            outcome.duration_ms,
            outcome.reason,
        )
        return outcome

    def _remember(self, models: Any) -> None:
        if isinstance(models, dict) and models.get("availableModels"):
            self._offered = models
