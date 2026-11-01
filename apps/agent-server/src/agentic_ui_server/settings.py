"""Frozen settings dataclasses with defaults (PLAN §2.1). Loading and precedence live in ``config.py``.

Each leaf field carries ``metadata = {"kind", "env"}``: the coercion kind and its ``AGENTIC_UI_*`` env override.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any


def _opt(default: Any, kind: str, env: str | None = None) -> Any:
    meta = {"kind": kind, "env": env}
    if isinstance(default, dict):
        frozen = MappingProxyType(dict(default))
        return field(default_factory=lambda: frozen, metadata=meta)
    return field(default=default, metadata=meta)


def _section(cls: type) -> Any:
    return field(default_factory=cls, metadata={"kind": "section", "cls": cls})


# Lean agent (RESEARCH §D.2): ``--core-tools none`` only gates qwen's 21 "core" tools; every other tool bypasses
# that allowlist and must be denied by exact name (qwen 0.21.1 permission-manager.ts:554-619; wildcards only work
# for ``mcp__`` names, rule-parser.ts:1209-1230). ``ask_user_question`` is here too (SV-C14: no questions).
QWEN_NON_CORE_TOOLS = (
    "agent",
    "ask_user_question",
    "enter_plan_mode",
    "exit_plan_mode",
    "list_agents",
    "skill",
    "tool_search",
    "enter_worktree",
    "exit_worktree",
    "artifact",
    "record_artifact",
    "send_message",
    "task_create",
    "task_update",
    "task_list",
    "task_stop",
    "team_create",
    "team_delete",
    "team_plan_approval",
    "workflow",
    "structured_output",
)
COMPUTER_USE_TOOLS = tuple(
    f"computer_use__{name}"
    for name in (  # qwen computer-use/schemas.ts:25-61
        "bring_to_front",
        "check_for_update",
        "check_permissions",
        "click",
        "double_click",
        "drag",
        "end_session",
        "get_accessibility_tree",
        "get_agent_cursor_state",
        "get_config",
        "get_cursor_position",
        "get_recording_state",
        "get_screen_size",
        "get_window_state",
        "hotkey",
        "kill_app",
        "launch_app",
        "list_apps",
        "list_windows",
        "move_cursor",
        "page",
        "press_key",
        "replay_trajectory",
        "right_click",
        "scroll",
        "set_agent_cursor_enabled",
        "set_agent_cursor_motion",
        "set_agent_cursor_style",
        "set_config",
        "set_value",
        "start_recording",
        "start_session",
        "stop_recording",
        "type_text",
        "zoom",
    )
)
EXCLUDED_TOOLS = ",".join(QWEN_NON_CORE_TOOLS + COMPUTER_USE_TOOLS)
# Highest-precedence qwen settings overlay (ru-code injects settings the same way, RESEARCH §A.3): no follow-up
# suggestion LLM call after every turn (qwen Session.ts:2525) and no computer-use driver (config.ts:2195-2206).
SYSTEM_SETTINGS = '{"tools":{"computerUse":{"enabled":false}},"ui":{"enableFollowupSuggestions":false}}'


@dataclass(frozen=True)
class ServerSettings:
    host: str = _opt("127.0.0.1", "str", "AGENTIC_UI_HOST")
    port: int = _opt(8787, "int", "AGENTIC_UI_PORT")
    base_path: str = _opt("/api", "str", "AGENTIC_UI_BASE_PATH")
    cors_origins: tuple[str, ...] = _opt((), "list", "AGENTIC_UI_CORS_ORIGINS")
    max_body_bytes: int = _opt(1_048_576, "int", "AGENTIC_UI_MAX_BODY_BYTES")


@dataclass(frozen=True)
class EnvNameSettings:
    """Env var names per role, as alias lists (ru-code registry rows, RESEARCH §A.3/§A.5)."""

    home: tuple[str, ...] = _opt(("QWEN_HOME",), "list")
    no_relaunch: tuple[str, ...] = _opt(("QWEN_CODE_NO_RELAUNCH",), "list")
    system_prompt: tuple[str, ...] = _opt(("QWEN_SYSTEM_MD",), "list")
    system_settings: tuple[str, ...] = _opt(("QWEN_CODE_SYSTEM_SETTINGS_PATH",), "list")
    mcp_blocking: tuple[str, ...] = _opt(("QWEN_CODE_LEGACY_MCP_BLOCKING",), "list")
    secrets: tuple[str, ...] = _opt((), "list")
    """Env vars whose values are secrets whatever their name (e.g. the fork's key variable), redacted everywhere."""


@dataclass(frozen=True)
class AgentSettings:
    bin: str = _opt("qwen", "str", "AGENTIC_UI_AGENT_BIN")
    node: str = _opt("node", "str", "AGENTIC_UI_AGENT_NODE")
    acp_flag: str = _opt("--acp", "str", "AGENTIC_UI_AGENT_ACP_FLAG")
    base_args: tuple[str, ...] = _opt(
        ("--core-tools", "none", "--exclude-tools", EXCLUDED_TOOLS), "args", "AGENTIC_UI_AGENT_BASE_ARGS"
    )
    extra_args: tuple[str, ...] = _opt((), "args", "AGENTIC_UI_AGENT_EXTRA_ARGS")
    home: str = _opt("", "path", "AGENTIC_UI_AGENT_HOME")
    env_names: EnvNameSettings = _section(EnvNameSettings)
    env: Mapping[str, str] = _opt(
        {"QWEN_SANDBOX": "false", "QWEN_CODE_SUPPRESS_YOLO_WARNING": "1"}, "map", "AGENTIC_UI_AGENT_ENV"
    )
    inherit_env: bool = _opt(True, "bool", "AGENTIC_UI_AGENT_INHERIT_ENV")
    env_passthrough: tuple[str, ...] = _opt(
        ("PATH", "HOME", "LANG", "LC_ALL", "TZ", "TMPDIR", "NO_PROXY", "no_proxy", "HTTPS_PROXY", "HTTP_PROXY"),
        "list",
    )
    tls_insecure: bool = _opt(False, "bool", "AGENTIC_UI_AGENT_TLS_INSECURE")
    # SV-C15: no provider/model in code defaults; the fork brings its own. Empty = never sent.
    auth_method: str = _opt("", "str", "AGENTIC_UI_AGENT_AUTH_METHOD")
    mode: str = _opt("", "str", "AGENTIC_UI_AGENT_MODE")
    model: str = _opt("", "str", "AGENTIC_UI_AGENT_MODEL")
    model_apply: str = _opt("session", "str", "AGENTIC_UI_AGENT_MODEL_APPLY")
    """``session``: after session/new|load and when the wanted model changes; ``every_turn``: before each prompt."""
    work_root: str = _opt("", "path", "AGENTIC_UI_WORK_ROOT")
    forget_paths: tuple[str, ...] = _opt(("{home}/.qwen/projects/{cwd_slug}", "{home}/.qwen/tmp/{cwd_sha256}"), "list")
    """A4-11: what the CLI keeps per chat cwd under its HOME, removed with a forgotten chat (``agent/forget.py``)."""
    system_prompt_file: str = _opt("", "path", "AGENTIC_UI_SYSTEM_PROMPT_FILE")
    system_settings: str = _opt(SYSTEM_SETTINGS, "json", "AGENTIC_UI_AGENT_SYSTEM_SETTINGS")
    cache_dir: str = _opt("", "path", "AGENTIC_UI_CACHE_DIR")
    client_name: str = _opt("agentic-ui-server", "str")


@dataclass(frozen=True)
class TimeoutSettings:
    start_s: float = _opt(60.0, "float", "AGENTIC_UI_START_TIMEOUT_S")
    rpc_s: float = _opt(30.0, "float", "AGENTIC_UI_RPC_TIMEOUT_S")
    turn_s: float = _opt(180.0, "float", "AGENTIC_UI_TURN_TIMEOUT_S")
    request_s: float = _opt(600.0, "float", "AGENTIC_UI_REQUEST_TIMEOUT_S")
    cancel_grace_s: float = _opt(1.5, "float", "AGENTIC_UI_CANCEL_GRACE_S")
    kill_grace_s: float = _opt(2.0, "float")


@dataclass(frozen=True)
class LimitSettings:
    max_live_agents: int = _opt(4, "int", "AGENTIC_UI_MAX_LIVE_AGENTS")
    idle_ttl_s: float = _opt(1800.0, "float", "AGENTIC_UI_IDLE_TTL_S")
    reap_interval_s: float = _opt(30.0, "float")
    forget_after_s: float = _opt(86_400.0, "float")
    max_queue_per_chat: int = _opt(4, "int")
    max_waiting: int = _opt(32, "int")
    """A4-07: requests waiting for a chat turn or an agent slot across all chats; one more → 429 queue_full."""
    max_line_bytes: int = _opt(16 * 1024 * 1024, "int")
    stderr_lines: int = _opt(200, "int")


@dataclass(frozen=True)
class RepairSettings:
    max_attempts: int = _opt(3, "int", "AGENTIC_UI_MAX_REPAIR_ATTEMPTS")


@dataclass(frozen=True)
class ReplySettings:
    """SV-C27 reply modes (``docs/architecture/orchestrator-flow.md``)."""

    ui: str = _opt("always", "str", "AGENTIC_UI_REPLY_UI")
    """``always``: every reply must hold UI (a reply without a block is repaired); ``auto``: the agent may answer a
    ``/prompt`` with text only — UI is required only for an ``/action`` and a ``repairOf`` repair."""
    fallback: str = _opt("surface", "str", "AGENTIC_UI_REPLY_FALLBACK")
    """After the repairs fail: ``surface`` = the fixed fallback surface + the agent's text; ``text`` = the text only."""
    surfaces: str = _opt("many", "str", "AGENTIC_UI_REPLY_SURFACES")
    """``many``: a new topic gets a new surface; ``single``: the chat keeps one surface, every reply updates it."""


@dataclass(frozen=True)
class LogSettings:
    level: str = _opt("INFO", "str", "AGENTIC_UI_LOG_LEVEL")
    format: str = _opt("%(asctime)s %(levelname)s %(name)s: %(message)s", "str", "AGENTIC_UI_LOG_FORMAT")
    acp_wire: bool = _opt(False, "bool", "AGENTIC_UI_LOG_ACP_WIRE")


@dataclass(frozen=True)
class Settings:
    server: ServerSettings = _section(ServerSettings)
    agent: AgentSettings = _section(AgentSettings)
    timeouts: TimeoutSettings = _section(TimeoutSettings)
    limits: LimitSettings = _section(LimitSettings)
    repair: RepairSettings = _section(RepairSettings)
    reply: ReplySettings = _section(ReplySettings)
    log: LogSettings = _section(LogSettings)
    environ: Mapping[str, str] = field(default_factory=dict, repr=False, compare=False)
    """Snapshot of the process env (inherited by the agent when ``agent.inherit_env``)."""
