"""CLI of a file the build generates from the server's code (SV-C23): ``--write`` it, or ``--print`` it for the
``check:generated`` comparison (A3-29). The payloads the file shows are validated first against the bundled
contract (A3-24): a token or value change that makes a hand-written payload invalid (the fallback names
``textAlign: "center"``, ``py: "8"``, …) stops ``pnpm build`` here, naming the problems, instead of shipping an
invalid surface in the hand-over bundle.
"""

import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .validation import format_errors, validate_payload


def generator_main(argv: list[str], target: Path, render: Callable[[], str], payloads: dict[str, Any]) -> int:
    """``payloads``: label (where it is written by hand) → messages. Exit 0 written/printed, 1 invalid, 2 usage."""
    for label, messages in payloads.items():
        errors = validate_payload(messages)
        if errors:
            print(
                f"{target.name}: {label} is invalid against the bundled contract (a token or value it names "
                f"changed); fix it there:\n{format_errors(errors)}",
                file=sys.stderr,
            )
            return 1
    text = render()
    if "--print" in argv:
        sys.stdout.write(text)
        return 0
    if "--write" in argv:
        target.write_text(text, encoding="utf-8")
        print(f"wrote {target}")
        return 0
    print(f"usage: {target.name} generator --write | --print", file=sys.stderr)
    return 2
