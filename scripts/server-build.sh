#!/usr/bin/env bash
# SV-C2 / P7: builds apps/agent-server/dist/agentic-ui-server.pyz (root `pnpm run server:build`, last step of
# `pnpm build`); `--check` verifies the built pyz carries the current code + data (part of `check:generated`).
# Python: the WORKFLOW 3.13 (scripts/setup-workflow.sh), else python3.13 on PATH. Extra args go to build_pyz.py.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/workflow-env.sh"
python="$WORKFLOW_PYTHON"
[ -x "$python" ] || python="$(command -v python3.13 || true)"
[ -n "$python" ] || { echo "server-build.sh: no Python 3.13 (run: bash scripts/setup-workflow.sh)" >&2; exit 1; }
exec "$python" "$AGENTIC_UI_ROOT/apps/agent-server/scripts/build_pyz.py" "$@"
