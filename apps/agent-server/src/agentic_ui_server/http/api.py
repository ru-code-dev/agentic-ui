"""HTTP API dispatch (PLAN §4 P6): ``(method, target, body)`` → ``Response`` over the chat service, no sockets.

Routes, fields and status codes come from ``contract.ROUTES``. Requests are checked against the route's fields
(400 names the field). Service calls run on the agent loop through ``run`` (the bridge), so HTTP threads never touch
agent state. ``QueueFull`` → 429, ``ManagerClosed``/agent start failure → 503, ``UnknownModel`` → 400, any other
error → 500, and for ``/prompt``/``/action`` the 500 body is the fallback surface (the page still renders a UI).
"""

import json
import shutil
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from .. import __version__
from ..agent.errors import AgentStartError
from ..agent.manager import ManagerClosed, QueueFull
from ..conversation.fallback import fallback_payload
from ..conversation.repair import Outcome
from ..conversation.service import UnknownModel
from ..log import get_logger, redact
from ..resources import contract_version
from ..settings import AgentSettings, Settings
from .contract import Route, find_route, route_prefix

_log = get_logger("http.api")
_TYPES: dict[str, type | tuple[type, ...]] = {"string": str, "object": dict, "boolean": bool, "array": list}
Runner = Callable[[Awaitable[Any]], Any]


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code = status, code


@dataclass
class Response:
    status: int
    body: dict[str, Any] | None
    chat_id: str | None = None
    outcome: str | None = None
    """The request outcome for the access log (``ok`` / ``fallback`` / ``cancelled`` / error code)."""


def agent_found(agent: AgentSettings) -> bool:
    return Path(agent.bin).is_file() or shutil.which(agent.bin) is not None


async def _value(fn: Callable[..., Any], *args: Any) -> Any:
    return fn(*args)


class Api:
    def __init__(self, service: Any, run: Runner, settings: Settings) -> None:
        self.service, self.run, self.settings = service, run, settings
        self.prefix = route_prefix(settings.server.base_path)

    def handle(self, method: str, target: str, body: bytes = b"") -> Response:
        """The response; its agent-originated texts (``message``, ``text``, ``errors``) leave redacted (SV-C16); every
        JSON body carries ``contractVersion`` (DEC-056)."""
        response = self._handle(method, target, body)
        if response.body is not None:
            response.body = {**_redacted(response.body), "contractVersion": contract_version()}  # DEC-056
        return response

    def _handle(self, method: str, target: str, body: bytes) -> Response:
        split = urlsplit(target)
        path = split.path.rstrip("/")
        if not path.startswith(self.prefix + "/"):
            return _error(404, "not_found", f"no route {split.path}")
        route, known = find_route(method, path[len(self.prefix) :])
        if route is None:
            return (
                _error(405, "method_not_allowed", f"{method} not allowed")
                if known
                else _error(404, "not_found", f"no route {split.path}")
            )
        args: dict[str, Any] = {}
        try:
            args = self._parse(route, split.query, body)
            self._check(route, args)
            return getattr(self, f"_{route.handler}")(args)
        except ApiError as exc:
            chat = args.get("chatId")
            return _error(exc.status, exc.code, str(exc), chat if isinstance(chat, str) else None)
        except UnknownModel as exc:
            return _error(400, "unknown_model", str(exc), args.get("chatId"))
        except QueueFull as exc:
            return _error(429, "queue_full", str(exc), args.get("chatId"))
        except ManagerClosed as exc:
            return _error(503, "shutting_down", str(exc), args.get("chatId"))
        except AgentStartError as exc:
            return _error(503, "agent_unavailable", str(exc), args.get("chatId"))
        except Exception as exc:  # noqa: BLE001 - every failure becomes a logged 500, never a dropped request
            _log.exception("[%s] %s %s failed", args.get("chatId"), method, route.path)
            if route.handler in ("prompt", "action"):
                outcome = Outcome(
                    "fallback", fallback_payload(), "", [f"server error: {type(exc).__name__}"], 0, "server_error"
                )
                return Response(
                    500, {"chatId": args.get("chatId"), **outcome.to_dict()}, args.get("chatId"), "fallback"
                )
            return _error(500, "server_error", type(exc).__name__, args.get("chatId"))

    def _parse(self, route: Route, query: str, body: bytes) -> dict[str, Any]:
        if route.method == "GET":
            return {k: v[-1] for k, v in parse_qs(query).items()}
        try:
            args = json.loads(body or b"{}")
        except (ValueError, RecursionError) as exc:  # JSONDecodeError, UnicodeDecodeError, int digits limit (A4-03)
            raise ApiError(400, "bad_json", f"body is not JSON: {type(exc).__name__}: {str(exc)[:200]}") from exc
        if not isinstance(args, dict):
            raise ApiError(400, "bad_request", "body must be a JSON object")
        return args

    def _check(self, route: Route, args: dict[str, Any]) -> None:
        for f in route.request:
            if f.name not in args:
                if f.required:
                    raise ApiError(400, "bad_request", f"missing field '{f.name}'")
                continue
            expected = _TYPES.get(f.type)
            if expected and not isinstance(args[f.name], expected):
                raise ApiError(400, "bad_request", f"field '{f.name}' must be a {f.type}")
            value = args[f.name]
            if f.max_length and not (0 < len(value) <= f.max_length and value.isprintable()):
                raise ApiError(400, "bad_request", f"field '{f.name}' must be {f.constraint}")

    def _outcome(self, chat_id: str, outcome: Outcome) -> Response:
        return Response(200, {"chatId": chat_id, **outcome.to_dict()}, chat_id, outcome.status)

    def _prompt(self, a: dict[str, Any]) -> Response:
        prompt = self.service.prompt(a["chatId"], a["text"], a.get("requestId"), a.get("repairOf"))
        return self._outcome(a["chatId"], self.run(prompt))

    def _action(self, a: dict[str, Any]) -> Response:
        event = a["event"]
        if not isinstance(event.get("name"), str) or not event["name"]:
            raise ApiError(400, "bad_request", "field 'event.name' must be a non-empty string")
        if not isinstance(event.get("context", {}), dict):
            raise ApiError(400, "bad_request", "field 'event.context' must be an object")
        outcome = self.run(
            self.service.action(a["chatId"], a["surfaceId"], event, a.get("dataModel"), a.get("requestId"))
        )
        return self._outcome(a["chatId"], outcome)

    def _cancel(self, a: dict[str, Any]) -> Response:
        cancelled = bool(self.run(self.service.cancel(a["chatId"])))
        return Response(200, {"chatId": a["chatId"], "cancelled": cancelled}, a["chatId"])

    def _progress(self, a: dict[str, Any]) -> Response:
        snap = self.run(_value(self.service.progress, a["chatId"]))
        if snap is None:
            raise ApiError(404, "not_found", f"no request seen for chat {a['chatId']!r}")
        keys = ("state", "attempt", "maxAttempts", "errorCount", "elapsedMs")
        body = {"chatId": a["chatId"], **{k: snap[k] for k in keys}, "errors": snap["lastErrors"]}
        return Response(200, body, a["chatId"], snap["state"])

    def _models(self, a: dict[str, Any]) -> Response:
        offered = self.run(self.service.models())
        chat = a.get("chatId")
        chosen = self.run(_value(self.service.chat_model, chat)) if chat else None
        body = {"models": offered["models"], "default": offered["current"], "current": chosen or offered["current"]}
        return Response(200, body, chat)

    def _set_model(self, a: dict[str, Any]) -> Response:
        self.run(self.service.set_model(a["chatId"], a["model"]))
        model = self.run(_value(self.service.chat_model, a["chatId"])) or ""
        return Response(200, {"chatId": a["chatId"], "model": model}, a["chatId"])

    def _health(self, _: dict[str, Any]) -> Response:
        found = agent_found(self.settings.agent)
        body = {
            "status": "ok" if found else "degraded",
            "version": __version__,
            "agentFound": found,
            "liveSessions": self.run(_value(lambda: self.service.manager.live_count)),
            "maxLiveAgents": self.settings.limits.max_live_agents,
        }
        return Response(200 if found else 503, body, None, body["status"])


def _redacted(body: dict[str, Any]) -> dict[str, Any]:
    out = dict(body)
    for key in ("message", "text"):
        if isinstance(out.get(key), str):
            out[key] = redact(out[key])
    if isinstance(out.get("errors"), list):
        out["errors"] = [redact(e) if isinstance(e, str) else e for e in out["errors"]]
    return out


def _error(status: int, code: str, message: str, chat_id: str | None = None) -> Response:
    return Response(status, {"error": code, "message": message}, chat_id, code)
