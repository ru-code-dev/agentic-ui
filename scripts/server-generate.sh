#!/usr/bin/env bash
# DEC-034 / SV-C23: writes the agent server's generated files that follow the contract (root `pnpm run
# server:generate`; part of `pnpm build`, after the data sync and before the pyz and the hand-over bundle, so
# handover/ never copies a stale one): validator-cases/cases.json (the Node referee judges every example and mutant),
# fallback.json (carries the catalog id) and SERVER-CONTRACT.md. Standard-library Python 3.13 (SV-C1), ~5 s.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/workflow-env.sh"
python="$WORKFLOW_PYTHON"
[ -x "$python" ] || python="$(command -v python3.13 || true)"
[ -n "$python" ] || { echo "server-generate.sh: no Python 3.13 (run: bash scripts/setup-workflow.sh)" >&2; exit 1; }
cd "$AGENTIC_UI_ROOT/apps/agent-server"
"$python" -m tests.agreement.validator_cases --write
PYTHONPATH=src "$python" -m agentic_ui_server.conversation.fallback --write
PYTHONPATH=src "$python" -m agentic_ui_server.http.contract_doc --write
