"""What a forgotten chat leaves on disk, removed by the reaper (A3-03, A4-11).

- the chat's agent cwd, only when it is a direct child of ``agent.work_root``;
- what the CLI keeps per cwd under its HOME (``agent.forget_paths``; qwen-code 0.21: ``.qwen/projects/<cwd with
  every non-alphanumeric character as '-'>`` holds the chat transcript with the pasted data, ``.qwen/tmp/<sha256 of
  the cwd>``; ``config/storage.ts`` ``getProjectDir``/``getProjectTempDir``). Placeholders: ``{home}`` (``agent.home``,
  else the server's HOME), ``{cwd}``, ``{cwd_slug}``, ``{cwd_sha256}``; each for the cwd as given and as resolved
  (macOS ``/private`` links). A path is removed only when it resolves strictly inside that HOME and below a
  directory named after the cwd (never HOME itself or a shared folder); every removal is logged.
"""

import hashlib
import re
import shutil
from pathlib import Path

from ..log import get_logger
from ..settings import Settings

_log = get_logger("agent.forget")


def _slug(cwd: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "-", cwd)


def agent_home(settings: Settings) -> Path | None:
    home = settings.agent.home or settings.environ.get("HOME", "")
    return Path(home).resolve() if home else None


def chat_paths(settings: Settings, cwd: Path) -> list[Path]:
    """The CLI's per-chat files under the agent HOME for ``cwd`` (existing ones only)."""
    home = agent_home(settings)
    if home is None:
        return []
    out: list[Path] = []
    for variant in dict.fromkeys((str(cwd), str(cwd.resolve()))):
        values = {
            "home": str(home),
            "cwd": variant,
            "cwd_slug": _slug(variant),
            "cwd_sha256": hashlib.sha256(variant.encode()).hexdigest(),
        }
        for template in settings.agent.forget_paths:
            path = Path(template.format(**values)).resolve()
            keyed = values["cwd_slug"] in path.name or values["cwd_sha256"] in path.name
            if path != home and home in path.parents and keyed and path.exists() and path not in out:
                out.append(path)
    return out


def remove_chat_files(settings: Settings, chat_id: str, cwd: Path | None) -> None:
    if not isinstance(cwd, Path):
        return
    root = settings.agent.work_root
    for path in chat_paths(settings, cwd):
        shutil.rmtree(path) if path.is_dir() else path.unlink()
        _log.info("[%s] forgotten: removed the agent's per-chat files %s", chat_id, path)
    if root and cwd.parent.resolve() == Path(root).resolve() and cwd.is_dir():
        shutil.rmtree(cwd, ignore_errors=False)
        _log.info("[%s] forgotten after idle: work dir removed", chat_id)
