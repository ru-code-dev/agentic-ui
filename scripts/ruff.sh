#!/usr/bin/env bash
# DEC-047: runs the WORKFLOW ruff (scripts/setup-workflow.sh) with the repo's dev env, e.g.
# `bash scripts/ruff.sh check apps/agent-server` (root `pnpm run lint:python`, part of `pnpm check`).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/workflow-env.sh"
ruff="$WORKFLOW_TOOLS/bin/ruff"
[ -x "$ruff" ] || { echo "ruff.sh: $ruff missing (run: bash scripts/setup-workflow.sh)" >&2; exit 1; }
exec "$ruff" "$@"
