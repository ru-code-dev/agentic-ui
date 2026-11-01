#!/usr/bin/env bash
# P8 e2e: the real agent server process (python -m agentic_ui_server from apps/agent-server/src) on
# 127.0.0.1:${AGENT_E2E_PORT:-8790}, driving the deterministic fake ACP agent (fake-agent.mjs; no LLM).
# With AGENT_E2E_REAL=1 it drives the real qwen-code CLI against the machine's test LLM endpoint instead (tier 4,
# opt-in; the base URL and model are composed from WORKFLOW/llm.env by scripts/workflow-env.sh, the key reaches the
# qwen child via the qwen-home env block, never printed). All state stays under WORKFLOW/tmp (SV-C18).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../../.." && pwd)"
. "$root/scripts/workflow-env.sh"
python="$WORKFLOW_PYTHON"
[ -x "$python" ] || python="$(command -v python3.13)"
port="${AGENT_E2E_PORT:-8790}"
work="$WORKFLOW_DIR/tmp/e2e-agent-server-$port"
rm -rf "$work" && mkdir -p "$work/home"
common=(
  --host 127.0.0.1 --port "$port"
  --set "agent.work_root=$work/chats" --set "agent.cache_dir=$work/cache"
  --set limits.max_live_agents=24 --set log.level=INFO
)
if [ "${AGENT_E2E_REAL:-}" = "1" ]; then
  exec env HOME="$WORKFLOW_QWEN_HOME" PYTHONPATH="$root/apps/agent-server/src" "$python" -m agentic_ui_server \
    --config "$root/apps/agent-server/config.dev.toml" --agent-bin "$WORKFLOW_QWEN_CLI" "${common[@]}"
fi
exec env HOME="$work/home" AGENT_E2E_REPAIR_MS="${AGENT_E2E_REPAIR_MS:-2500}" \
  PYTHONPATH="$root/apps/agent-server/src" "$python" -m agentic_ui_server \
  --agent-bin "$here/fake-agent.mjs" --set agent.base_args= --set agent.acp_flag= \
  --set timeouts.turn_s=30 --set timeouts.cancel_grace_s=1.5 "${common[@]}"
