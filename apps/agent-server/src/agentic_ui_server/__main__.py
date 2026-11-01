"""CLI entry: parse argv, load settings, pick the mode: serve the HTTP API (default), ``--check-agent`` or
``--print-config`` (the effective settings as JSON, secrets masked). ``--version`` adds the bundled contract hash."""

import argparse
import asyncio
import json
import sys

from . import __version__
from .config import ConfigError, add_arguments, describe, settings_from_args
from .log import get_logger, redact, setup_logging
from .resources import contract_version
from .selfcheck import check_agent, to_json
from .serve import serve


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agentic-ui-server",
        description="agentic-ui agent server (ACP → Qwen CLI)",
        formatter_class=argparse.RawDescriptionHelpFormatter,  # keeps the --version line unwrapped
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__} ({contract_version()})")
    mode = parser.add_argument_group("modes")
    mode.add_argument("--check-agent", action="store_true", help="start the agent, run one turn, print a JSON report")
    mode.add_argument("--text", help="prompt text for --check-agent (default: 'Reply with exactly: OK')")
    mode.add_argument("--print-config", action="store_true", help="print the effective settings as JSON and exit")
    add_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        settings = settings_from_args(args)
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2
    if args.print_config:
        print(redact(json.dumps(describe(settings), ensure_ascii=False, indent=2)))
        return 0
    setup_logging(settings.log)
    get_logger("main").info("agentic-ui-server %s, effective config: %s", __version__, json.dumps(describe(settings)))
    if args.check_agent:
        report = asyncio.run(check_agent(settings, args.text))
        print(to_json(report))
        return 0 if report["ok"] else 1
    return serve(settings)


if __name__ == "__main__":
    sys.exit(main())
