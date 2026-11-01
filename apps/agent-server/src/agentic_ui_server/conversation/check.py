"""One agent reply → its UI messages and merged chat state, or its problems (SV-C7, SV-C8, SV-C28).

A reply is invalid when it is over ``MAX_REPLY_CHARS`` (not read at all), has no ``<a2ui-json>`` block while UI is
required (a question gets the no-questions order, SV-C14; SV-C27 ``reply.ui = "auto"``: a text-only answer to a
``/prompt`` is valid), has a block that cannot be read, or holds messages that fail
``validate_step`` against what the chat already shows (the WHOLE merged state: unknown surface, dangling/orphaned
ids, missing root, cycles, data-model writes, bound values). Each problem is one validator issue, one line, with
every non-printable character escaped (A4-02). What leaves here is capped (A4-01): at most ``MAX_REPORTED_ERRORS``
problems of at most ``MAX_ERROR_CHARS`` characters plus a summary line; ``total`` keeps the true count. The repair
prompt, the fallback's ``errors`` and ``/progress`` all use the capped list.
"""

from dataclasses import dataclass
from typing import Any

from ..a2ui.extract import extract
from ..log import printable
from ..validation import SurfaceState, validate_step
from .prompts import EMPTY, is_question, no_ui_prompt, repair_prompt

MAX_REPLY_CHARS = 512 * 1024
"""A UI reply is a few KB (the largest example ~20 KB); a longer one is invalid without being lexed or read."""
MAX_REPORTED_ERRORS = 50
MAX_ERROR_CHARS = 300


@dataclass(frozen=True)
class ReplyCheck:
    messages: list[Any]
    problems: list[str]
    """Empty = valid UI (capped, ``cap_problems``)."""
    prompt: str | None
    """The next prompt (repair / no-UI) when there are problems."""
    text: str
    """The reply's prose (the Outcome text of a valid reply)."""
    state: SurfaceState | None = None
    """The chat's merged surface state after a valid reply (None: invalid, the chat keeps its state)."""
    total: int = 0
    """The true number of problems (``problems`` is capped)."""


def cap_problems(problems: list[str]) -> list[str]:
    shown = [p if len(p) <= MAX_ERROR_CHARS else p[: MAX_ERROR_CHARS - 1] + "…" for p in problems[:MAX_REPORTED_ERRORS]]
    hidden = len(problems) - MAX_REPORTED_ERRORS
    if hidden > 0:
        shown.append(
            f"… and {hidden} more problem(s) like the ones above: fix every occurrence of each kind, not only these"
        )
    return shown


def reply_problems(text: str, state: SurfaceState | None = None, ui_required: bool = True) -> ReplyCheck:
    """Lex, read and validate one reply against ``state`` (the chat's shown surfaces; None = a new chat), once.

    ``ui_required=False`` (SV-C27 ``reply.ui = "auto"``, a ``/prompt``): a reply with text and no block is a valid
    text-only reply (no messages, the state unchanged); an empty one is still a problem."""
    state = state if state is not None else SurfaceState()
    if len(text) > MAX_REPLY_CHARS:
        problems = [f"the reply is too long ({len(text)} characters, at most {MAX_REPLY_CHARS}): send only the UI"]
        return ReplyCheck([], problems, repair_prompt(problems, state), "", None, 1)
    extraction = extract(text)
    if not extraction.has_blocks and not ui_required:
        if extraction.text.strip():
            return ReplyCheck([], [], None, extraction.text, None, 0)  # nothing to merge: no turnId either
        return ReplyCheck([], ["the reply is empty"], EMPTY, "", None, 1)
    if not extraction.has_blocks:
        kind = "a question" if is_question(extraction.text) else "no <a2ui-json> block"
        problem = [f"the reply has no UI block ({kind})"]
        return ReplyCheck([], problem, no_ui_prompt(extraction.text), extraction.text, None, 1)
    problems = [printable(f"block: {error}") for error in extraction.errors]
    messages, merged = extraction.messages, None
    if messages:
        step = validate_step(messages, state)
        problems += [printable(f"{issue.path}: {issue.message}") for issue in step.issues]
        merged = step.state
    elif not problems:
        problems = ["the block holds no messages"]
    shown = cap_problems(problems)
    prompt = repair_prompt(shown, state) if shown else None
    return ReplyCheck(messages, shown, prompt, extraction.text, None if problems else merged, len(problems))
