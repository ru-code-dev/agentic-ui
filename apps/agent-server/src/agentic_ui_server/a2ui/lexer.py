"""``<a2ui-json>`` block lexer: port of ``@a2ui/agent`` 0.0.2 ``BlockLexer`` as ``DirectJsonParser`` builds it.

Source: ``@a2ui/agent/src/parser/lexer.js`` with ``openTag='<a2ui-json>'``, ``closeTag='</a2ui-json>'``, string
delimiters ``'`` and ``"`` (triple quotes too, ``\\`` escapes), no comments, ``JSON_PAYLOAD_START_RE`` and
``stripEdgeBackticks=true`` (RESEARCH \u00a7F.1). Tags are case-insensitive and may carry attributes; a close tag
inside a string does not close the block; Markdown fences and inline-code backticks around blocks are removed;
a block still open at the end is a part with ``final=False``; once per response a stray close tag without an
open tag is recovered from a preceding fence or from a line that starts a JSON payload.

JavaScript regex semantics are spelled out: ``\\s`` and ``trim()`` use the ECMAScript whitespace set, ``^``/``$``
in multiline patterns match at any line terminator, ``$`` without ``m`` only at the very end, case folding is
ASCII-only. Deviation: Node's module-global ``OPEN_FENCE_RE`` keeps ``lastIndex`` between calls after a
rejected nested fence; this port is stateless (each response is lexed as by a fresh module). Every step is linear
in the reply (A3-02): the fence recovery's close-tag scans come from ``close_scan.CloseFinder``, the open tag and the
trailing fence are found without regex backtracking.
"""

from dataclasses import dataclass

from .close_scan import close_finder, scan_block
from .lexer_patterns import (
    BACKTICKS_ONLY_RE,
    CLOSE_TAG,
    CLOSE_TAG_RE,
    EDGE_BACKTICKS_RE,
    FENCE_LANG,
    JSON_PAYLOAD_START_RE,
    LEADING_FENCE_RE,
    OPEN_FENCE_RE,
    OPEN_TAG,
    OPEN_TAG_NAME_RE,
    TICKS_AT_RE,
    WS_CHARS,
)

__all__ = ["CLOSE_TAG", "OPEN_TAG", "Part", "clean_markdown", "clean_raw", "js_trim", "scan_block", "tokenize"]


@dataclass(frozen=True)
class Part:
    """A lexer part: ``kind`` is ``text`` (``text`` set) or ``a2ui`` (``raw`` set, ``final`` False when unclosed)."""

    kind: str
    text: str = ""
    raw: str = ""
    final: bool = True


def js_trim(text: str) -> str:
    return text.strip(WS_CHARS)


def clean_markdown(text: str) -> str:
    """Trim, drop one leading and one trailing Markdown fence; a run of only backticks becomes ``""``."""
    if not text:
        return ""
    cleaned = js_trim(_drop_trailing_fence(LEADING_FENCE_RE.sub("", js_trim(text), count=1)))
    return "" if BACKTICKS_ONLY_RE.fullmatch(cleaned) else cleaned


def _drop_trailing_fence(text: str) -> str:
    """``text.replace(/\\s*```[a-zA-Z0-9_-]*$/i, "")`` by a backward walk (the regex backtracks on whitespace runs)."""
    end = len(text)
    while end > 0 and text[end - 1] in FENCE_LANG:
        end -= 1
    if not text.endswith("```", 0, end):
        return text
    return text[: end - 3].rstrip(WS_CHARS)


def find_open_tag(content: str, pos: int) -> tuple[int, int] | None:
    """``(start, end)`` of the first ``/<a2ui-json(?:\\s[^>]*)?>/i`` match at or after ``pos``."""
    for name in OPEN_TAG_NAME_RE.finditer(content, pos):
        after = name.end()
        if content.startswith(">", after):
            return name.start(), after + 1
        if after < len(content) and content[after] in WS_CHARS:
            close = content.find(">", after)
            # [^>]* runs to the first ">": none left means no later candidate can match either
            return (name.start(), close + 1) if close >= 0 else None
    return None


def clean_raw(text: str) -> str:
    """``clean_markdown``, then backticks left at the edges (tags written as inline code)."""
    return js_trim(EDGE_BACKTICKS_RE.sub("", clean_markdown(text)))


def _add_text(parts: list[Part], text: str) -> None:
    cleaned = clean_markdown(text)
    if cleaned:
        parts.append(Part("text", text=cleaned))


def _strip_closing_fence(text: str, lo: int, hi: int) -> int:
    """End of ``text[lo:hi]`` without ``/\\r?\\n?[ \\t]*```[ \\t]*\\r?\\n?$/`` (a backward walk: the regex search
    backtracks on every position of a space run)."""
    end = hi
    for ch in "\n\r":
        end -= 1 if end > lo and text[end - 1] == ch else 0
    while end > lo and text[end - 1] in " \t":
        end -= 1
    if end - lo < 3 or not text.startswith("```", end - 3):
        return hi
    end -= 3
    while end > lo and text[end - 1] in " \t":
        end -= 1
    for ch in "\n\r":
        end -= 1 if end > lo and text[end - 1] == ch else 0
    return end


def _nested_fence(segment: str, fences: list, index: int, body_end: int) -> bool:
    """``OPEN_FENCE_RE.search(segment[fences[index].end():body_end])`` from the fences found once: fence matches are
    disjoint line-start matches, so only the next one (or one at the body start, which is a line start in the body
    alone) can lie inside the body; it counts when its backticks end inside it."""
    start = fences[index].end()
    nxt = fences[index + 1] if index + 1 < len(fences) else None
    if nxt is not None and nxt.start() == start:
        at = nxt.start()
    else:
        ticks = TICKS_AT_RE.match(segment, start)
        if ticks is not None and ticks.end() <= body_end:
            return True
        if nxt is None:
            return False
        at = nxt.start()
    ticks = TICKS_AT_RE.match(segment, at)
    return ticks is not None and ticks.end() <= body_end


def _recover_unmatched_close(parts: list[Part], content: str, start: int, search_end: int) -> int | None:
    segment = content[start:search_end]
    if not CLOSE_TAG_RE.search(segment):
        return None
    fences = list(OPEN_FENCE_RE.finditer(segment))
    find = close_finder(segment, len(fences) + 1)
    for index in range(0, len(fences), 2):
        fence = fences[index]
        span = find(fence.end())
        if span is None:
            continue
        body_end = _strip_closing_fence(segment, fence.end(), span[0])
        if _nested_fence(segment, fences, index, body_end):
            continue
        raw = clean_raw(segment[fence.end() : body_end])
        if not raw:
            continue
        _add_text(parts, segment[: fence.start()])
        parts.append(Part("a2ui", raw=raw))
        return start + span[1]
    search_from, pair = 0, 0
    while pair + 1 < len(fences):
        close_fence_end = fences[pair + 1].end()
        if find(close_fence_end) is None:
            break
        search_from, pair = close_fence_end, pair + 2
    stmt = JSON_PAYLOAD_START_RE.search(segment[search_from:])
    if stmt is None:
        return None
    stmt_start = search_from + stmt.start()
    span = find(stmt_start)
    if span is None:
        return None
    raw = clean_raw(segment[stmt_start : span[0]])
    if not raw:
        return None
    _add_text(parts, segment[:stmt_start])
    parts.append(Part("a2ui", raw=raw))
    return start + span[1]


def tokenize(content: str) -> list[Part]:
    """Split a model reply into text parts and ``<a2ui-json>`` raw blocks (``BlockLexer.tokenize``)."""
    parts: list[Part] = []
    n, i, recovered = len(content), 0, False
    while i < n:
        open_match = find_open_tag(content, i)
        search_end = open_match[0] if open_match else n
        if not recovered and search_end > i:
            nxt = _recover_unmatched_close(parts, content, i, search_end)
            if nxt is not None:
                recovered, i = True, nxt
                continue
        if open_match is None:
            break
        _add_text(parts, content[i : open_match[0]].rstrip("`"))
        span = scan_block(content, open_match[1], n)
        if span is None:
            parts.append(Part("a2ui", raw=clean_raw(content[open_match[1] :]), final=False))
            return parts
        parts.append(Part("a2ui", raw=clean_raw(content[open_match[1] : span[0]])))
        i = span[1]
        while i < n and content[i] == "`":
            i += 1
    _add_text(parts, content[i:])
    return parts
