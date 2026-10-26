step: 04-examples
commit: 98f155b
files: +27 ~5 -0
checks:
  typecheck: pass
  lint: pass (0 warn)
  test: pass 128/128
  build: pass
  e2e: pass 9/9
intents_done:
  - INT-06: 20 compositions EX-01..EX-20 (8 banking: account overview, transactions, transfer, card management, loan offer, bill payment, fraud alert, spending summary), Russian text, RUB via formatCurrency / currency columns, varying data in updateDataModel bound by path, sendDataModel on every surface with inputs, the spec's action event names; 19 component snippets (step 02); 5 mock-rule presets | evidence: packages/ui-kit-one-catalog/tests/examples.test.ts::example compositions; packages/ui-kit-one-catalog/examples/
  - EX-01..EX-20: every composition validates (catalog.json envelope + validatePayload) and renders through the renderer with zero console output | evidence: `pnpm validate` (44 examples valid); packages/ui-kit-one-react/tests/compositions.test.tsx::every composition renders through the renderer
  - PG-12: mock-rule presets `{ event, messages }` for login.submit → welcome, transfer.confirm → success, fraud.block → card blocked, loan.apply → application accepted (+ onboarding.continue → progress), each applied to its composition in tests (preset part) | evidence: packages/ui-kit-one-react/tests/compositions.test.tsx::every composition renders through the renderer > applies the transfer-success.json reply to its composition; packages/ui-kit-one-catalog/tests/examples.test.ts::example compositions > ship mock-rule presets for the four required replies
deviations_from_spec:
  - id: D1 | spec: §7 EX-09 | the progress indicator binds to the same five step booleans through the "Продолжить" Button's `and(...)` check (disabled until every step is checked) plus a progress Text bound to `/progress`, which the onboarding.continue mock reply updates; a live "N из 5" count is not derivable client-side | why_better: A2UI v0.9 expressions have no arithmetic or conditionals, so a client-computed count would need a non-standard function; this keeps the example within the protocol
  - id: D2 | spec: §7 mock rules | a fifth preset (onboarding.continue → progress update) is added | why_better: demonstrates a data-model-only agent reply next to the four screen-replacing ones
  - id: D3 | spec: §7 | Modal triggers fire `modal.open` events (S01-I2); tests accept `modal.open` in addition to the listed event names | why_better: keeps Button.action required (A2UI basic catalog parity) as decided in S01-I2
  - id: D4 | spec: §5.5 validate | `pnpm validate` reports each invalid message as `file messages[i]: <instancePath> <message>` (first three schema errors) and checks mock rules too | why_better: readable failures for authors; mock replies are validated like every other example
open_issues:
  - id: I1 | severity: minor | `pnpm conformance` exits 1 "Task not found" until step 06 (S01-I1)
