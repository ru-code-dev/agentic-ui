"""A chat's surface state with an undo of its latest accepted turn (SV-C28, DEC-064).

Every ``ok`` reply that becomes the chat's state gets a ``turnId`` (sent to the client). A reply the page rejects
after the server accepted it (an expression or render error, or the page's own validator) is in the server's state
already; the page's repair turn names it (``/prompt`` ``repairOf``) and the state goes back to what it was before
that turn, so the repair is checked against what the page shows. Only the latest accepted turn can be undone, and
only while the chat still holds the state it left (nothing changed the state since, an action's data included);
any other ``repairOf`` changes nothing.
"""

import secrets
from dataclasses import dataclass, field

from ..log import get_logger
from ..validation import SurfaceState

_log = get_logger("conversation.turns")


@dataclass
class ChatSurfaces:
    state: SurfaceState = field(default_factory=SurfaceState)
    """What the page shows after the chat's valid replies."""
    _last: tuple[str, SurfaceState, SurfaceState] | None = None
    """The latest accepted turn: its id, the state before it, the state it left."""

    def accept(self, state: SurfaceState) -> str:
        """``state`` (a valid reply merged into the chat's state) becomes the chat's state; the new turn's id."""
        turn_id = secrets.token_hex(8)
        self._last, self.state = (turn_id, self.state, state), state
        return turn_id

    def replace(self, state: SurfaceState) -> None:
        """Any other change of the state (an action's data model): the latest turn can no longer be undone."""
        self.state, self._last = state, None

    def rollback(self, turn_id: str | None, label: str = "") -> bool:
        """Back to the state before turn ``turn_id`` when it is the latest one and its state is still the chat's."""
        last = self._last
        undone = bool(turn_id) and last is not None and last[0] == turn_id and last[2] is self.state
        if undone and last is not None:
            self.state, self._last = last[1], None
        _log.info("[%s] repairOf %s: %s", label, turn_id, "rolled back" if undone else "not the latest turn, ignored")
        return undone
