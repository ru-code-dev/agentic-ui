"""Request body framing for ``server.py``: ``Transfer-Encoding: chunked`` decoding (RFC 9112 §7.1) with the size cap.

A proxy or client may send a POST body chunked instead of with a ``Content-Length`` (A2-M3: before, such a body
was read as empty). ``read_chunked`` decodes it under the same ``server.max_body_bytes`` limit: beyond it the rest
is read and dropped up to ``drain_max`` bytes (so the client sees the 413, not a reset) and ``BodyTooLarge`` is
raised; malformed framing raises ``BadBody`` (400). Chunk extensions and trailer fields are read and ignored.
A3-06: memory stays bounded by the limit: a chunk is never read whole once the body is over the limit (it is
skipped ``DRAIN_STEP`` bytes at a time, like a refused Content-Length body), and no chunk read exceeds the limit.
"""

import re
from typing import BinaryIO

LINE_MAX = 4096
TRAILERS_MAX = 64
DRAIN_STEP = 65536
CHUNK_SIZE = re.compile(rb"[0-9A-Fa-f]{1,16}")


class BadBody(ValueError):
    """The chunked framing is malformed (400)."""


class BodyTooLarge(Exception):
    """The decoded body exceeds the limit (413); ``size`` = bytes seen before giving up."""

    def __init__(self, size: int) -> None:
        super().__init__(size)
        self.size = size


def transfer_codings(values: list[str] | None) -> list[str]:
    """The ``Transfer-Encoding`` codings of every header line, lower-case, in order."""
    return [c.strip().lower() for value in values or [] for c in value.split(",") if c.strip()]


def _line(rfile: BinaryIO) -> bytes:
    line = rfile.readline(LINE_MAX + 1)
    if not line.endswith(b"\n") or len(line) > LINE_MAX:
        raise BadBody("chunked body: truncated or overlong line")
    return line.rstrip(b"\r\n")


def drain(rfile: BinaryIO, size: int) -> int:
    """Read and drop ``size`` bytes, ``DRAIN_STEP`` at a time; the bytes actually read (fewer at EOF)."""
    left = size
    while left > 0 and (chunk := rfile.read(min(left, DRAIN_STEP))):
        left -= len(chunk)
    return size - left


def read_chunked(rfile: BinaryIO, limit: int, drain_max: int) -> bytes:
    parts, size = [], 0
    while True:
        head = _line(rfile).split(b";", 1)[0].rstrip(b" \t\r\n")
        if not CHUNK_SIZE.fullmatch(head):  # RFC 9112 chunk-size = 1*HEXDIG: no sign, 0x, "_" or inner space (A4-04)
            raise BadBody(f"chunked body: bad chunk size {head[:20]!r}")
        length = int(head, 16)
        if length == 0:
            break
        size += length
        if size > drain_max:
            raise BodyTooLarge(size)
        if size > limit:  # over the limit: skip, never buffer (a "3c00000" chunk was read whole: 60 MiB)
            got = drain(rfile, length)
        else:
            data = rfile.read(length)
            got = len(data)
            parts.append(data)
        if got != length or rfile.read(2) not in (b"\r\n",):
            raise BadBody("chunked body: chunk shorter than its size or not followed by CRLF")
    for _ in range(TRAILERS_MAX):
        if not _line(rfile):
            break
    else:
        raise BadBody("chunked body: too many trailer fields")
    if size > limit:
        raise BodyTooLarge(size)
    return b"".join(parts)
