"""User-turn texts sent to the agent (PLAN §4 P5, SV-C8, SV-C14).

The system prompt (bundled ``system-prompt.md``) carries the contract, rules and examples; these turns only add the
user's input and, after an invalid reply, the exact problems. Every text asks for one complete ``<a2ui-json>`` block.
"""

import json
from typing import Any

from ..a2ui.lexer import CLOSE_TAG, OPEN_TAG
from ..log import printable
from ..validation import SurfaceState

NO_QUESTIONS = "Do not ask questions. Produce the UI now using reasonable assumptions."
MAX_NOTED_SURFACES, MAX_NOTED_IDS = 10, 20
REPLY_RULE = f"Reply with the complete UI as one {OPEN_TAG}…{CLOSE_TAG} block of A2UI messages."
NO_BLOCK = f"Your reply has no {OPEN_TAG} block. Produce the UI now. {REPLY_RULE}"
AUTO_RULE = (
    f"If this request needs a UI (data to show, a form, a choice to make), reply with a short text and one "
    f"{OPEN_TAG}…{CLOSE_TAG} block of A2UI messages; if a text answer is enough, reply with text only, without a "
    "block. Do not ask questions: make reasonable assumptions."
)
SINGLE_RULE = (
    "This chat keeps exactly one surface: when a surface is shown, update it (same surfaceId, no createSurface) "
    "instead of creating another one."
)
EMPTY = "Your reply is empty. Answer the request: text, or text and the UI block."


def user_prompt(text: str, ui: str = "always", surfaces: str = "many") -> str:
    """The pasted data + instruction, as the user wrote them, plus the reply rule of the ``reply.ui`` mode (SV-C27)
    and, for ``reply.surfaces = "single"``, the one-surface rule."""
    rule = AUTO_RULE if ui == "auto" else f"{REPLY_RULE} {NO_QUESTIONS}"
    return f"{text.strip()}\n\n{rule}{single_rule(surfaces)}"


def single_rule(surfaces: str) -> str:
    return f" {SINGLE_RULE}" if surfaces == "single" else ""


def action_prompt(surface_id: str, event: dict[str, Any], data_model: Any, surfaces: str = "many") -> str:
    """A button action as a JSON user turn: event name + resolved context + the surface's current data model."""
    action = {"surfaceId": surface_id, "event": event, "dataModel": data_model}
    return (
        "The user triggered an action in the UI:\n"
        f"{json.dumps({'action': action}, ensure_ascii=False, indent=2)}\n\n"
        f"Answer it with the A2UI messages that update this surface (a small updateDataModel or updateComponents "
        f"for surface '{surface_id}', or a new surface). {REPLY_RULE} {NO_QUESTIONS}{single_rule(surfaces)}"
    )


def shown_surfaces(state: SurfaceState) -> str:
    """SV-C28: what the page already shows (the reply is checked merged into it), for a follow-up's repair."""
    if not state.surfaces:
        return ""
    parts = []
    for sid, surface in list(state.surfaces.items())[:MAX_NOTED_SURFACES]:
        ids = list(surface.components)
        more = f", … {len(ids)} in all" if len(ids) > MAX_NOTED_IDS else ""
        parts.append(printable(f"'{sid}' (components: {', '.join(ids[:MAX_NOTED_IDS]) or 'none'}{more})"))
    return (
        f"\n\nThe page already shows: {'; '.join(parts)}. Your reply is applied to these surfaces: update a shown "
        "surface without createSurface (deleteSurface it first to create it again), and update no other surface "
        "unless the reply creates it."
    )


def repair_prompt(errors: list[str], state: SurfaceState | None = None) -> str:
    """The exact problems of the last reply (CF-I4, capped: A4-01), what the page already shows (SV-C28) and the
    rule to resend the whole reply."""
    lines = "\n".join(f"- {error}" for error in errors)
    return (
        f"Your last reply is not valid A2UI for this catalog. Fix every problem below:\n{lines}"
        f"{shown_surfaces(state) if state is not None else ''}\n\n"
        f"Reply with the complete corrected {OPEN_TAG} block (all messages again, not only the changes). {NO_QUESTIONS}"
    )


def is_question(text: str) -> bool:
    """A text-only reply that asks the user something (SV-C14)."""
    return "?" in text or "？" in text


def no_ui_prompt(reply_text: str) -> str:
    """What to send after a reply without any block: the no-questions order for a question, else the tag rule."""
    return NO_QUESTIONS if is_question(reply_text) else NO_BLOCK
