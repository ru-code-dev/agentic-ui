#!/usr/bin/env bash
# Recreate the project-local dev environment in WORKFLOW/ (SV-C18). Idempotent; safe to re-run.
#   bash scripts/setup-workflow.sh          # uv + Python 3.13, qwen-code 0.21.1 build, isolated qwen home
#   bash scripts/setup-workflow.sh --check  # only report what is present
# Everything is written inside WORKFLOW/ (HOME is pointed there during installs too). No API key is ever
# created, printed or copied: machine-local LLM values live only in the gitignored WORKFLOW/llm.env.
set -euo pipefail

UV_VERSION="0.13.6"
PYTHON_VERSION="3.13"
RUFF_VERSION="0.17.3"
QWEN_CODE_VERSION="0.21.1"
QWEN_CODE_TAG="v$QWEN_CODE_VERSION"
QWEN_CODE_COMMIT="41b4ee8373fb4aa324925e69e0515ca72959ec5b"
QWEN_CODE_UPSTREAM="https://github.com/QwenLM/qwen-code.git"
# Owner's local checkout (read-only; cloned from, never written to). Override with QWEN_CODE_SRC.
QWEN_CODE_SRC="${QWEN_CODE_SRC:-/Users/user/WORKSPACE/Projects/Qwen/t3-ru-code/qwen-code}"
# The env var qwen reads the test LLM API key from (its modelProviders envKey); the key value lives in WORKFLOW/llm.env.
LLM_ENV_KEY="AGENTIC_UI_LLM_KEY"
# Python builds straight from GitHub (the default astral mirror was very slow on the VM). Override to taste.
export UV_PYTHON_INSTALL_MIRROR="${UV_PYTHON_INSTALL_MIRROR:-https://github.com/astral-sh/python-build-standalone/releases/download}"

# shellcheck source=workflow-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/workflow-env.sh"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1
export HOME="$WORKFLOW_DIR/home"
mkdir -p "$HOME"

log() { printf '[setup-workflow] %s\n' "$*"; }

# Value of a variable assignment in WORKFLOW/llm.env (gitignored), or empty. Never printed by this script.
llm_env_value() {
  [ -f "$WORKFLOW_LLM_ENV" ] || return 0
  sed -n "s/^$1=//p" "$WORKFLOW_LLM_ENV" | head -n1
}

setup_python() {
  if [ -x "$WORKFLOW_PYTHON" ] && "$WORKFLOW_PYTHON" -c 'import sys; assert sys.version_info[:2] == (3, 13)' 2>/dev/null; then
    log "python ok: $WORKFLOW_PYTHON ($("$WORKFLOW_PYTHON" --version))"; return
  fi
  [ "$CHECK_ONLY" = 1 ] && { log "python MISSING: $WORKFLOW_PYTHON"; return; }
  if [ ! -x "$UV_INSTALL_DIR/uv" ]; then
    local target archive base="https://github.com/astral-sh/uv/releases/download/$UV_VERSION"
    case "$(uname -s)-$(uname -m)" in
      Linux-aarch64) target="aarch64-unknown-linux-gnu" ;; Linux-x86_64) target="x86_64-unknown-linux-gnu" ;;
      Darwin-arm64) target="aarch64-apple-darwin" ;; Darwin-x86_64) target="x86_64-apple-darwin" ;;
      *) log "unsupported platform $(uname -s)-$(uname -m)"; exit 1 ;;
    esac
    archive="$TMPDIR/uv-$target.tar.gz"
    log "installing uv $UV_VERSION ($target) into $UV_INSTALL_DIR"
    curl -LsSf -o "$archive" "$base/uv-$target.tar.gz"
    curl -LsSf -o "$archive.sha256" "$base/uv-$target.tar.gz.sha256"
    (cd "$TMPDIR" && echo "$(cut -d' ' -f1 "$archive.sha256")  $(basename "$archive")" | shasum -a 256 -c - >/dev/null) \
      || { log "uv checksum mismatch"; exit 1; }
    mkdir -p "$UV_INSTALL_DIR"
    tar -xzf "$archive" -C "$UV_INSTALL_DIR" --strip-components 1
    rm -f "$archive" "$archive.sha256"
  fi
  log "installing Python $PYTHON_VERSION into $UV_PYTHON_INSTALL_DIR"
  "$UV_INSTALL_DIR/uv" python install "$PYTHON_VERSION"
  # Stable path independent of the patch version (uv also writes this link when UV_PYTHON_BIN_DIR is set).
  ln -sf "$("$UV_INSTALL_DIR/uv" python find --managed-python "$PYTHON_VERSION")" "$WORKFLOW_PYTHON"
  log "python ok: $WORKFLOW_PYTHON ($("$WORKFLOW_PYTHON" --version))"
}

setup_qwen_code() {
  if [ -f "$WORKFLOW_QWEN_CLI" ] && [ "$(git -C "$WORKFLOW_QWEN_CODE" rev-parse HEAD 2>/dev/null)" = "$QWEN_CODE_COMMIT" ]; then
    log "qwen-code ok: $WORKFLOW_QWEN_CLI ($QWEN_CODE_TAG)"; return
  fi
  [ "$CHECK_ONLY" = 1 ] && { log "qwen-code MISSING: $WORKFLOW_QWEN_CLI"; return; }
  if [ ! -d "$WORKFLOW_QWEN_CODE/.git" ]; then
    if git -C "$QWEN_CODE_SRC" rev-parse -q --verify "refs/tags/$QWEN_CODE_TAG" >/dev/null 2>&1; then
      log "cloning $QWEN_CODE_SRC @ $QWEN_CODE_TAG (local, read-only source)"
      git clone --quiet --no-hardlinks --branch "$QWEN_CODE_TAG" "$QWEN_CODE_SRC" "$WORKFLOW_QWEN_CODE"
    else
      log "cloning $QWEN_CODE_UPSTREAM @ $QWEN_CODE_TAG"
      git clone --quiet --depth 1 --branch "$QWEN_CODE_TAG" "$QWEN_CODE_UPSTREAM" "$WORKFLOW_QWEN_CODE"
    fi
  fi
  local head; head="$(git -C "$WORKFLOW_QWEN_CODE" rev-parse HEAD)"
  [ "$head" = "$QWEN_CODE_COMMIT" ] || { log "qwen-code HEAD $head != expected $QWEN_CODE_COMMIT ($QWEN_CODE_TAG)"; exit 1; }
  log "building qwen-code (npm ci && npm run bundle), npm cache $npm_config_cache"
  (cd "$WORKFLOW_QWEN_CODE" && npm ci --no-audit --no-fund && npm run bundle)
  [ -f "$WORKFLOW_QWEN_CLI" ] || { log "build did not produce $WORKFLOW_QWEN_CLI"; exit 1; }
  log "qwen-code ok: $WORKFLOW_QWEN_CLI ($(node "$WORKFLOW_QWEN_CLI" --version))"
}

setup_qwen_home() {
  local settings="$WORKFLOW_QWEN_HOME/.qwen/settings.json"
  [ "$CHECK_ONLY" = 1 ] && { [ -f "$settings" ] && log "qwen home ok: $settings" || log "qwen home MISSING: $settings"; return; }
  mkdir -p "$(dirname "$settings")"
  # The isolated qwen home points at the machine's test LLM endpoint, read from the gitignored WORKFLOW/llm.env
  # (generic variable names only; the real base URL / models / key never enter a committed file). One OpenAI-
  # compatible provider entry per model in AGENTIC_UI_LLM_MODELS; the key goes into the settings env block, which
  # qwen's loadEnvironment applies to each entry's envKey. Missing llm.env -> a placeholder home + a clear note.
  local base models default key
  base="$(llm_env_value AGENTIC_UI_LLM_BASE_URL)"
  models="$(llm_env_value AGENTIC_UI_LLM_MODELS)"
  default="$(llm_env_value AGENTIC_UI_LLM_DEFAULT)"
  key="$(llm_env_value "$LLM_ENV_KEY")"
  if [ -z "$base" ] || [ -z "$models" ]; then
    log "qwen home: $WORKFLOW_LLM_ENV missing or incomplete; set AGENTIC_UI_LLM_BASE_URL and AGENTIC_UI_LLM_MODELS (real-LLM tests skip without it)"
    base="${base:-http://127.0.0.1:0/v1}"; models="${models:-model-a}"; default="${default:-model-a}"
  fi
  [ -n "$default" ] || default="${models%%,*}"
  local entries="" first="" m
  local IFS=,
  for m in $models; do
    [ -n "$m" ] || continue
    [ -z "$first" ] && first="$m"
    [ -n "$entries" ] && entries="$entries,"
    entries="$entries
      { \"id\": \"$m\", \"name\": \"$m\", \"baseUrl\": \"$base\", \"envKey\": \"$LLM_ENV_KEY\" }"
  done
  unset IFS
  [ -n "$default" ] || default="$first"
  cat > "$settings" <<JSON
{
  "modelProviders": {
    "openai": [$entries
    ]
  },
  "env": { "$LLM_ENV_KEY": "$key" },
  "security": { "auth": { "selectedType": "openai" } },
  "model": { "name": "$default" },
  "\$version": 4
}
JSON
  log "qwen home ok: $settings (default model and key from $WORKFLOW_LLM_ENV, values not shown)"
}

check_llm_env() {
  local file="$WORKFLOW_LLM_ENV"
  if [ ! -f "$file" ]; then
    log "llm env MISSING: create $file (chmod 600) with AGENTIC_UI_LLM_BASE_URL, $LLM_ENV_KEY, AGENTIC_UI_LLM_MODELS, AGENTIC_UI_LLM_DEFAULT (real-LLM tests skip without it)"; return
  fi
  chmod 600 "$file"
  if [ -n "$(llm_env_value AGENTIC_UI_LLM_BASE_URL)" ] && [ -n "$(llm_env_value "$LLM_ENV_KEY")" ]; then
    log "llm env ok: $file (mode 600, values not shown)"
  else
    log "llm env $file missing AGENTIC_UI_LLM_BASE_URL or $LLM_ENV_KEY"
  fi
}

# Playwright browsers for `pnpm e2e`: workflow-env.sh points XDG_CACHE_HOME into WORKFLOW/, so the
# default browser path is WORKFLOW/cache/xdg/ms-playwright (SV-C18).
setup_playwright() {
  local dir="$XDG_CACHE_HOME/ms-playwright"
  if ls -d "$dir"/chromium_headless_shell-* >/dev/null 2>&1; then log "playwright chromium ok: $dir"; return; fi
  [ "$CHECK_ONLY" = 1 ] && { log "playwright chromium MISSING: $dir"; return; }
  log "installing playwright chromium into $dir"
  (cd "$AGENTIC_UI_ROOT/apps/playground" && pnpm exec playwright install chromium)
  log "playwright chromium ok: $dir"
}

# DEC-047: ruff (lint + format) for apps/agent-server as a uv tool in WORKFLOW (dev only; runtime stays stdlib).
setup_ruff() {
  local ruff="$UV_TOOL_BIN_DIR/ruff"
  if [ -x "$ruff" ] && [ "$("$ruff" --version)" = "ruff $RUFF_VERSION" ]; then log "ruff ok: $ruff ($RUFF_VERSION)"; return; fi
  [ "$CHECK_ONLY" = 1 ] && { log "ruff MISSING: $ruff ($RUFF_VERSION)"; return; }
  log "installing ruff $RUFF_VERSION into $UV_TOOL_DIR"
  "$UV_INSTALL_DIR/uv" tool install --force "ruff==$RUFF_VERSION"
  log "ruff ok: $ruff ($("$ruff" --version))"
}

# DEC-047: the committed hooks format every commit (.githooks/pre-commit + post-commit).
setup_git_hooks() {
  local current
  current=$(git -C "$AGENTIC_UI_ROOT" config --get core.hooksPath || true)
  if [ "$current" = ".githooks" ]; then log "git hooks ok: core.hooksPath=.githooks"; return; fi
  [ "$CHECK_ONLY" = 1 ] && { log "git hooks MISSING: core.hooksPath=${current:-unset}"; return; }
  git -C "$AGENTIC_UI_ROOT" config core.hooksPath .githooks
  log "git hooks ok: core.hooksPath=.githooks"
}

setup_git_hooks
setup_python
setup_ruff
setup_qwen_code
setup_playwright
setup_qwen_home
check_llm_env
log "done. Use: . scripts/workflow-env.sh  (python: $WORKFLOW_PYTHON, qwen: node $WORKFLOW_QWEN_CLI, HOME for qwen: $WORKFLOW_QWEN_HOME)"
