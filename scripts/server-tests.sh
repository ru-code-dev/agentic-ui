#!/usr/bin/env bash
# TOOL-I1: the agent server's Python unittest suite, tiers 1,2,3 (unit + scripted agent + agreement, ru-code fake
# qwen, real qwen-code + fake LLM; tier 4 is opt-in and never runs here). AGENTIC_UI_TEST_STRICT=1 (default here):
# a missing tier-2/3 prerequisite fails the run instead of skipping its proofs; =0 skips them knowingly. `-v`
# lists every test with its result, so run dumps show which tagged tests passed (A4b-P3).
# Root `pnpm run test:server`, part of `pnpm check`. Extra args go to unittest.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/workflow-env.sh"
cd "$AGENTIC_UI_ROOT/apps/agent-server"
AGENTIC_UI_TEST_STRICT="${AGENTIC_UI_TEST_STRICT:-1}" AGENTIC_UI_TEST_TIERS="${AGENTIC_UI_TEST_TIERS:-1,2,3}" exec "$WORKFLOW_PYTHON" -m unittest discover -v -s tests -t . "$@"
