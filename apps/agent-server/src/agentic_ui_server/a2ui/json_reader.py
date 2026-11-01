"""Tolerant JSON reader: port of ``@a2ui/agent`` 0.0.2 ``readJson`` (RESEARCH §F.1).

Source: ``@a2ui/agent/src/inference-formats/direct-json/json-reader.js`` (``Reader.document`` path, i.e. a
complete text, not the streaming reads). Accepts what a model commonly gets wrong and a strict decoder rejects:
a trailing comma before ``]``/``}`` and raw control characters (line breaks, tabs) inside strings. Raw line
breaks are dropped from keys and from the values of id-like keys outside the data model. When the text does
not read, it is read once more with curly quotes straightened. Error texts are Node's:
``Invalid JSON at <pos>: <reason>``, with ``<pos>`` in UTF-16 code units like JavaScript string indexes.

Numbers follow JavaScript: integers beyond 2**53 become floats (the renderer sees a double).
Deviation: a number beyond a double (``1e400``; Node reads ``Infinity``) is a read error, since ``Infinity`` is not
JSON and could not be returned in the HTTP body.
Deviation: nesting deeper than ``MAX_DEPTH`` is a read error (Node reads until its stack overflows, which
``compile`` then reports as not JSON too).
"""

import math
import re
from typing import Any

NUMBER_RE = re.compile(r"-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?")
HEX_RE = re.compile(r"[0-9a-fA-F]{4}")
NUMBER_CHARS = frozenset("0123456789+-.eE")
SPACE = " \t\n\r"
NEWLINE_STRIPPED_KEYS = frozenset({"id", "component", "child", "surfaceId", "catalogId", "componentId"})
ESCAPES = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}
CURLY_QUOTES = str.maketrans({"\u201c": '"', "\u201d": '"', "\u2018": "'", "\u2019": "'"})
MAX_DEPTH = 200
JS_SAFE_INTEGER = 2**53


class JsonReadError(ValueError):
    """The text is not JSON (message ``Invalid JSON at <pos>: <reason>``)."""


def read_json(text: str) -> Any:
    """Read the complete JSON document ``text``; retry once with curly quotes straightened."""
    try:
        return _Reader(text).document()
    except JsonReadError:
        straight = text.translate(CURLY_QUOTES)
        if straight == text:
            raise
        return _Reader(straight).document()


def utf16_offset(text: str, index: int) -> int:
    """The JavaScript (UTF-16) index of code point ``index`` in ``text``."""
    return index + sum(1 for ch in text[:index] if ord(ch) > 0xFFFF)


class _Reader:
    def __init__(self, text: str) -> None:
        self.text, self.i, self.n = text, 0, len(text)
        self.in_data_model = False
        self.depth = 0

    def document(self) -> Any:
        self.skip_space()
        value = self.value()
        self.skip_space()
        if self.i < self.n:
            self.fail("unexpected text after the JSON value")
        return value

    def value(self, strip_newlines: bool = False) -> Any:
        if self.i >= self.n:
            self.end()
        c = self.text[self.i]
        if c == "{":
            return self.object(None)
        if c == "[":
            return self.array(False)
        if c == '"':
            return self.string(strip_newlines)
        if c == "-" or "0" <= c <= "9":
            return self.number()
        for word, val in (("true", True), ("false", False), ("null", None)):
            if self.text.startswith(word, self.i):
                self.i += len(word)
                return val
        return self.fail(f"unexpected character '{c}'")

    def object(self, parent_key: str | None) -> dict[str, Any]:
        self.enter()
        self.i += 1
        obj: dict[str, Any] = {}
        while True:
            self.skip_space()
            if self.i >= self.n:
                self.end()
            if self.text[self.i] == "}":
                self.i += 1
                self.depth -= 1
                return obj
            if self.text[self.i] != '"':
                self.fail("expected a key")
            key = self.string(not self.in_data_model)
            self.skip_space()
            if self.i >= self.n:
                self.end()
            if self.text[self.i] != ":":
                self.fail(f"expected ':' after key '{key}'")
            self.i += 1
            self.skip_space()
            is_data = not self.in_data_model and (
                (parent_key == "updateDataModel" and key == "value")
                or (parent_key == "createSurface" and key == "dataModel")
            )
            if is_data:
                self.in_data_model = True
            try:
                nxt = self.text[self.i] if self.i < self.n else ""
                if nxt == "[":
                    value = self.array(key == "children" and not self.in_data_model)
                elif nxt == "{":
                    value = self.object(key)
                else:
                    value = self.value(key in NEWLINE_STRIPPED_KEYS and not self.in_data_model)
            finally:
                if is_data:
                    self.in_data_model = False
            obj[key] = value
            self.skip_space()
            if self.i >= self.n:
                self.end()
            if self.text[self.i] == ",":
                self.i += 1
            elif self.text[self.i] != "}":
                self.fail("expected ',' or '}'")

    def array(self, strip_item_newlines: bool) -> list[Any]:
        self.enter()
        self.i += 1
        arr: list[Any] = []
        after_item = False
        while True:
            if after_item:
                self.skip_space()
                if self.i >= self.n:
                    self.end()
                if self.text[self.i] == ",":
                    self.i += 1
                elif self.text[self.i] != "]":
                    self.fail("expected ',' or ']'")
            after_item = True
            self.skip_space()
            if self.i >= self.n:
                self.end()
            if self.text[self.i] == "]":
                self.i += 1
                self.depth -= 1
                return arr
            arr.append(self.value(strip_item_newlines))

    def string(self, strip_newlines: bool) -> str:
        text, n = self.text, self.n
        self.i += 1
        buf: list[str] = []
        while self.i < n:
            c = text[self.i]
            if c == '"':
                self.i += 1
                return "".join(buf)
            if c != "\\":
                if not (strip_newlines and c in "\r\n"):
                    buf.append(c)
                self.i += 1
                continue
            if self.i + 1 >= n:
                self.i = n
                break
            escaped = text[self.i + 1]
            if escaped in ESCAPES:
                buf.append(ESCAPES[escaped])
            elif escaped == "u":
                if self.i + 6 > n:
                    self.i = n
                    continue
                code = self.hex(text[self.i + 2 : self.i + 6])
                if 0xD800 <= code <= 0xDBFF and self.i + 12 <= n and text[self.i + 6 : self.i + 8] == "\\u":
                    low = self.hex(text[self.i + 8 : self.i + 12])
                    if 0xDC00 <= low <= 0xDFFF:
                        code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
                        self.i += 6
                buf.append(chr(code))
                self.i += 4
            else:
                self.fail(f"invalid escape '\\{escaped}'")
            self.i += 2
        return self.end()

    def hex(self, digits: str) -> int:
        if not HEX_RE.fullmatch(digits):
            self.fail("invalid unicode escape")
        return int(digits, 16)

    def number(self) -> int | float:
        start = self.i
        if self.text[self.i] == "-":
            self.i += 1
        while self.i < self.n and self.text[self.i] in NUMBER_CHARS:
            self.i += 1
        literal = self.text[start : self.i]
        match = NUMBER_RE.fullmatch(literal)
        if not match:
            self.fail(f"invalid number '{literal}'")
        if not (match.group(2) or match.group(3)) and len(literal) <= 17:  # a safe integer has <= 16 digits
            value = int(literal)
            if abs(value) <= JS_SAFE_INTEGER:
                return value
        number = float(literal)  # never raises: a literal beyond a double reads as inf
        if math.isinf(number):
            self.fail(f"number '{literal}' is out of range")
        return number

    def skip_space(self) -> None:
        while self.i < self.n and self.text[self.i] in SPACE:
            self.i += 1

    def enter(self) -> None:
        self.depth += 1
        if self.depth > MAX_DEPTH:
            self.fail(f"nested deeper than {MAX_DEPTH} levels")

    def end(self) -> Any:
        return self.fail("unexpected end of the JSON text")

    def fail(self, reason: str) -> Any:
        raise JsonReadError(f"Invalid JSON at {utf16_offset(self.text, self.i)}: {reason}")
