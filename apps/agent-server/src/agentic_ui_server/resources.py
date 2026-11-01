"""Bundled data access via ``importlib.resources`` (works inside the zipapp, RESEARCH §G) and agent files.

The agent CLI needs real file paths: ``QWEN_SYSTEM_MD`` (system prompt, bundled or ``agent.system_prompt_file``)
and ``QWEN_CODE_SYSTEM_SETTINGS_PATH`` (``agent.system_settings`` overlay). Both are written content-addressed
to ``<cache_dir>/<sha256>/<name>`` once and passed around as ``AgentFiles``.
``data/`` is generated, never hand-edited (CF-I3): ``catalog.json`` + ``system-prompt.md`` from the catalog package,
``common_types.json`` + ``server_to_client.json`` (A2UI v0.9) from ``@a2ui/web_core`` (``scripts/sync_data.mjs``;
``check:generated`` fails while the copy is stale).
"""

import functools
import hashlib
import json
import os
import tempfile
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any

from .settings import AgentSettings

PACKAGE = "agentic_ui_server"
SYSTEM_PROMPT_RESOURCE = "system-prompt.md"
CATALOG_RESOURCE = "catalog.json"
SCHEMA_RESOURCES = ("common_types.json", "server_to_client.json")


@dataclass(frozen=True)
class AgentFiles:
    """Paths handed to the agent through env registry rows (``None`` = not set)."""

    system_prompt: str | None = None
    system_settings: str | None = None


def read_data_text(name: str) -> str:
    return resources.files(PACKAGE).joinpath("data", name).read_text(encoding="utf-8")


def read_data_json(name: str) -> Any:
    return json.loads(read_data_text(name))


CONTRACT_VERSION_RESOURCE = "contract-version.json"


@functools.cache
def contract_version() -> str:
    """DEC-056: ``<catalogId> sha256:<12 hex of catalog.json>``, the generated constant every HTTP answer carries as
    ``contractVersion`` (= handover/manifest.json ``contractVersion`` = the page's build-time version)."""
    return read_data_json(CONTRACT_VERSION_RESOURCE)["contractVersion"]


def computed_contract_version() -> str:
    """The same version computed from the bundled catalog.json (the generated constant must equal it)."""
    data = resources.files(PACKAGE).joinpath("data", CATALOG_RESOURCE).read_bytes()
    return f"{json.loads(data)['catalogId']} sha256:{hashlib.sha256(data).hexdigest()[:12]}"


def system_prompt_text(agent: AgentSettings) -> str:
    if agent.system_prompt_file:
        return Path(agent.system_prompt_file).read_text(encoding="utf-8")
    return read_data_text(SYSTEM_PROMPT_RESOURCE)


def materialize(cache_dir: str, name: str, text: str) -> Path:
    """Write ``text`` to ``<cache_dir>/<sha256>/<name>`` (atomic, once) and return the path."""
    target = Path(cache_dir) / hashlib.sha256(text.encode("utf-8")).hexdigest() / name
    if target.is_file():
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=f".{name}.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
    os.replace(tmp, target)
    return target


def system_prompt_path(agent: AgentSettings) -> Path:
    return materialize(agent.cache_dir, "system.md", system_prompt_text(agent))


def agent_files(agent: AgentSettings) -> AgentFiles:
    settings_path = (
        materialize(agent.cache_dir, "system-settings.json", agent.system_settings) if agent.system_settings else None
    )
    return AgentFiles(str(system_prompt_path(agent)), str(settings_path) if settings_path else None)
