"""Per-chat records of ``ChatService`` (``service.py``): the chosen model, the last prompt, the running request and
the surface state (SV-C28)."""

import asyncio
import time
from dataclasses import dataclass, field

from .turns import ChatSurfaces


class UnknownModel(ValueError):
    """``set_model`` named a model the CLI does not offer."""


@dataclass
class Chat:
    model: str | None = None
    """The chosen model (None = CLI default)."""
    ran: str | None = None
    ran_known: bool = False
    """``ran``: the model the chat's last turn really ran (the session's applied model), known after a turn."""
    model_version: int = 0
    """Bumped by every ``set_model``: a turn records what it ran only if no newer choice arrived meanwhile (A4-05)."""
    last_prompt: str | None = None
    running: tuple[tuple[str, str], asyncio.Task] | None = None
    """The chat's running request (its join key, its task): ``("prompt", text)`` or ``("id", requestId)``."""
    surfaces: ChatSurfaces = field(default_factory=ChatSurfaces)
    """SV-C28: what the page shows after the chat's valid replies (DEC-064: the latest one can be undone)."""
    touched: float = field(default_factory=time.monotonic)
