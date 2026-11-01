"""A scripted stand-in for ``AgentSession`` (tier 1 tests of the conversation layer)."""

import asyncio
import json
import time
from pathlib import Path
from typing import Any

from agentic_ui_server.acp.protocol import StopReason
from agentic_ui_server.agent.turn import TurnResult

from .node import CATALOG_PKG

MODELS = {
    "availableModels": [{"modelId": "model-a", "name": "Model A"}, {"modelId": "model-b"}],
    "currentModelId": "model-a",
}


def example(name: str = "01-login") -> list:
    path = Path(CATALOG_PKG / "examples" / "compositions" / f"{name}.json")
    return json.loads(path.read_text(encoding="utf-8"))["messages"]


def again(name: str = "01-login") -> list:
    """The composition as a reply valid in any chat state (SV-C28): deleteSurface first, then create it again."""
    messages = example(name)
    sid = messages[0]["createSurface"]["surfaceId"]
    return [{"version": messages[0]["version"], "deleteSurface": {"surfaceId": sid}}, *messages]


def reply(messages: list, text: str = "Готово.") -> str:
    return f"{text}\n<a2ui-json>\n{json.dumps(messages, ensure_ascii=False)}\n</a2ui-json>"


def broken(extra: dict | None = None) -> list:
    messages = example()
    messages[2]["updateComponents"]["components"][0].update(extra or {"bogus": 1})
    return messages


class StubSession:
    """``steps``: reply texts, exceptions to raise, ``("hang", seconds)`` (ends cancelled when cancelled or closed,
    else with an empty reply) or ``("slow", seconds, text)`` (the reply after a delay); records prompts and models."""

    def __init__(self, chat_id: str, steps: list[Any]) -> None:
        self.chat_id, self.steps = chat_id, list(steps)
        self.prompts: list[str] = []
        self.models_used: list[str | None] = []
        self.models = MODELS
        self.applied_model: str | None = None
        self.refuse_models = False
        """True: every model call is refused (the session keeps the CLI default, A3-12)."""
        self.is_live, self.last_used = False, time.monotonic()  # live from its first turn, like AgentSession
        self._cancel = asyncio.Event()

    async def start(self) -> None:
        self.is_live = True

    async def run_turn(self, text: str, model: str | None = None) -> TurnResult:
        self.is_live = True
        self.prompts.append(text)
        self.models_used.append(model)
        if not self.refuse_models:
            self.applied_model = model
        step = self.steps.pop(0) if self.steps else "no reply scripted"
        if isinstance(step, BaseException):
            raise step
        stop = StopReason.END_TURN
        if isinstance(step, tuple) and step[0] == "slow":
            await asyncio.sleep(step[1])
            step = step[2]
        if isinstance(step, tuple):
            try:
                await asyncio.wait_for(self._cancel.wait(), step[1])
                stop = StopReason.CANCELLED
            except TimeoutError:
                pass
            step = ""
        return TurnResult(step, "", {}, None, None, stop, 1)

    async def cancel(self) -> bool:
        self._cancel.set()
        return True

    async def close(self) -> None:
        self._cancel.set()  # like AgentSession.close: a busy turn ends cancelled
        self.is_live = False
