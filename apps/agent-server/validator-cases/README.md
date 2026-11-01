# validator-cases (SV-C23 / SV-C28 hand-over)

Generated, do not edit: `cases.json` holds chats of A2UI replies for the ui-kit-one contract with the expected
verdict of every reply. A production server validates statefully (SV-C28, a REQUIREMENT): it keeps each chat's
surfaces (components + data model per surfaceId, deletes applied) after every valid reply and checks every new reply
merged into a copy of them. So each case is one chat that starts EMPTY: `steps[]` are its replies in order, each
checked against the surfaces of the earlier valid steps; an invalid step leaves the state as it was.

- `steps[].expected.valid`: the verdict of the renderer's own state (`@a2ui/agent` 0.0.2 `RendererState`, which
  applies messages with web_core's `MessageProcessor`, plus the project rules of `handover/README.md` step 3–5);
  `nodeError` its error; `pythonErrors` every problem the reference Python validator
  (`apps/agent-server/src/agentic_ui_server/validation/`) reports. A conforming production validator gives the
  same `valid` verdict for every step of every case.
- Cases: every example of `packages/ui-kit-one-catalog/examples/` (a follow-up example such as `mock-rules/*` comes
  after the composition that creates its surface, so it is step 2), per mutation of
  `apps/agent-server/tests/agreement/mutate.py` its two smallest broken variants (as chats the same way), and the
  multi-turn scenarios of `tests/agreement/sequences.py` (`mutation: "multi-turn"`: create → update → action → update
  → delete, delete-then-create, update after delete, unknown surface, data-model writes, bound values, depth 50/51).
- Regenerate (after a contract change): `pnpm build` (its `scripts/server-generate.sh` step runs
  `cd apps/agent-server && "$WORKFLOW_PYTHON" -m tests.agreement.validator_cases --write` before the hand-over
  bundle copies this folder).
- Freshness: `tests/agreement/test_validator_agreement.py` (root `pnpm run check:server-agreement`, part of
  `pnpm check`) fails while this file differs from a fresh generation; `tests/agreement/test_surface_agreement.py`
  checks the full corpus, the scenarios and seeded follow-up fuzzing step by step against the referee.
