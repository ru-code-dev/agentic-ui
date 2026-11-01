# shellcheck shell=sh
# Project-local dev environment (SV-C18). Source it: `. scripts/workflow-env.sh`
# Every tool, build, cache, temp file and secret lives in the gitignored WORKFLOW/ folder;
# nothing is written outside the repo. Platform binaries go to WORKFLOW/tools/<os>-<arch>/.
# Never prints or exports the test LLM key (tests load it into child processes only).

if [ -n "${BASH_SOURCE:-}" ]; then _wf_self="${BASH_SOURCE}"; elif [ -n "${ZSH_VERSION:-}" ]; then _wf_self="${(%):-%x}"; else _wf_self="$0"; fi
AGENTIC_UI_ROOT="$(cd "$(dirname "$_wf_self")/.." && pwd)"
unset _wf_self

WORKFLOW_DIR="$AGENTIC_UI_ROOT/WORKFLOW"
WORKFLOW_PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)"
WORKFLOW_TOOLS="$WORKFLOW_DIR/tools/$WORKFLOW_PLATFORM"
WORKFLOW_PYTHON="$WORKFLOW_TOOLS/bin/python3.13"
WORKFLOW_QWEN_CODE="$WORKFLOW_TOOLS/qwen-code"
WORKFLOW_QWEN_CLI="$WORKFLOW_QWEN_CODE/dist/cli.js"
WORKFLOW_QWEN_HOME="$WORKFLOW_DIR/qwen-home"
WORKFLOW_SECRETS="$WORKFLOW_DIR/secrets"
# Machine-local test LLM endpoint values (base URL, key, model list, default), gitignored (Amendment A1).
# Committed code names only the generic AGENTIC_UI_LLM_* variables; the real values live only in this file.
WORKFLOW_LLM_ENV="$WORKFLOW_DIR/llm.env"

# Redirect every tool's state into WORKFLOW (uv, npm, XDG users, Python bytecode, temp files).
export TMPDIR="$WORKFLOW_DIR/tmp"
export XDG_CACHE_HOME="$WORKFLOW_DIR/cache/xdg"
export XDG_CONFIG_HOME="$WORKFLOW_DIR/home/.config"
export XDG_DATA_HOME="$WORKFLOW_DIR/home/.local/share"
export XDG_STATE_HOME="$WORKFLOW_DIR/home/.local/state"
export UV_INSTALL_DIR="$WORKFLOW_TOOLS/uv"
export UV_PYTHON_INSTALL_DIR="$WORKFLOW_TOOLS/python"
export UV_PYTHON_BIN_DIR="$WORKFLOW_TOOLS/bin"
export UV_TOOL_DIR="$WORKFLOW_TOOLS/uv-tools"
export UV_TOOL_BIN_DIR="$WORKFLOW_TOOLS/bin"
export UV_CACHE_DIR="$WORKFLOW_DIR/cache/uv"
export UV_NO_MODIFY_PATH=1
export npm_config_cache="$WORKFLOW_DIR/cache/npm"
export npm_config_update_notifier=false
export PYTHONPYCACHEPREFIX="$WORKFLOW_DIR/cache/pycache"
export RUFF_CACHE_DIR="$WORKFLOW_DIR/cache/ruff"
# vite-plus keeps its downloaded package manager under $VP_HOME (default ~/.vite-plus).
export VP_HOME="$WORKFLOW_DIR/home/.vite-plus"
# Test-suite locations (apps/agent-server/tests/support/tiers.py derives the same defaults).
export AGENTIC_UI_TEST_QWEN_CLI="$WORKFLOW_QWEN_CLI"
export AGENTIC_UI_TEST_QWEN_HOME="$WORKFLOW_QWEN_HOME"
export AGENTIC_UI_TEST_LLM_ENV="$WORKFLOW_LLM_ENV"
# Tier 2: the ru-code fake qwen in the owner's read-only checkout next to the repo (kept when already set, so
# scripts/clean-clone.sh's clone under WORKFLOW/tmp still points at the real sibling).
export AGENTIC_UI_TEST_FAKE_ACP="${AGENTIC_UI_TEST_FAKE_ACP:-$(dirname "$AGENTIC_UI_ROOT")/t3-ru-code/ru-code/apps/server/src/ru-code/tests/qwen/fake-acp/fake-acp-server.ts}"

# Real-LLM auth for dev runs (--check-agent, serve-agent.sh, pnpm dev:agent-mode, manual serve): just the OpenAI
# auth type. The endpoint base URL, the model list and the default model all come from the qwen home's
# settings.json (built from WORKFLOW/llm.env by setup-workflow.sh), so qwen advertises every configured model (the
# chat dropdown shows them all). Passing --model/--openai-base-url as flags would make qwen expose only one synthetic
# model, so we do not. No committed file names a provider, model or URL. Not set when the caller already set it.
if [ -z "${AGENTIC_UI_AGENT_EXTRA_ARGS:-}" ] && [ -f "$WORKFLOW_LLM_ENV" ]; then
  export AGENTIC_UI_AGENT_EXTRA_ARGS="--auth-type openai"
fi

# fontconfig/ exists up front: parallel Chromium workers racing to create it fall back to ~/.fontconfig (outside).
mkdir -p "$TMPDIR" "$XDG_CACHE_HOME" "$XDG_CACHE_HOME/fontconfig" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME" \
  "$UV_CACHE_DIR" "$npm_config_cache" "$WORKFLOW_TOOLS/bin" "$WORKFLOW_SECRETS"
chmod 700 "$WORKFLOW_SECRETS"
case ":$PATH:" in *":$WORKFLOW_TOOLS/bin:"*) ;; *) export PATH="$WORKFLOW_TOOLS/bin:$UV_INSTALL_DIR:$PATH" ;; esac
