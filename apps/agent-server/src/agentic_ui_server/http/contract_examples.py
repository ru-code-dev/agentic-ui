"""Request/response examples for ``SERVER-CONTRACT.md``, produced by the real ``Api`` (SV-C23).

``ExampleService`` is a deterministic stand-in for ``ChatService`` (fixed outcomes, no agent); every example
request goes through ``Api.handle`` so the documented responses are exactly what the dispatcher returns.
"""

import asyncio
import json
import sys
from typing import Any

from ..config import load_settings
from ..conversation.fallback import fallback_payload
from ..conversation.repair import Outcome
from ..resources import read_data_json
from .api import Api, Response
from .contract import ROUTES, Route

CHAT = "chat-42"
SURFACE = "orders"
MODELS = [  # neutral ids: the build names no model or provider (SV-C15); the CLI's own list is shown at runtime
    {"id": "model-a", "name": "Model A", "description": "the CLI's default model"},
    {"id": "model-b", "name": "Model B", "description": None},
]


def ok_messages() -> list[dict[str, Any]]:
    """A small valid surface (validated against the catalog by the test suite)."""
    catalog_id = read_data_json("catalog.json")["catalogId"]
    components = [
        {"id": "root", "component": "Flex", "direction": "column", "gap": "2", "children": ["title", "total"]},
        {"id": "title", "component": "Heading", "text": "Заказы", "size": "md"},
        {"id": "total", "component": "Text", "text": {"path": "/total"}},
    ]
    return [
        {"version": "v0.9", "createSurface": {"surfaceId": SURFACE, "catalogId": catalog_id}},
        {"version": "v0.9", "updateComponents": {"surfaceId": SURFACE, "components": components}},
        {"version": "v0.9", "updateDataModel": {"surfaceId": SURFACE, "path": "/total", "value": "Итого: 3 500 ₽"}},
    ]


class _Manager:
    live_count = 1


class ExampleService:
    manager = _Manager()

    def __init__(self) -> None:
        self._model: dict[str, str] = {}

    async def prompt(
        self, chat_id: str, text: str, request_id: str | None = None, repair_of: str | None = None
    ) -> Outcome:
        return Outcome("ok", ok_messages(), "Готово: таблица заказов с итогом.", [], 1, None, 24_500)

    async def action(
        self, chat_id: str, surface_id: str, event: dict[str, Any], data_model: Any, request_id: str | None = None
    ) -> Outcome:
        errors = ["/updateComponents/components/0/children: unknown component id 'rows'"]
        return Outcome("fallback", fallback_payload(), "", errors, 4, "invalid", 96_000)

    async def cancel(self, chat_id: str) -> bool:
        return True

    def progress(self, chat_id: str) -> dict[str, Any]:
        errors = ["/updateComponents/components/2: unknown property 'bogus'"]
        return {"state": "repairing", "attempt": 2, "maxAttempts": 4, "lastErrors": errors, "errorCount": 1} | {
            "elapsedMs": 31_200
        }

    async def models(self) -> dict[str, Any]:
        return {"models": MODELS, "current": MODELS[0]["id"]}

    async def set_model(self, chat_id: str, model: str) -> None:
        self._model[chat_id] = model

    def chat_model(self, chat_id: str) -> str | None:
        return self._model.get(chat_id)


REQUESTS: dict[str, tuple[str, dict[str, Any] | None]] = {
    "prompt": ("", {"chatId": CHAT, "text": "Имя,Сумма\nАнна,1200\nБорис,2300\n\nПокажи таблицей с итогом."}),
    "action": ("", {"chatId": CHAT, "surfaceId": SURFACE, "event": {"name": "sort", "context": {"by": "Сумма"}}}),
    "cancel": ("", {"chatId": CHAT}),
    "progress": (f"?chatId={CHAT}", None),
    "set_model": ("", {"chatId": CHAT, "model": MODELS[1]["id"]}),
    "models": (f"?chatId={CHAT}", None),
    "health": ("", None),
}


def example_api() -> Api:
    settings = load_settings(["--set", f"agent.bin={sys.executable}"], {"HOME": "/home/svc"})
    return Api(ExampleService(), asyncio.run, settings)


def examples() -> list[tuple[Route, dict[str, Any] | None, str, Response]]:
    """``(route, request body, query, response)`` per route, in ``ROUTES`` order (``/model`` before ``/models``)."""
    api, out = example_api(), {}
    for handler in REQUESTS:
        route = next(r for r in ROUTES if r.handler == handler)
        query, body = REQUESTS[handler]
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else b""
        out[handler] = (route, body, query, api.handle(route.method, f"{api.prefix}{route.path}{query}", data))
    return [out[r.handler] for r in ROUTES]
