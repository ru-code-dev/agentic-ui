"""Build ``apps/agent-server/dist/agentic-ui-server.pyz`` (SV-C2, PLAN §4 P7): the one deployable file.

A stdlib zipapp of ``src/agentic_ui_server`` (code + the generated ``data/``: catalog.json, system-prompt.md and the
A2UI schemas; never ``__pycache__``) with ``#!/usr/bin/env python3`` and the entry ``agentic_ui_server.__main__:main``.
After building it smoke-runs ``--version`` from an empty temp directory (``-I``: no PYTHONPATH, no site, no cwd), so
the code and the bundled data load from inside the zip. ``--check`` builds nothing and fails when the pyz is missing
or differs from the current package tree (a data sync or code change without a rebuild; part of ``check:generated``).
Run from the repo root: ``pnpm run server:build`` (also the last step of ``pnpm build``).
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
import zipapp
import zipfile
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
SRC = APP / "src"
PACKAGE = "agentic_ui_server"
TARGET = APP / "dist" / "agentic-ui-server.pyz"
ENTRY = f"{PACKAGE}.__main__:main"
INTERPRETER = "/usr/bin/env python3"
DATA = ("catalog.json", "system-prompt.md", "common_types.json", "server_to_client.json")


def _keep(path: Path) -> bool:
    """zipapp filter (paths relative to ``src/``): the package only, no bytecode caches."""
    return path.parts[0] == PACKAGE and "__pycache__" not in path.parts and path.suffix != ".pyc"


def package_files() -> dict[str, bytes]:
    """Archive name → content of every file the pyz must carry."""
    return {
        path.relative_to(SRC).as_posix(): path.read_bytes()
        for path in sorted((SRC / PACKAGE).rglob("*"))
        if path.is_file() and _keep(path.relative_to(SRC))
    }


def build(target: Path = TARGET) -> Path:
    missing = [name for name in DATA if not (SRC / PACKAGE / "data" / name).is_file()]
    if missing:
        raise SystemExit(f"build_pyz: bundled data missing {missing} (run pnpm run server:sync-data)")
    target.parent.mkdir(parents=True, exist_ok=True)
    zipapp.create_archive(SRC, target, interpreter=INTERPRETER, main=ENTRY, filter=_keep, compressed=True)
    return target


def check(target: Path = TARGET) -> list[str]:
    """Problems of the built pyz against the current tree (empty = up to date)."""
    if not target.is_file():
        return [f"{target}: missing (run pnpm run server:build)"]
    with zipfile.ZipFile(target) as archive:
        built = {name: archive.read(name) for name in archive.namelist() if not name.endswith("/")}
    built.pop("__main__.py", None)
    fresh = package_files()
    problems = [f"{name}: missing in the pyz" for name in sorted(fresh.keys() - built.keys())]
    problems += [f"{name}: not in the source tree" for name in sorted(built.keys() - fresh.keys())]
    problems += [f"{name}: stale" for name in sorted(fresh.keys() & built.keys()) if fresh[name] != built[name]]
    return problems


def smoke(target: Path, python: str = sys.executable) -> str:
    """Run ``--version`` from a copy in an empty temp dir (isolated mode); returns the printed version."""
    with tempfile.TemporaryDirectory(prefix="agentic-ui-pyz-smoke-") as tmp:
        copy = Path(tmp) / target.name
        shutil.copy2(target, copy)
        proc = subprocess.run(
            [python, "-I", str(copy), "--version"], capture_output=True, text=True, cwd=tmp, check=False
        )
    if proc.returncode != 0:
        raise SystemExit(f"build_pyz: smoke run failed ({proc.returncode}): {proc.stderr.strip()}")
    return proc.stdout.strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=TARGET, help=f"output file (default {TARGET.relative_to(APP)})")
    parser.add_argument("--check", action="store_true", help="verify the built pyz against the tree, build nothing")
    args = parser.parse_args(argv)
    if args.check:
        problems = check(args.out)
        for problem in problems:
            print(f"agent-server pyz: {problem}", file=sys.stderr)
        print(f"agent-server pyz: {'STALE' if problems else 'up to date'} ({args.out.name})")
        return 1 if problems else 0
    target = build(args.out)
    print(f"built {target} ({target.stat().st_size} bytes, {len(package_files())} files): {smoke(target)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
