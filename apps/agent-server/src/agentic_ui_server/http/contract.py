"""The HTTP API contract (PLAN §4 P6; SV-C6, SV-C12, SV-C20, SV-C25) as one table.

``ROUTES`` drives the dispatcher (``api.py``: every route's ``handler`` is an ``Api`` method) and the generated
hand-over document ``SERVER-CONTRACT.md`` (SV-C23, ``contract_doc.py``), so the two cannot disagree on endpoints,
fields or status codes (a test also compares every documented response field with what the API returns).
Paths are relative to ``server.base_path`` (a path such as ``/api`` or an absolute URL whose path is used).
"""

from dataclasses import dataclass, replace
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Field:
    name: str
    type: str
    """``string`` | ``object`` | ``boolean`` | ``integer`` | ``array`` | ``any`` (JSON types)."""
    required: bool
    meaning: str
    max_length: int | None = None
    """A string of 1..max_length printable characters (A4b-H3: ``api.py`` checks it, ``contract_doc`` states it)."""

    @property
    def constraint(self) -> str:
        return f"1..{self.max_length} printable characters" if self.max_length else ""


@dataclass(frozen=True)
class Route:
    method: str
    path: str
    handler: str
    summary: str
    request: tuple[Field, ...] = ()
    """POST: JSON body fields; GET: query parameters."""
    response: tuple[Field, ...] = ()
    statuses: tuple[int, ...] = (200,)
    optional: bool = False
    """A production backend that replaces this server may leave it out (the Agent page then just waits)."""


STATUS_TEXT = {
    200: "OK (also for a fallback or a cancelled request: read `status`)",
    204: "CORS preflight answered",
    400: "bad JSON, a missing/mistyped field, or an unknown model",
    404: "unknown path, or no request seen yet for this chat (progress)",
    405: "known path, wrong method",
    413: "body larger than server.max_body_bytes",
    429: "too many requests already queued for this chat (limits.max_queue_per_chat) or waiting across all chats "
    "(limits.max_waiting)",
    500: "server error; prompt/action answer with the fallback body (`status: fallback`, `reason: server_error`)",
    503: "server shutting down (`shutting_down`, also for a request the shutdown stopped: retry later; a user's "
    "own cancel is a 200 `cancelled`), or the agent CLI cannot be started / is not found",
}

CHAT_ID = Field("chatId", "string", True, "conversation id chosen by the client; one agent session per chat", 200)
REQUEST_ID = Field(
    "requestId",
    "string",
    False,
    "A4-08: id of one logical request, kept by the client's retry of it: a request with the chat's running "
    "request's `requestId` joins it (one agent turn, the same answer); without it a `/prompt` joins only a running "
    "one with the same `text`",
    200,
)
REPAIR_OF = Field(
    "repairOf",
    "string",
    False,
    "DEC-064: the `turnId` of the chat's latest `ok` reply that the client rejected (an expression or render error, "
    "its own validator): the server first rolls the chat's surface state back to before that turn, then runs this "
    "prompt (the client's exact errors) as its repair, checked against what the client shows; any other id changes "
    "nothing. A server without the rollback ignores it",
    200,
)
CONTRACT_VERSION = Field(
    "contractVersion",
    "string",
    True,
    "DEC-056: `<catalogId> sha256:<12 hex>` of the catalog this server validates against (= handover/manifest.json "
    "`contractVersion`); in every JSON answer, errors included. A client built for another contract (or an answer "
    "without it) must not render: show a version mismatch instead",
)
OUTCOME = (
    Field("chatId", "string", True, "echo of the request's chatId"),
    Field("status", "string", True, "`ok` (text + valid UI, or text only), `fallback` (UI failed) or `cancelled`"),
    Field(
        "messages",
        "array",
        True,
        "A2UI v0.9 messages, always valid for the catalog; `[]` for a text-only `ok`, a `cancelled`, and a `fallback` "
        'with `reply.fallback = "text"` (SV-C27)',
    ),
    Field("text", "string", True, "the agent's prose outside the UI block, always shown (kept in a fallback)"),
    Field("fallback", "boolean", True, "`true` exactly when status is `fallback`"),
    Field("errors", "array", True, "problems of the last invalid reply (strings); `[]` when ok"),
    Field("attempts", "integer", True, "agent replies used: 1 first reply + repairs"),
    Field(
        "reason", "string", False, "fallback cause: invalid, timeout, crash, agent_error, start_failed, server_error"
    ),
    Field("durationMs", "integer", True, "wall time of the request"),
    Field("model", "string", False, "the model the turn ran (the agent accepted it); null = the CLI default"),
    Field(
        "turnId",
        "string",
        False,
        "DEC-064: `ok` only (else null): the id of this reply in the chat's surface state; a `/prompt` repairing it "
        "sends it as `repairOf`",
    ),
)
ERROR = (
    Field(
        "error",
        "string",
        True,
        "machine code: bad_json, bad_request, not_found, method_not_allowed, too_large, queue_full, unknown_model, …",
    ),
    Field("message", "string", True, "human-readable detail (never contains secrets)"),
    CONTRACT_VERSION,
)

ROUTES = (
    Route(
        "POST",
        "/prompt",
        "prompt",
        "Pasted data + instruction → valid UI (or the fallback). Waits for the whole turn and repairs (no streaming).",
        (CHAT_ID, Field("text", "string", True, "the user's paste and instruction, as typed"), REQUEST_ID, REPAIR_OF),
        OUTCOME,
        (200, 400, 413, 429, 500, 503),
    ),
    Route(
        "POST",
        "/action",
        "action",
        "A button action (+ the surface's data model) → UI update. `agent.retry` re-sends the chat's last prompt.",
        (
            CHAT_ID,
            Field("surfaceId", "string", True, "surface the action came from"),
            Field("event", "object", True, "`{name, context?}` from the component's action"),
            Field(
                "dataModel",
                "any",
                False,
                "the surface's current data model (SV-C28: replaces the server's copy of that surface's data before "
                "the reply is checked)",
            ),
            REQUEST_ID,
        ),
        OUTCOME,
        (200, 400, 413, 429, 500, 503),
    ),
    Route(
        "POST",
        "/cancel",
        "cancel",
        "Cancels the chat's running turn (ACP session/cancel); the waiting /prompt or /action returns `cancelled`.",
        (CHAT_ID,),
        (
            CHAT_ID,
            Field(
                "cancelled",
                "boolean",
                True,
                "the chat's unfinished request was marked (it ends `cancelled`) or its running turn got the cancel",
            ),
        ),
        (200, 400),
        optional=True,
    ),
    Route(
        "GET",
        "/progress",
        "progress",
        "Live state of the chat's current (or last) request, for the working message (poll while waiting).",
        (CHAT_ID,),
        (
            CHAT_ID,
            Field("state", "string", True, "running, repairing, done, fallback or cancelled"),
            Field("attempt", "integer", True, "current reply number (1 = first reply, 2.. = repairs; 0 = queued)"),
            Field("maxAttempts", "integer", True, "1 + repair.max_attempts"),
            Field("errors", "array", True, "problems of the last invalid reply"),
            Field("errorCount", "integer", True, "len(errors)"),
            Field("elapsedMs", "integer", True, "since the request started (frozen when finished)"),
        ),
        (200, 400, 404),
        optional=True,
    ),
    Route(
        "GET",
        "/models",
        "models",
        "Models the agent CLI offers (ACP session/new), the CLI default and the chat's current choice.",
        (Field("chatId", "string", False, "chat whose choice is reported in `current`", 200),),
        (
            Field("models", "array", True, "`[{id, name, description}]` as the CLI lists them"),
            Field("default", "string", False, "the CLI's current model (used when a chat chose none)"),
            Field("current", "string", False, "the chat's model (after a turn: the one it really ran), else `default`"),
        ),
        (200, 503),
        optional=True,
    ),
    Route(
        "POST",
        "/model",
        "set_model",
        "Sets the chat's model (an id from /models; `\"\"` = CLI default); applied on the chat's next turn.",
        (CHAT_ID, Field("model", "string", True, 'model id from /models, or `""`')),
        (CHAT_ID, Field("model", "string", True, 'the chat\'s model now (`""` = CLI default)')),
        (200, 400, 503),
        optional=True,
    ),
    Route(
        "GET",
        "/health",
        "health",
        "Liveness + agent CLI found + live agent processes (503 when the CLI is not found).",
        (),
        (
            Field("status", "string", True, "`ok` or `degraded`"),
            Field("version", "string", True, "server version"),
            Field("agentFound", "boolean", True, "agent.bin resolves to a file"),
            Field("liveSessions", "integer", True, "running agent processes"),
            Field("maxLiveAgents", "integer", True, "limits.max_live_agents"),
        ),
        (200, 503),
        optional=True,
    ),
)
ROUTES = tuple(replace(route, response=(*route.response, CONTRACT_VERSION)) for route in ROUTES)


def route_prefix(base_path: str) -> str:
    """``server.base_path`` → URL path prefix without a trailing slash (``"/"`` → ``""``)."""
    path = urlsplit(base_path).path if "://" in base_path else base_path
    return "/" + path.strip("/") if path.strip("/") else ""


def find_route(method: str, path: str) -> tuple[Route | None, bool]:
    """``(route, path_known)`` for a path relative to the prefix."""
    same_path = [r for r in ROUTES if r.path == path]
    return next((r for r in same_path if r.method == method), None), bool(same_path)
