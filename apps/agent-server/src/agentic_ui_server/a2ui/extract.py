"""A2UI messages from a model reply: lexer parts + ``DirectJsonParser.compile`` per block (RESEARCH §F.1).

``compile`` is the port of ``@a2ui/agent/src/inference-formats/direct-json/parser.js`` ``compile`` with its
``ParseError`` texts verbatim. ``extract`` compiles every block (Node's ``parseResponse`` stops at the first bad
one); the repair loop sends all block errors back at once (CF-I4) and validates the messages of good blocks.
"""

from dataclasses import dataclass
from typing import Any

from .json_reader import JsonReadError, read_json
from .lexer import CLOSE_TAG, OPEN_TAG, Part, clean_raw, tokenize


class ParseError(ValueError):
    """A block cannot be read (``@a2ui/agent`` ``ParseError``)."""


def compile_block(raw: str, final: bool = True) -> list[Any]:
    """Read a block as a JSON message or a JSON array of messages."""
    if not final:
        raise ParseError(f"The response ended inside an {OPEN_TAG} block, before its {CLOSE_TAG} tag.")
    cleaned = clean_raw(raw)
    if not cleaned:
        raise ParseError("The direct JSON block is empty.")
    try:
        decoded = read_json(cleaned)
    except JsonReadError as exc:
        raise ParseError(f"The direct JSON block is not JSON: {exc}") from exc
    return decoded if isinstance(decoded, list) else [decoded]


@dataclass(frozen=True)
class Block:
    """One ``<a2ui-json>`` block: its raw text and either its messages or its parse error."""

    raw: str
    final: bool
    messages: tuple[Any, ...] = ()
    error: str | None = None


@dataclass(frozen=True)
class Extraction:
    texts: tuple[str, ...]
    blocks: tuple[Block, ...]

    @property
    def has_blocks(self) -> bool:
        return bool(self.blocks)

    @property
    def errors(self) -> tuple[str, ...]:
        return tuple(block.error for block in self.blocks if block.error is not None)

    @property
    def messages(self) -> list[Any]:
        """Messages of all readable blocks, in reply order."""
        return [message for block in self.blocks if block.error is None for message in block.messages]

    @property
    def text(self) -> str:
        return "\n\n".join(self.texts)


def _block(part: Part) -> Block:
    try:
        return Block(part.raw, part.final, tuple(compile_block(part.raw, part.final)))
    except ParseError as exc:
        return Block(part.raw, part.final, error=str(exc))


def extract(reply: str) -> Extraction:
    """Lex ``reply`` and compile every block."""
    parts = tokenize(reply)
    return Extraction(
        texts=tuple(part.text for part in parts if part.kind == "text"),
        blocks=tuple(_block(part) for part in parts if part.kind == "a2ui"),
    )
