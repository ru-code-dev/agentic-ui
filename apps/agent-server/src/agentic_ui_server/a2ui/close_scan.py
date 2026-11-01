"""Close-tag scanning of the ``<a2ui-json>`` lexer in linear time (A3-02).

``scan_block`` is ``BlockLexer``'s scan: from ``start``, outside strings, the first close tag; ``'``/``"`` (and
their triples) open strings, ``\\`` skips one character inside a string. The stray-close recovery asks it once per
Markdown fence over the same rest of the reply, which made a reply of fence lines quadratic (48 KB: 26 s on the
agent loop). ``CloseFinder`` answers ``scan_block(text, p, len(text))`` for every ``p`` from one backward pass:
the scan from ``p`` (outside strings) either sees a close tag at ``p``, or a string opening at ``p`` (then it goes
on right after that string's closing delimiter), or goes on at ``p + 1``; the end of a string opened before ``i``
is likewise a backward table per delimiter. Same answers as the forward scan for every start.
"""

from .lexer_patterns import CLOSE_TAG_RE, STRING_DELIMITERS

LINEAR_FROM = 4
"""Fewer scans than this run forward (cheaper than the tables for the usual reply)."""


def scan_block(content: str, start: int, end: int) -> tuple[int, int] | None:
    """``(close_start, close_end)`` of the first close tag outside a string between ``start`` and ``end``."""
    i, delim = start, ""
    while i < end:
        if not delim:
            match = CLOSE_TAG_RE.match(content, i)
            if match and match.end() <= end:
                return i, match.end()
            ch = content[i]
            if ch in STRING_DELIMITERS:
                delim = ch * 3 if i + 2 < end and content.startswith(ch * 3, i) else ch
                i += len(delim)
                continue
            i += 1
            continue
        if content[i] == "\\":
            i += 2
            continue
        if content.startswith(delim, i):
            i += len(delim)
            delim = ""
            continue
        i += 1
    return None


def _string_ends(text: str, delim: str) -> list[int]:
    """``ends[i]``: where a string closed by ``delim`` and scanned from ``i`` finds its closing delimiter (-1 none)."""
    n = len(text)
    ends = [-1] * (n + 2)
    for i in range(n - 1, -1, -1):
        if text[i] == "\\":
            ends[i] = ends[i + 2]
        elif text.startswith(delim, i):
            ends[i] = i
        else:
            ends[i] = ends[i + 1]
    return ends


class CloseFinder:
    """``scan_block(text, p, len(text))`` for any ``p`` in O(1) after an O(n) build."""

    def __init__(self, text: str) -> None:
        n = len(text)
        closes = {m.start(): m.end() for m in CLOSE_TAG_RE.finditer(text)}
        present = {ch for ch in STRING_DELIMITERS if ch in text}
        ends = {d: _string_ends(text, d) for ch in present for d in (ch, ch * 3)}
        found: list[tuple[int, int] | None] = [None] * (n + 1)
        for i in range(n - 1, -1, -1):
            if i in closes:
                found[i] = (i, closes[i])
                continue
            ch = text[i]
            if ch not in present:
                found[i] = found[i + 1]
                continue
            delim = ch * 3 if i + 2 < n and text.startswith(ch * 3, i) else ch
            after = i + len(delim)
            close = ends[delim][after] if after < n else -1
            found[i] = found[close + len(delim)] if close >= 0 else None
        self._found = found

    def __call__(self, start: int) -> tuple[int, int] | None:
        return self._found[start] if 0 <= start < len(self._found) else None


def close_finder(text: str, scans: int):
    """A ``start → span`` function over ``text``: forward scans when few are needed, the tables otherwise."""
    if scans < LINEAR_FROM:
        return lambda start: scan_block(text, start, len(text))
    return CloseFinder(text)
