"""JSON text as UTF-8 bytes for the wire (HTTP bodies, ACP lines).

JSON and JavaScript strings may hold a lone surrogate (a model can write ``"\\ud800"``); Python reads it but cannot
encode it as UTF-8. Such a value is written with ``\\u`` escapes instead (ASCII JSON, read back as the same string).
"""

import json
from typing import Any


def json_utf8(value: Any, *, compact: bool = False) -> bytes:
    separators = (",", ":") if compact else None
    try:
        return json.dumps(value, ensure_ascii=False, separators=separators).encode("utf-8")
    except UnicodeEncodeError:
        return json.dumps(value, ensure_ascii=True, separators=separators).encode("ascii")
