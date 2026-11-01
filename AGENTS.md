# AGENTS.md — rules and commands for coding agents

Read first: this file, [`README.md`](README.md), and `REMAP.md` (changing the kit),
[`docs/server/DEPLOY.md`](docs/server/DEPLOY.md) (deploying). The workflow records (SPEC §0 rules R1–R10, DECISIONS,
the server INTENT SV-C1..C28, PLAN/RESEARCH/EXPERIMENT, reports, traceability) are not committed product: they live
in the gitignored `WORKFLOW/project/` of a working copy, at the same relative path (e.g.
`WORKFLOW/project/docs/DECISIONS.md`, `WORKFLOW/project/docs/server/INTENT.md`). A fresh clone carries only the
product; the workflow tools below read `WORKFLOW/project/…` and skip cleanly when it is absent.

## Layout

| Path                                                      | What                                                                          | Edit by hand?       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------- |
| `packages/ui-kit-one-catalog/src/components/`             | one contract file per component (Zod + prop kinds)                            | yes                 |
| `packages/ui-kit-one-catalog/src/tokens/`                 | token lists per group (the model-facing subset of the kit theme)              | yes                 |
| `packages/ui-kit-one-catalog/examples/`                   | `compositions/`, `components/` (one snippet per component), `mock-rules/`     | yes                 |
| `packages/ui-kit-one-catalog/src/prompt/`                 | prompt assembly (`catalog:prompt`, `/llm-context`)                            | yes                 |
| `packages/ui-kit-one-react/src/kit/`                      | the kit boundary: one facade per kit component, theme, providers              | yes                 |
| `packages/ui-kit-one-react/src/registry.ts`               | single component registry (custom entries + `PASSTHROUGH`)                    | yes                 |
| `packages/ui-kit-one-react/src/passthrough-components.ts` | pure-data components, one line each                                           | yes                 |
| `packages/ui-kit-one-react/src/components/`               | custom components (bindings, actions, Modal, Tabs, Table, Icon, List)         | yes                 |
| `packages/a2ui-react/`                                    | PKG web package `@agentic-ui/a2ui-react`: `src/core/` headless, `src/react/`  | yes                 |
| `apps/playground/src/`                                    | playground (workspace, catalog, llm, agent, integration, preview)             | yes                 |
| `apps/playground/src/integration/`                        | Integration section: `demos/` (shown as Code), scripted agent, Live/Scripted  | yes                 |
| `apps/playground/e2e/`                                    | Playwright specs (`e2e/agent/` = scripted ACP agent + server launcher)        | yes                 |
| `apps/agent-server/src/agentic_ui_server/`                | server source (one concern per module)                                        | yes, except `data/` |
| `apps/agent-server/tests/`                                | unittest tiers 1–4 (`tests/support/tiers.py`)                                 | yes                 |
| `scripts/`                                                | gates: size, reports, trace, generated, hand-over, sentinel, cache heal       | yes                 |
| `WORKFLOW/project/docs/server/reports/`                   | one report per phase + `<PHASE>-pnpm-check.log` (gitignored workflow record)  | yes                 |
| `WORKFLOW/`                                               | gitignored: tools, builds, caches, temp, secrets, `project/` workflow records | never commit        |

Generated (never edit; `pnpm check` fails while stale): `packages/ui-kit-one-catalog/dist/`,
`packages/ui-kit-one-catalog/CONTRACTS.md`, `packages/ui-kit-one-react/MAPPING.md`,
`apps/agent-server/src/agentic_ui_server/data/`, `apps/agent-server/fallback.json`,
`apps/agent-server/validator-cases/cases.json`, `apps/agent-server/SERVER-CONTRACT.md`, `handover/`,
`WORKFLOW/project/docs/TRACEABILITY.md` (from `WORKFLOW/project/docs/TRACEABILITY.ids.json` + test tags; gitignored),
`apps/agent-server/dist/agentic-ui-server.pyz`.
`pnpm build` regenerates all of them. `pnpm run check:generated` compares each tracked one with its staged copy (git
index) and with the file on disk: **stage regenerated files before `check:generated` / `pnpm check`** (a fresh but
unstaged file reads "stage the regenerated file"; an unstaged hand edit or deletion fails too).

## Rules

- **Kit boundary**: only `packages/ui-kit-one-react/src/kit/` imports `@chakra-ui/*`, `@emotion/*`, `framer-motion`
  (lint error elsewhere). Facades are typed `ComponentType<Pick<Props, ...>>` assignments, never casts.
- **Code (DEC-047, DEC-050)**: `pnpm lint` 0 errors 0 warnings (`--deny-warnings`), `pnpm typecheck` 0, `pnpm run
lint:python` (ruff) 0; no `export *` / `export * as` anywhere; `import * as` only as a reasoned lookup table
  (`packages/ui-kit-one-react/src/icon-map.ts`); every hand-written source file ≤ 250 lines (`pnpm check:size`);
  no `.only`, no unexplained `.skip`, no `@ts-ignore`; formatting is done by `.githooks/pre-commit` on commit.
- **Server (SV-C1, SV-C3)**: Python 3.13 standard library only at runtime; ruff is a dev tool in `WORKFLOW/`.
- **Models (SV-C15/SV-C17)**: the server has no model or provider in its code defaults; every LLM call goes through
  qwen to the machine's test LLM endpoint, named only by the gitignored `WORKFLOW/llm.env` (generic
  `AGENTIC_UI_LLM_*` variables). No committed file names a model id, provider, provider URL or key;
  `apps/agent-server/tests/unit/test_model_policy.py` enforces it. Dev/test flags live only in
  `apps/agent-server/config.dev.toml` (provider-neutral) and the composed `AGENTIC_UI_AGENT_EXTRA_ARGS` (SV-C15).
- **Project-local (SV-C18)**: `. scripts/workflow-env.sh` in every shell; nothing is written outside the repo
  (`scripts/project-local.sh` proves it around the server tiers; `scripts/workflow-guard.mjs` makes `pnpm check`, `build`,
  `test`, `e2e` and `dev` refuse to run without it; `pnpm dev:agent-mode` applies the same env to its children
  itself); temp files go to `WORKFLOW/tmp/`. Never print,
  copy or commit `WORKFLOW/secrets/*`.
- **Traceability (DEC-032, DEC-068)**: a test proves a requirement with `[ID]` in its title (Python: in the docstring);
  `pnpm check:trace` fails on an unknown ID, a tag on a skipped test, a `scripts/**.test.mjs` file `pnpm check` does
  not run (A4b-P3), a test file outside every runner's include (`RUNNERS` in `scripts/traceability/run.mjs`; a Python test
  directory needs `__init__.py`, A5-05), or an in-scope ID of a done phase without ≥1 tagged test or listed check; new IDs go into
  `WORKFLOW/project/docs/TRACEABILITY.ids.json`; `pnpm trace` regenerates the matrix (the pre-commit hook does it too).
- **Process (DEC-026..030, DEC-068)**: failures are fixed, never parked; decisions inside the SV constraints are made with
  evidence and logged in `WORKFLOW/project/docs/DECISIONS.md`. Each phase writes one report
  `WORKFLOW/project/docs/server/reports/info-<PHASE>-<slug>.md`
  in the format of `WORKFLOW/project/docs/server/reports/REPORT-FORMAT.md` (zero prose, every entry with evidence), created first
  and updated with every commit; `node scripts/check-report.mjs` must pass. Proof = test names (`test:`), files
  (`file:`) and commands with counts (`cmd: … => …`); a phase's final proof is `pnpm check` green on the final tree,
  its output saved as one plain log `WORKFLOW/project/docs/server/reports/<PHASE>-pnpm-check.log`. No run dumps, content hashes or
  dump-based traceability (DEC-068); `commit:` / `run:` pointers are informational text.
- **Agents (DEC-065)**: only the orchestrator spawns agents; workers and reviewers never spawn subagents or forks. A
  worker that runs out of room commits, marks its report partial and stops.
- **Commits**: conventional message with the phase, explicit pathspecs, never stage `WORKFLOW/`, never push,
  never rewrite history; `pnpm check` green and `git status --porcelain` empty afterwards.

## Remote worker protocol (DEC-076)

A worker on another machine (same shared repo folder, same paths) is steered by the orchestrator through files only:

| File (under `WORKFLOW/remote/<TASK>/`) | Writer       | Content                                                                                                                                                                             |
| -------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRIEF.md`                             | orchestrator | the complete task (the contract); the worker reads it first, fully                                                                                                                  |
| `STATUS.md`                            | worker       | line 1 exactly `status: running` / `waiting` / `blocked` / `done`; below, append-only, one line per checkpoint: `CP-NN \| <UTC time> \| what is done \| commit \| proof (test/cmd)` |
| `STEER.md`                             | orchestrator | append-only, one answer per checkpoint: `CP-NN \| ok`, `CP-NN \| amend: <change>` (do it, report it as the next checkpoint), `FINAL \| accepted`, `FINAL \| rework: <what>`         |
| `ASK.md`                               | worker       | only when blocked on something only the owner can do (e.g. a system library needing sudo): exactly what is needed and why; then `status: blocked`                                   |

The worker: after each checkpoint it sets `status: waiting`, then polls `STEER.md` (e.g. every 60 s) until the line for that
checkpoint appears and follows it; after the last checkpoint it sets `status: done` and waits for `FINAL` the same way.
Questions never go interactively (no chat prompts to the owner or orchestrator): append `Q-NN | <UTC time> | question |
options | recommendation` to `STATUS.md`, set `status: waiting`, and poll `STEER.md` for `Q-NN | <answer>`. Only physical
owner actions (sudo, network, hardware) go to `ASK.md` with `status: blocked`. Workers never spawn subagents (DEC-065).

## Commands per task

| Task                                | Command                                                                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fresh machine                       | `. scripts/workflow-env.sh`, `pnpm install --frozen-lockfile`, then `bash scripts/setup-workflow.sh` (its Playwright step needs `node_modules`)                                                                                   |
| dev shell                           | `. scripts/workflow-env.sh`                                                                                                                                                                                                       |
| playground dev                      | `pnpm dev`                                                                                                                                                                                                                        |
| local run (server + playground)     | `pnpm dev:agent-mode` (config `agent-server.local.toml`, created from `scripts/dev-agent-mode/agent-server.local.template.toml`; DEC-057)                                                                                         |
| change the contract / tokens        | edit, `pnpm build`, stage the edits and every regenerated file, then `pnpm check` (REMAP.md "Proof")                                                                                                                              |
| regenerate everything               | `pnpm build` (contract, docs, MAPPING.md, server data, validator cases, fallback, SERVER-CONTRACT.md, pyz, `handover/`)                                                                                                           |
| stale generated artifacts           | stage the regenerated files first, then `pnpm run check:generated` (compares with the staged copy)                                                                                                                                |
| server data after a contract change | `pnpm run server:sync-data` (also part of `pnpm build`)                                                                                                                                                                           |
| validator cases, fallback, HTTP doc | `pnpm run server:generate` (part of `pnpm build`, before the pyz and `handover/`)                                                                                                                                                 |
| hand-over bundle                    | `pnpm run handover` (also the last step of `pnpm build`)                                                                                                                                                                          |
| server tests                        | `pnpm test:server`; tier 4 over HTTP (real LLM, opt-in): `cd apps/agent-server && AGENTIC_UI_TEST_TIERS=4 "$WORKFLOW_PYTHON" -m unittest tests.integration.test_http_llm -v` (other tier-4 suites: `apps/agent-server/README.md`) |
| e2e                                 | `pnpm e2e`; tier 4 through the page: `cd apps/playground && npx playwright test -c playwright.real.config.ts`                                                                                                                     |
| traceability                        | `pnpm check:trace`, `pnpm trace`                                                                                                                                                                                                  |
| reports                             | `node scripts/check-report.mjs`                                                                                                                                                                                                   |
| clean-clone proof                   | `bash scripts/clean-clone.sh`                                                                                                                                                                                                     |
| full gate                           | `pnpm check`                                                                                                                                                                                                                      |

## How to add a component, an example, or wire an agent (DOC-06)

- **Component**: recipe 7 "add a component" in [`REMAP.md`](REMAP.md): 9 hand-written files for a pure-data
  component with a new kit facade (contract file, `src/components/index.ts`, the DEC-050 export in the catalog
  `src/index.ts` and its public-API test, snippet example, kit facade + `src/kit/index.ts` + the renderer public-API
  test, one passthrough line anywhere: lookup is by name); `scripts/component-files.test.mjs` pins the list and fails on a new hardcoded
  per-component list; `packages/ui-kit-one-react/tests/registry.test.ts` fails until registry and contract agree.
- **Example**: add `packages/ui-kit-one-catalog/examples/compositions/<NN-name>.json` (`{name, description,
messages}`) or `examples/components/<Name>.json`; `pnpm validate`; the playground sidebar, `handover/examples/`
  and the validator cases pick it up after `pnpm build`. A composition reaches the system prompt's few-shot
  examples only when its id is added to `PROMPT_EXAMPLE_IDS` (`packages/ui-kit-one-catalog/src/prompt/`).
- **Agent**: the playground's `/agent` page (built on `@agentic-ui/a2ui-react`: `useA2UIChat` over the module chat in
  `apps/playground/src/agent/agent-chat.ts`) talks to any server that implements `handover/SERVER-CONTRACT.md`
  (`AGENT_API_BASE` in `apps/playground/src/agent/endpoint.ts`). An Integration page = one demo file in
  `apps/playground/src/integration/demos/` + one entry in `pages.ts` and `nav.ts` there. The workspace preview keeps `LocalTransport`
  (mock rules); another transport plugs in at the runtime seam without renderer changes (`Transport` in
  `packages/ui-kit-one-react/src/runtime/`). Our server drives any ACP CLI configured in its TOML (`agent.bin`).
