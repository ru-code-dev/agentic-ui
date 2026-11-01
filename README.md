# agentic-ui

## Run locally

Needs Node 24, pnpm 10 and any Python 3.13 (`python3.13`, `python3`, or `AGENTIC_UI_PYTHON=/path/to/python`); no
setup script.

1. `. scripts/workflow-env.sh && pnpm install --frozen-lockfile` (the env keeps pnpm's store and caches inside
   `WORKFLOW/`, SV-C18). No build step: the dev page takes the contract version from the catalog source and the
   workspace packages from `src`, so a fresh clone runs as is.
2. Edit `agent-server.local.toml` at the repo root (gitignored): `agent.bin` = your qwen, `agent.env` = its env. The
   first `pnpm dev:agent-mode` creates it from `scripts/dev-agent-mode/agent-server.local.template.toml` and stops.
3. `pnpm dev:agent-mode`: agent server + playground; open http://127.0.0.1:3458/agent. Ctrl+C stops both.

The helper runs both in the project-local env of `scripts/workflow-env.sh` (SV-C18) by itself (HOME stays yours, so
your qwen keeps its login); pnpm itself writes its store and caches to HOME unless the shell sourced the env
(`node scripts/dev-agent-mode.mjs` starts the helper without pnpm). The manual way, two terminals (the same config;
both source the env: without it the server puts chat dirs and its cache under `~/.local/state` and `~/.cache`, and
`pnpm dev` refuses to run, SV-C18; `python3.13` stands for your Python 3.13: write `python3` or `"$AGENTIC_UI_PYTHON"`
when that is the one you have):

```sh
. scripts/workflow-env.sh && PYTHONPATH=apps/agent-server/src python3.13 -m agentic_ui_server --config agent-server.local.toml  # terminal 1
. scripts/workflow-env.sh && pnpm dev   # terminal 2: web only, proxies /api to http://127.0.0.1:8787
```

Turns a React UI kit (now Chakra UI v1, later the owner's Chakra v1 fork) into an **A2UI v0.9** component
catalog, so an LLM agent generates UIs as JSON that the client renders with that kit. Includes a dark playground,
a Python agent server that drives the custom Qwen CLI over ACP and validates every reply, and a generated
hand-over bundle for a production backend.

Guides: [`AGENTS.md`](AGENTS.md) (rules and commands for coding agents), [`REMAP.md`](REMAP.md) (change or swap
the kit), [`docs/server/DEPLOY.md`](docs/server/DEPLOY.md) (deploy server + playground),
[`docs/LIVE-TEST-ENV.md`](docs/LIVE-TEST-ENV.md) (run a live test machine against a local LLM endpoint). Requirements
and evidence are tracked in the workflow records under the gitignored `WORKFLOW/project/` of a working copy (e.g.
`WORKFLOW/project/docs/SPEC.md`, `WORKFLOW/project/docs/server/INTENT.md`,
`WORKFLOW/project/docs/TRACEABILITY.md` — every requirement ID → proving test); a fresh clone carries only the product.

## Packages

| Package                                                          | Role                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui-kit-one-catalog` (`@agentic-ui/ui-kit-one-catalog`) | **Contract**: Zod schemas of every component, tokens, functions, examples; generates `dist/catalog.json`, `dist/system-prompt.md`, `CONTRACTS.md`. No React, no kit.                                                |
| `packages/ui-kit-one-react` (`@agentic-ui/ui-kit-one-react`)     | **Renderer**: maps the contract onto the kit. `src/kit/` is the only folder importing the kit (one facade per component); `src/registry.ts` lists every component once; `UiKitProvider`; generated `MAPPING.md`.    |
| `packages/a2ui-react` (`@agentic-ui/a2ui-react`)                 | **Web integration package** (private, bundles the two packages above + the agent client): headless core, React chat / hooks / surfaces, kit provider. See [Web integration](#web-integration-agentic-uia2ui-react). |
| `apps/playground` (`@agentic-ui/playground`)                     | Dark playground (port 3458): workspace (editor + device preview + panels), `/components`, `/llm-context`, `/agent` chat (built on the package), `/integration/*` (Integration section), `/preview`.                 |
| `apps/agent-server`                                              | Python 3.13 stdlib server: ACP → custom Qwen CLI, validation, repair loop, fallback, JSON over HTTP; one file `agentic-ui-server.pyz`. See [`apps/agent-server/README.md`](apps/agent-server/README.md).            |
| `handover/`                                                      | Generated, versioned bundle for the production team (contract, prompt, examples, fallback, validator cases, HTTP contract, manifest).                                                                               |

## Architecture

```text
 contract (Zod, tokens)            renderer (kit facades)                  playground (static)
 packages/ui-kit-one-catalog ───▶ packages/ui-kit-one-react ───────────▶ apps/playground
   │ pnpm build                     ▲ renders A2UI messages                 │ /agent page
   ▼                                │                                       │ POST {base}/prompt, /action
 catalog.json + system-prompt.md ───┼──▶ apps/agent-server (pyz) ◀──────────┘ (JSON, no streaming)
   │                                │      │ ACP over stdio (one process per chat)
   ▼                                │      ▼
 handover/ (bundle + manifest)      │    custom Qwen CLI ──▶ LLM
                                    └─ validated messages (or the fallback surface) back to the page
```

## How A2UI works here

- The agent answers with text plus `<a2ui-json>[ ...messages ]</a2ui-json>` blocks. Messages (v0.9):
  `createSurface` (surface id + `catalogId` `urn:agentic-ui:catalog:ui-kit-one:v1`), `updateComponents` (a flat list
  of components linked by id, one `root`), `updateDataModel` (JSON Pointer `path` + `value`), `deleteSurface`.
- Props are literals, data bindings `{ "path": "/form/email" }` or function calls. Style props take theme tokens
  only (SV-C21). Inputs write the data model locally (two-way binding); nothing goes to the agent until an action.
- A button `action.event` `{name, context}` is the only thing sent back: the client sends the standard A2UI action
  `{name, surfaceId, sourceComponentId, timestamp, context}` plus the data model when the surface has
  `sendDataModel: true`. The agent answers with new messages (often a small `updateDataModel`).
- `catalog.json` (JSON Schema of the components) is the single source; the renderer, the prompt, the validator
  data and the docs are generated from the same contract.

## Commands

```sh
. scripts/workflow-env.sh        # every shell, first: TMPDIR, XDG_*, caches, pnpm store, PATH → WORKFLOW/
pnpm install --frozen-lockfile   # in the Linux VM: CI=true corepack pnpm install --frozen-lockfile --config.confirmModulesPurge=false
bash scripts/setup-workflow.sh   # once per machine, after the install: Python 3.13, qwen-code, ruff, Playwright into WORKFLOW/ (SV-C18)
pnpm dev                         # playground on http://127.0.0.1:3458 (reads workspace src)
pnpm dev:agent-mode              # agent server + playground together ("Run locally"; agent-server.local.toml)
pnpm build                       # packages, playground, server data, pyz, handover/
pnpm build:subpath               # playground for a subfolder (PLAYGROUND_BASE=/agentic-ui/)
pnpm test                        # unit tests (vitest)
pnpm test:server                 # agent server tiers 1–3 (unittest), inside the SV-C18 sentinel
pnpm e2e                         # Playwright against the production build + the real agent server
pnpm validate                    # every example against the contract
pnpm run docs                    # CONTRACTS.md + MAPPING.md
pnpm check                       # the full gate (size, reports, trace, script tests, lint, ruff, types, tests, server tests, validate, build, generated, server agreement, e2e)
```

The agent server for `pnpm dev` (the page proxies `/api` to `AGENT_SERVER_URL`, default `http://127.0.0.1:8787`):
terminal 1 of "Run locally" (your qwen), or "HTTP API" in [`apps/agent-server/README.md`](apps/agent-server/README.md)
(the project's qwen-code against the test LLM endpoint in `WORKFLOW/llm.env`, after `bash scripts/setup-workflow.sh`).

## Server / agent integration (hand-over)

Our Python server is the reference implementation. A production backend that replaces it gets
[`handover/`](handover/README.md) — generated by `pnpm build`, stale-checked by `pnpm check`:

| File                                     | Use                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `handover/catalog.json`                  | the contract; validate every payload against it (with `schemas/`, offline; see `handover/README.md`)     |
| `handover/system-prompt.md`              | the generated prompt (rules, interactions, few-shot examples)                                            |
| `handover/examples/*.json`               | valid payloads per composition and component                                                             |
| `handover/fallback.json`                 | the "sorry" surface after the repair attempts (Повторить → `agent.retry`)                                |
| `handover/validator-cases/`              | valid + broken payloads with the expected verdict (a production validator must agree)                    |
| `handover/SERVER-CONTRACT.md`            | HTTP API: required `/prompt`, `/action`; optional `/cancel`, `/progress`, `/models`, `/model`, `/health` |
| `handover/scripts/bundle-validator.mjs`  | the production validator of `handover/README.md` (SV-C28 stateful), from the bundle files alone          |
| `handover/scripts/bundle-state.mjs`      | its chat surface state and the merge of one reply (README steps 4–5)                                     |
| `handover/scripts/bundle-topology.mjs`   | its component tree rules (children, cycles, depth)                                                       |
| `handover/scripts/run-cases.mjs`         | runs that validator on every `validator-cases/` chat step and compares the verdicts                      |
| `handover/schemas/server_to_client.json` | the A2UI v0.9 message envelope every message is validated against                                        |
| `handover/schemas/common_types.json`     | A2UI v0.9 common types, the `$ref` targets of `catalog.json`                                             |
| `handover/manifest.json`                 | `version` (bumps automatically when any file changes), `catalogId`, `contractVersion`, sha256 per file   |

What the server does: builds the prompt from `system-prompt.md`, extracts the `<a2ui-json>` blocks, validates them
(our validator agrees with `@a2ui/agent` `validatePayload` on every case), sends the exact errors back to the agent
up to `repair.max_attempts` times in the same session, then returns the fallback. Transport is JSON over HTTP, no
streaming (SV-C6); the page shows a working state and can cancel. Event names are chosen by the agent inside the
generated JSON; the page posts them with the data model to `{base}/action`. The page names the server in one
constant: `AGENT_API_BASE` in `apps/playground/src/agent/endpoint.ts` (SV-C12).

Orchestrated flow (text always, UI when needed; SV-C27): [`docs/architecture/orchestrator-flow.md`](docs/architecture/orchestrator-flow.md).

## Web integration (`@agentic-ui/a2ui-react`)

A consumer project (SV-C26) installs ONE private package: the tarball packed in `packages/a2ui-react`
(its `prepack` script builds `dist/`), with its peers (`react`, `react-dom` ^18.3, `@chakra-ui/react` ^1.8.0 and
`@chakra-ui/icons` ^1.1.0, `@emotion/react`, `@emotion/styled` ^11, `framer-motion` ^6.5.0: caret ranges, so any
Chakra 1.8.x installs). The catalog, renderer and client are bundled inside. The client entry is browser-only
(Next.js: `next/dynamic(..., { ssr: false })`; `/core` is SSR-safe), and the host page must restrict images with a
CSP `img-src` (package README "Security").

```tsx
import { A2UIChat, useA2UIChat } from "@agentic-ui/a2ui-react";

export function Assistant() {
  const chat = useA2UIChat({ endpoint: "/api" }); // the host's session cookies go with every request
  return <A2UIChat chat={chat} placement="anchored" />; // or "follow" | "panel"
}
```

The server needs only `POST /prompt` and `POST /action`; `/cancel`, `/progress`, `/models`, `/model` are optional.
Every reply shows its text; surfaces render only for valid UI and are updated in place by surfaceId (SV-C27,
SV-C28). Other ways in: `useA2UISurfaces` + `extractA2UI` for a host's own chat, `useA2UIChat` state + `<A2UISurface>`
for a fully custom chat, the headless core `@agentic-ui/a2ui-react/core` without React. Details and the consumer
notices: [`packages/a2ui-react/README.md`](packages/a2ui-react/README.md).

The playground's **Integration** section (sidebar «Интеграция», `/integration/<page>`) shows each way as a running
demo: Full chat, Follow, Single panel, Bring your own chat, Headless, Minimal server, Surface history, Orchestrator
(auto UI). Each page has the tabs Demo / Code (the demo's own source file, `apps/playground/src/integration/demos/`)
/ Events (every request and answer) / Data model, and two modes: **Scripted** (a deterministic agent inside the
browser, no server and no LLM: `apps/playground/src/integration/scripted-server.ts`) and **Live** (our agent server
through the dev proxy `/api`, e.g. `pnpm dev:agent-mode`; Orchestrator needs `[reply] ui = "auto"`, Single panel
`[reply] surfaces = "single"`). The `/agent` page itself runs on the package (`useA2UIChat` + `<A2UISurface>`).

## Deploy

Full server + nginx guide: [`docs/server/DEPLOY.md`](docs/server/DEPLOY.md). The playground is a static build:

```sh
pnpm build                                   # root deploy → apps/playground/dist/
rsync -a --delete apps/playground/dist/ server:/var/www/agentic-ui/
pnpm build:subpath                           # subfolder /agentic-ui/ (PLAYGROUND_BASE) → apps/playground/dist/
```

```nginx
location / { root /var/www/agentic-ui; try_files $uri $uri/ /index.html; }                              # root
location /agentic-ui/ { alias /var/www/agentic-ui/; try_files $uri $uri/ /agentic-ui/index.html; }  # subfolder
```

Any other subfolder: `PLAYGROUND_BASE=/<path>/ pnpm --filter @agentic-ui/playground build` after `pnpm build`.

## Known quirks

- `pnpm run docs`, not `pnpm docs` (that is pnpm's built-in command that opens a browser).
- vite-plus keeps its task cache as SQLite in `node_modules/.vite/task-cache/`; in the shared macOS/Linux folder
  it can become unopenable ("Failed to initialize cache: unable to open database file"). The root `dev`, `build`,
  `test`, `e2e` and `check` scripts run `node --no-warnings scripts/vp-cache-heal.mjs` first, which deletes an
  unopenable cache; run it by hand for a direct `vp run`.
- The repo folder is shared between macOS and a Linux VM: `pnpm-workspace.yaml` installs native binaries for both
  (`supportedArchitectures`), and `WORKFLOW/tools/<os>-<arch>/` keeps both platforms' tools side by side.
- Use `127.0.0.1`, not `localhost`, for local servers in the VM (`::1` probing stalls).
- pnpm may stop on "purge node_modules?" after config changes: install with `CI=true` and
  `--config.confirmModulesPurge=false`.
- An old `/preview` tab from a previous build is ignored and the workspace shows "Stale preview tab — reload it".
- After a contract change, rebuild (`pnpm build`): `vp build` fails on a workspace `dist` older than its `src`.
