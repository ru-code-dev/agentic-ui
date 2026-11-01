"""ACP protocol literals, with values taken from real code (RESEARCH §B.1; SV-C5).

Sources: ru-code ``effect-acp/_generated/meta.gen.ts`` + ``schema.gen.ts`` (ACP SDK ^0.14.1) and qwen-code 0.21.1
``acp-integration/errorCodes.ts``. Values are plain ``StrEnum``/``int`` constants; the wire may carry values we
don't know yet, so callers compare against these constants and never require membership.
"""

from enum import IntEnum, StrEnum

PROTOCOL_VERSION = 1

# Agent methods (client -> agent).
INITIALIZE = "initialize"
AUTHENTICATE = "authenticate"
SESSION_NEW = "session/new"
SESSION_LOAD = "session/load"
SESSION_PROMPT = "session/prompt"
SESSION_CANCEL = "session/cancel"  # notification
SESSION_SET_MODE = "session/set_mode"
SESSION_SET_CONFIG_OPTION = "session/set_config_option"
SESSION_SET_MODEL = "session/set_model"  # qwen unstable_setSessionModel: persists model.name to user settings

# Client methods (agent -> client).
SESSION_UPDATE = "session/update"  # notification
SESSION_REQUEST_PERMISSION = "session/request_permission"
FS_READ_TEXT_FILE = "fs/read_text_file"
FS_WRITE_TEXT_FILE = "fs/write_text_file"
TERMINAL_CREATE = "terminal/create"
TERMINAL_OUTPUT = "terminal/output"
TERMINAL_WAIT_FOR_EXIT = "terminal/wait_for_exit"
TERMINAL_KILL = "terminal/kill"
TERMINAL_RELEASE = "terminal/release"
# Non-standard agent -> client request sent by qwen 0.21.1 during tool turns; -32601 is a fine answer.
CRAFT_DRAIN_MID_TURN_QUEUE = "craft/drainMidTurnQueue"

# ``session/set_config_option`` id that carries the session mode (ru-code QwenAcpSessionRuntime.ts:600-640).
MODE_CONFIG_ID = "mode"
# ``set_config_option`` id for the session model; qwen applies it with persistDefault:false (acpAgent.ts:4817-4826).
MODEL_CONFIG_ID = "model"


class StopReason(StrEnum):
    END_TURN = "end_turn"
    MAX_TOKENS = "max_tokens"
    MAX_TURN_REQUESTS = "max_turn_requests"
    REFUSAL = "refusal"
    CANCELLED = "cancelled"


class UpdateKind(StrEnum):
    """``session/update`` → ``update.sessionUpdate`` discriminator values."""

    AGENT_MESSAGE_CHUNK = "agent_message_chunk"
    AGENT_THOUGHT_CHUNK = "agent_thought_chunk"
    USER_MESSAGE_CHUNK = "user_message_chunk"
    TOOL_CALL = "tool_call"
    TOOL_CALL_UPDATE = "tool_call_update"
    PLAN = "plan"
    AVAILABLE_COMMANDS_UPDATE = "available_commands_update"
    CURRENT_MODE_UPDATE = "current_mode_update"
    CONFIG_OPTION_UPDATE = "config_option_update"
    SESSION_INFO_UPDATE = "session_info_update"
    USAGE_UPDATE = "usage_update"


class PermissionKind(StrEnum):
    ALLOW_ONCE = "allow_once"
    ALLOW_ALWAYS = "allow_always"
    REJECT_ONCE = "reject_once"
    REJECT_ALWAYS = "reject_always"


class ToolStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class ErrorCode(IntEnum):
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603
    AUTH_REQUIRED = -32000
    RESOURCE_NOT_FOUND = -32002
