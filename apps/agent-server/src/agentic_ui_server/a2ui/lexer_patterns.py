"""Patterns of the ``<a2ui-json>`` lexer (``lexer.py``) in JavaScript semantics: ``\\s`` = ECMAScript whitespace,
line starts/ends at any line terminator, ASCII-only case folding. Patterns whose JavaScript form backtracks
quadratically on a hostile reply (``<a2ui-json(?:\\s[^>]*)?>``, ``\\s*```[\\w-]*$``) are matched by code in
``lexer.py`` instead (A3-02).
"""

import re

# ECMAScript WhiteSpace + LineTerminator (what `\s` and String.prototype.trim match)
WS_CHARS = "\t\n\v\f\r \u00a0\u1680" + "".join(map(chr, range(0x2000, 0x200B))) + "\u2028\u2029\u202f\u205f\u3000\ufeff"
_S = f"[{WS_CHARS}]"
_LINE_START = r"(?:\A|(?<=[\n\r\u2028\u2029]))"
_LINE_END = r"(?=[\n\r\u2028\u2029]|\Z)"
_FLAGS = re.IGNORECASE | re.ASCII

OPEN_TAG = "<a2ui-json>"
CLOSE_TAG = "</a2ui-json>"
OPEN_TAG_NAME_RE = re.compile(r"<a2ui-json", _FLAGS)
CLOSE_TAG_RE = re.compile(rf"</a2ui-json{_S}*>", _FLAGS)
LEADING_FENCE_RE = re.compile(rf"\A```[a-zA-Z0-9_-]*{_S}*", _FLAGS)
FENCE_LANG = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")
OPEN_FENCE_RE = re.compile(rf"{_LINE_START}[ \t]*```[a-zA-Z0-9_-]*[ \t]*\r?\n?")
TICKS_AT_RE = re.compile(r"[ \t]*```")
_ARRAY_START = rf"\[{_S}*(?:\{{|\]|{_LINE_END})"
_OBJECT_START = rf"\{{{_S}*(?:\"|\}}|{_LINE_END})"
JSON_PAYLOAD_START_RE = re.compile(rf"{_LINE_START}[ \t]*(?:{_ARRAY_START}|{_OBJECT_START})")
EDGE_BACKTICKS_RE = re.compile(r"\A`+|`+\Z")
BACKTICKS_ONLY_RE = re.compile(r"`*")
STRING_DELIMITERS = ("'", '"')
