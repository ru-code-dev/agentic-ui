"""One asyncio loop thread that owns all agent state; HTTP threads submit coroutines to it (PLAN §5 concurrency risk).

``LoopThread.run(coro)`` blocks the calling (HTTP) thread until the coroutine finishes on the loop
(``asyncio.run_coroutine_threadsafe``), so a ``/cancel`` request on another thread reaches the session while
``/prompt`` waits. ``stop(cleanup)`` runs a final coroutine (manager shutdown) and then stops the loop.
"""

import asyncio
import threading
from collections.abc import Awaitable, Callable
from typing import Any

from ..log import get_logger

_log = get_logger("http.bridge")


class LoopThread:
    def __init__(self, name: str = "agentic-ui-loop") -> None:
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._main, name=name, daemon=True)
        self._ready = threading.Event()

    def _main(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.call_soon(self._ready.set)
        self.loop.run_forever()
        self.loop.close()

    def start(self) -> "LoopThread":
        self._thread.start()
        self._ready.wait()
        return self

    def run[T](self, coro: Awaitable[T], timeout: float | None = None) -> T:
        """Run ``coro`` on the loop and wait for its result (exceptions propagate to the caller)."""
        future = asyncio.run_coroutine_threadsafe(_wrap(coro), self.loop)
        try:
            return future.result(timeout)
        except TimeoutError:
            future.cancel()
            raise

    def call[T](self, fn: Callable[[], T]) -> T:
        """Run a plain function on the loop thread (reads of loop-owned state)."""
        return self.run(_call(fn))

    def stop(self, cleanup: Callable[[], Awaitable[Any]] | None = None, timeout: float = 30.0) -> None:
        if not self._thread.is_alive():
            return
        if cleanup is not None:
            try:
                self.run(cleanup(), timeout)
            except Exception:  # noqa: BLE001 - shutdown goes on; the failure is logged
                _log.exception("loop cleanup failed")
        self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(timeout)


async def _wrap[T](coro: Awaitable[T]) -> T:
    return await coro


async def _call[T](fn: Callable[[], T]) -> T:
    return fn()
