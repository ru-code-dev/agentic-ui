#!/usr/bin/env bash
# SV-C13: the agent server's Python-vs-Node agreement suites (apps/agent-server/tests/agreement: parser P3,
# validator P4, fallback P5, bundled data CF-I3). Root `pnpm run check:server-agreement`, part of `pnpm check`.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/workflow-env.sh"
cd "$AGENTIC_UI_ROOT/apps/agent-server"
AGENTIC_UI_TEST_TIERS=1 exec "$WORKFLOW_PYTHON" -m unittest discover -s tests/agreement -t . "$@"
