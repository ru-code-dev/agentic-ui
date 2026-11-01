"""Serve mode (the default mode of ``python3 agentic-ui-server.pyz``): HTTP API over the chat service.

``App`` wires the pieces: the agent loop thread (owns ``SessionManager`` + ``ChatService``), ``Api`` and the
threaded HTTP server bound to ``server.host``/``server.port`` under ``server.base_path`` (SV-C12). ``serve()`` runs
until SIGINT/SIGTERM, then closes the HTTP server and every agent process. Tests build an ``App`` with
``port=0`` (or their own service factory) and call ``start()``/``close()``.
"""

import signal
import threading
from collections.abc import Callable
from typing import Any

from .agent.manager import SessionManager
from .conversation.service import ChatService
from .http.api import Api, agent_found
from .http.bridge import LoopThread
from .http.contract import route_prefix
from .http.server import ApiServer
from .log import get_logger
from .resources import agent_files
from .settings import Settings

_log = get_logger("serve")
ServiceFactory = Callable[[Settings], Any]


def default_service(settings: Settings) -> ChatService:
    """Runs on the loop thread: the manager's reaper task needs the running loop."""
    manager = SessionManager(settings, files=agent_files(settings.agent))
    manager.start_reaper()
    return ChatService(settings, manager)


async def _build(factory: ServiceFactory, settings: Settings) -> Any:
    return factory(settings)


class App:
    def __init__(self, settings: Settings, service_factory: ServiceFactory = default_service) -> None:
        self.settings = settings
        self.loop = LoopThread().start()
        self.service = self.loop.run(_build(service_factory, settings))
        wait = settings.timeouts.request_s + settings.timeouts.start_s + 30
        self.api = Api(self.service, lambda coro: self.loop.run(coro, wait), settings)
        self.http = ApiServer(self.api, settings.server)
        self._thread: threading.Thread | None = None

    @property
    def url(self) -> str:
        host, port = self.http.server_address[:2]
        return f"http://{host}:{port}{route_prefix(self.settings.server.base_path)}"

    def start(self) -> "App":
        """Serve on a background thread (tests); ``serve_forever`` blocks instead."""
        self._thread = threading.Thread(target=self.http.serve_forever, name="agentic-ui-http", daemon=True)
        self._thread.start()
        return self

    def serve_forever(self) -> None:
        self.http.serve_forever()

    def close(self) -> None:
        if self._thread is not None:
            self.http.shutdown()
            self._thread.join(10)
        self.http.server_close()
        manager = getattr(self.service, "manager", None)
        self.loop.stop(manager.shutdown if manager is not None else None)
        _log.info("server stopped")


def serve(settings: Settings) -> int:
    try:
        app = App(settings)
    except OSError as exc:
        _log.error("cannot listen on %s:%d: %s", settings.server.host, settings.server.port, exc)
        return 1
    if not agent_found(settings.agent):
        _log.warning("agent CLI %r not found: /health reports degraded until it exists", settings.agent.bin)

    def on_signal(signum: int, _frame: Any) -> None:
        _log.info("signal %s: shutting down", signal.Signals(signum).name)
        threading.Thread(target=app.http.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    _log.info("listening on %s (max %d live agents)", app.url, settings.limits.max_live_agents)
    try:
        app.serve_forever()
    finally:
        app.close()
    return 0
