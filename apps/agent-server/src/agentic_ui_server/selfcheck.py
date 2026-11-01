"""Operator self-check (``--check-agent``): start one session, run one turn, report what the agent advertises.

Used by operators before deploy (risk R1: a custom fork that differs from qwen 0.21.1) and by tier-3/4 tests.
"""

import json
import time
from typing import Any

from .acp.jsonrpc import RpcError
from .agent.session import AgentCrashed, AgentSession, AgentStartError, TurnTimeout
from .log import redact
from .resources import agent_files
from .settings import Settings

CHECK_CHAT_ID = "agentic-ui-server-check-agent"
DEFAULT_TEXT = "Reply with exactly: OK"


def _ids(items: Any) -> list[Any]:
    return [
        item.get("id") or item.get("modeId") or item.get("modelId") for item in items or [] if isinstance(item, dict)
    ]


async def check_agent(settings: Settings, text: str | None) -> dict[str, Any]:
    started = time.monotonic()
    session = AgentSession(settings, CHECK_CHAT_ID, files=agent_files(settings.agent))
    try:
        await session.start()
        turn = await session.run_turn(text or DEFAULT_TEXT)
        modes, models = session.modes or {}, session.models or {}
        return {
            "ok": True,
            "agentInfo": session.agent_info,
            "authMethods": _ids(session.auth_methods),
            "modes": {"current": modes.get("currentModeId"), "available": _ids(modes.get("availableModes"))},
            "model": models.get("currentModelId"),
            "sessionId": session.session_id,
            "stopReason": turn.stop_reason,
            "text": turn.text,
            "usage": turn.usage,
            "updateKinds": turn.kinds,
            "permissions": [vars(p) for p in turn.permissions],
            "durationMs": int((time.monotonic() - started) * 1000),
        }
    except AgentStartError as exc:
        return {
            "ok": False,
            "error": f"start:{exc.kind}",
            "message": str(exc),
            "exitCode": exc.exit_code,
            "stderrTail": exc.stderr_tail,
        }
    except AgentCrashed as exc:
        return {
            "ok": False,
            "error": "crashed",
            "message": str(exc),
            "exitCode": exc.exit_code,
            "stderrTail": exc.stderr_tail,
        }
    except (TurnTimeout, RpcError) as exc:
        return {"ok": False, "error": type(exc).__name__, "message": str(exc), "stderrTail": session.stderr_tail()}
    finally:
        await session.close()


def to_json(report: dict[str, Any]) -> str:
    return redact(json.dumps(report, ensure_ascii=False, indent=2))
