# agentic-ui-server

Python 3.13, stdlib-only agent server for the playground Agent page. It drives the (custom) Qwen CLI over ACP,
validates A2UI replies against the ui-kit-one contract, repairs or falls back, and serves JSON over HTTP.
Spec, plan and evidence are workflow records under the gitignored `WORKFLOW/project/` of a working copy
(`WORKFLOW/project/docs/server/INTENT.md` SV-C1..C28, `…/PLAN.md`, `…/RESEARCH.md`, reports under
`…/docs/server/reports/`); a fresh clone carries only the product. HTTP API contract: [`SERVER-CONTRACT.md`](SERVER-CONTRACT.md).
Status: all phases done (P2–P8, P10, CF, A2, A3F, DEV, A4F, SIMPLIFY, PKG; P9 MCP out of scope, DEC-051).

## Dev environment

Everything is project-local in the gitignored `WORKFLOW/` folder at the repo root (SV-C18). Nothing is written to
`~/.local`, `~/.config`, `~/build` or `/tmp`.

```sh
. scripts/workflow-env.sh                 # each shell, first: TMPDIR, XDG_*, uv/npm/pnpm caches, PATH -> WORKFLOW/
bash scripts/setup-workflow.sh            # once per machine, after `pnpm install`; idempotent; --check only reports
"$WORKFLOW_PYTHON" --version              # Python 3.13.x
```

| Path                                                 | Content                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WORKFLOW/tools/<os>-<arch>/uv/`                     | uv (pinned release from GitHub, sha256-checked)                                                                                                        |
| `WORKFLOW/tools/<os>-<arch>/python/`                 | uv-managed CPython 3.13                                                                                                                                |
| `WORKFLOW/tools/<os>-<arch>/bin/python3.13`          | stable interpreter link (`$WORKFLOW_PYTHON`)                                                                                                           |
| `WORKFLOW/tools/<os>-<arch>/qwen-code/`              | qwen-code v0.21.1 clone + `npm ci && npm run bundle` → `dist/cli.js` (`$WORKFLOW_QWEN_CLI`)                                                            |
| `WORKFLOW/qwen-home/.qwen/settings.json`             | isolated qwen home, generated from `WORKFLOW/llm.env`: one OpenAI-compatible provider entry per test model, `envKey` + an env-block key, default model |
| `WORKFLOW/llm.env`                                   | machine-local test LLM endpoint (gitignored): `AGENTIC_UI_LLM_BASE_URL`, `AGENTIC_UI_LLM_KEY`, `AGENTIC_UI_LLM_MODELS`, `AGENTIC_UI_LLM_DEFAULT`       |
| `WORKFLOW/tmp/`, `WORKFLOW/cache/`, `WORKFLOW/home/` | temp files (incl. test temp dirs), caches, HOME during installs                                                                                        |

`<os>-<arch>` is `uname -s`/`uname -m` (`linux-aarch64`, `darwin-arm64`), so macOS and the Linux VM can share the folder.
The qwen source is cloned from the owner's read-only checkout `t3-ru-code/qwen-code` (tag `v0.21.1`, commit
`41b4ee8373`) or from upstream `QwenLM/qwen-code` when it is missing (`QWEN_CODE_SRC` overrides).
The ru-code fake agent (tier 2) is read in place from `t3-ru-code/ru-code` (read-only).

Models (SV-C15/SV-C17): the server has no model or provider in its code defaults; every LLM call goes through qwen to
the machine's test LLM endpoint named only by `WORKFLOW/llm.env` (generic `AGENTIC_UI_LLM_*` variables). A policy test
fails if any committed file names a model id, provider, provider URL or key.

## Tests

```sh
cd apps/agent-server
AGENTIC_UI_TEST_TIERS=1 "$WORKFLOW_PYTHON" -m unittest discover -s tests -t .        # unit only
AGENTIC_UI_TEST_TIERS=1,2,3 "$WORKFLOW_PYTHON" -m unittest discover -s tests -t .    # default set
AGENTIC_UI_TEST_TIERS=4 "$WORKFLOW_PYTHON" -m unittest tests.integration.test_real_qwen_llm -v  # opt-in, 3 LLM calls
```

| Tier | What                                                                                     | Prerequisite (override env)                                                                       |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1    | unit tests + scripted stdlib ACP agent (`tests/support/scripted_agent.py`); always run   | none                                                                                              |
| 2    | ru-code fake qwen (`fake-acp-server.ts`)                                                 | `t3-ru-code/ru-code/.../fake-acp-server.ts` (`AGENTIC_UI_TEST_FAKE_ACP`)                          |
| 3    | real qwen-code 0.21.1 + stdlib fake LLM (`tests/support/fake_llm.py`)                    | `$WORKFLOW_QWEN_CLI` (`AGENTIC_UI_TEST_QWEN_CLI`)                                                 |
| 4    | real qwen-code + the machine's test LLM endpoint, flags composed from `WORKFLOW/llm.env` | `WORKFLOW/llm.env` reachable + qwen home (`AGENTIC_UI_TEST_LLM_ENV`, `AGENTIC_UI_TEST_QWEN_HOME`) |

Tiers 2–4 skip with a reason when their tier is off or a prerequisite is missing; `pnpm test:server`
(`scripts/server-tests.sh`) sets `AGENTIC_UI_TEST_STRICT=1`, so there a missing tier-2/3 prerequisite fails the run
(`AGENTIC_UI_TEST_STRICT=0` skips it knowingly). Tests write only to temp dirs
under `WORKFLOW/tmp/tests` and pass the key to the qwen child env only. `AGENTIC_UI_TEST_LOG=1` shows package logs.
Line limit: `node scripts/check-size.ts` (repo root) checks every `.py` file against 250 lines.
Lint/format (DEC-047): ruff 0.17.3 is a dev tool in WORKFLOW (`scripts/setup-workflow.sh`, runtime stays stdlib);
rules in [`ruff.toml`](ruff.toml). `pnpm run lint:python` (part of `pnpm check`) must report 0 findings;
`.githooks/pre-commit` runs `ruff format` on staged `.py` files.

## Configuration

One source: `config.py` (SV-C4). Precedence: code defaults < TOML (`--config PATH` / `AGENTIC_UI_CONFIG`) <
env `AGENTIC_UI_*` < CLI flags (`--host`, `--port`, `--agent-bin`, `--agent-home`, `--log-level`, `--set KEY=VALUE`).

- [`agentic-ui-server.example.toml`](agentic-ui-server.example.toml): every setting with its default and env override
  (kept equal to the code defaults by `tests/unit/test_example_config.py`).
- [`config.dev.toml`](config.dev.toml): dev/test flags for stock qwen against an OpenAI-compatible endpoint
  (`--auth-type openai`); the base URL and model come from `WORKFLOW/llm.env` (composed into `--model` /
  `--openai-base-url` by `scripts/workflow-env.sh` via `AGENTIC_UI_AGENT_EXTRA_ARGS`). Code defaults carry no
  provider, model, auth method or mode (SV-C15); the production fork brings its own model. Optional `agent.model`
  sends a model name via ACP model selection.

Self-check against the real CLI (one session, one turn, JSON report: agentInfo, modes, model, stop reason, text,
usage, update kinds):

```sh
. scripts/workflow-env.sh
HOME="$WORKFLOW_QWEN_HOME" PYTHONPATH=apps/agent-server/src "$WORKFLOW_PYTHON" -m agentic_ui_server --check-agent \
  --config apps/agent-server/config.dev.toml --agent-bin "$WORKFLOW_QWEN_CLI"
```

`HOME="$WORKFLOW_QWEN_HOME"` makes qwen use the isolated home (its `.qwen/settings.json`) and keeps every qwen write
inside `WORKFLOW/`; chat cwds and cache files go to `$XDG_STATE_HOME` / `$XDG_CACHE_HOME` (also in `WORKFLOW/`).

## Bundled data (P3, CF-I3)

`src/agentic_ui_server/data/` is generated, never hand-edited: `catalog.json` and `system-prompt.md` exactly as the
catalog package builds them, `contract-version.json` (DEC-056, written by `scripts/server-data.mjs`), plus the A2UI
v0.9 `common_types.json` and `server_to_client.json` from `@a2ui/web_core` (offline `$ref` targets of the validator). `pnpm build` (or `pnpm run server:sync-data`) rewrites
them; commit the result. `pnpm run check:generated` fails while the committed copy differs from what the contract
generates now (`scripts/check-generated.mjs`).

## Extraction (P3)

`a2ui/json_reader.py`, `a2ui/lexer.py`, `a2ui/extract.py` port `@a2ui/agent` 0.0.2 `readJson`, `BlockLexer` (as
`DirectJsonParser` configures it) and `DirectJsonParser.compile` with Node's error texts. `extract(reply)` compiles
every `<a2ui-json>` block of a reply. `tests/agreement/test_parser_agreement.py` runs the Node referee
(`tests/agreement/parser-referee.mjs`) on the corpus (`parser_corpus.py`) and requires identical parts, messages
and error texts; root `pnpm run check:server-agreement` (part of `pnpm check`) runs every agreement suite.

## Validator (P4)

`validation.validate_payload(messages)` returns every problem of a payload at once (empty = valid), offline over
the bundled data (SV-C7): `schema.py` (JSON Schema 2020-12 subset incl. `unevaluatedProperties` tracking; unknown
keywords raise), `refs.py` (`$ref` resolution, catalog alias), `structure.py` (messages, versions, envelopes,
surfaces), `topology.py` (child references, root, dangling, cycles, reachability). Texts follow `@a2ui/agent`.
SV-C28: `validation.validate_step(messages, state)` merges a reply into a copy of a chat's `SurfaceState`
(`surfaces.py`: create/delete/update as the renderer applies them, `datamodel.py`: web_core's data-model write rules,
`bindings.py`: bound values and template lists) and returns the merged state when valid; the chat service keeps one
state per chat (committed only on `ok`, forgotten with the chat). `tests/agreement/test_validator_agreement.py`
requires Node's verdict on every example and every mutant (`tests/agreement/mutate.py`);
`tests/agreement/test_surface_agreement.py` replays chats on the renderer's own state (`surface-referee.mjs`) and
requires the same verdict and merged state per step (scenarios, the corpus as chats, follow-up fuzz);
`tests/agreement/test_validator_mutants.py` kills every single-rule mutant; the hand-over
[`validator-cases/`](validator-cases/README.md) (chats with per-step verdicts) stays fresh.

## Build: one file (P7)

```sh
pnpm run server:build          # repo root; also the last step of `pnpm build`
cd apps/agent-server           # the pyz lands in apps/agent-server/dist/; run it with Python 3.13
"$WORKFLOW_PYTHON" dist/agentic-ui-server.pyz --version        # agentic-ui-server 0.1.0 (<catalogId> sha256:<contract hash>)
"$WORKFLOW_PYTHON" dist/agentic-ui-server.pyz --print-config --config my.toml   # effective settings, secrets masked
"$WORKFLOW_PYTHON" dist/agentic-ui-server.pyz --check-agent --config my.toml    # one agent turn, JSON report
"$WORKFLOW_PYTHON" dist/agentic-ui-server.pyz --config my.toml                  # serve the HTTP API
```

`scripts/build_pyz.py` zips `src/agentic_ui_server` (code + generated `data/`: catalog.json, system-prompt.md,
contract-version.json, A2UI schemas; no caches) into `dist/agentic-ui-server.pyz` (`#!/usr/bin/env python3`, entry `agentic_ui_server.__main__:main`)
and smoke-runs `--version` from an empty dir. Nothing else is needed beside the file (SV-C2): data is read from inside
the zip, the system prompt is materialised into the cache dir. `bash scripts/server-build.sh --check` (part of
`check:generated`) fails when the built pyz differs from the tree (code or data synced without a rebuild).

## HTTP API (P6)

```sh
. scripts/workflow-env.sh   # repo root; composes the provider flags from WORKFLOW/llm.env
cd apps/agent-server
HOME="$WORKFLOW_QWEN_HOME" PYTHONPATH=src "$WORKFLOW_PYTHON" -m agentic_ui_server --config config.dev.toml \
  --agent-bin "$WORKFLOW_QWEN_CLI"                          # serve (default mode); agent.bin defaults to `qwen`
curl -s 127.0.0.1:8787/api/health                           # "status": "ok", "agentFound": true
curl -s 127.0.0.1:8787/api/prompt -H 'Content-Type: application/json' \
  -d '{"chatId":"c1","text":"Имя,Сумма\nАнна,1200\n\nПокажи таблицей с итогом."}'
curl -s '127.0.0.1:8787/api/progress?chatId=c1'            # optional, poll while /prompt waits
curl -s 127.0.0.1:8787/api/cancel -d '{"chatId":"c1"}'      # from a second request
```

| Endpoint              | Body / query                                        | 200 response                                                                                                             |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `POST {base}/prompt`  | `{chatId, text, requestId?, repairOf?}` (DEC-064)   | `{chatId, status: ok/fallback/cancelled, messages, text, fallback, errors, attempts, reason, durationMs, model, turnId}` |
| `POST {base}/action`  | `{chatId, surfaceId, event, dataModel, requestId?}` | same as `/prompt`                                                                                                        |
| `POST {base}/cancel`  | `{chatId}`                                          | `{chatId, cancelled}` (also cancels a request still waiting for an agent slot)                                           |
| `GET {base}/progress` | `?chatId=` (optional endpoint, SV-C20)              | `{chatId, state, attempt, maxAttempts, errors, errorCount, elapsedMs}`                                                   |
| `GET {base}/models`   | `?chatId=` (optional, SV-C25)                       | `{models: [{id, name, description}], default, current}`                                                                  |
| `POST {base}/model`   | `{chatId, model}` (optional, SV-C25)                | `{chatId, model}`, applied on the chat's next turn                                                                       |
| `GET {base}/health`   | –                                                   | `{status, version, agentFound, liveSessions, maxLiveAgents}` (503 when the CLI is missing)                               |

Every JSON answer, errors included, also carries `contractVersion` (DEC-056: `<catalogId> sha256:<12 hex>`, generated
into `data/contract-version.json`, = `handover/manifest.json` `contractVersion`). Errors: `{error, message}` with 400 / 404 / 405 / 413 /
429 / 503 (`shutting_down` also for a request the shutdown stopped: never a 200 `cancelled`); a 500 of
`/prompt`/`/action` carries the fallback outcome. A `/prompt` with the same text as the chat's still running one
joins it (one agent turn). `outcome.model` / `/models` `current` name the model the turn really ran. `{base}` = `server.base_path` (path or absolute URL), host/port `server.host`/`server.port`; CORS only for
`server.cors_origins`. Every request is logged once (method, path, status, outcome, chat, ms; never bodies).
The full contract with JSON examples is generated: `PYTHONPATH=src "$WORKFLOW_PYTHON" -m
agentic_ui_server.http.contract_doc --write` → [`SERVER-CONTRACT.md`](SERVER-CONTRACT.md) (a test fails while stale).

| Module                                              | Concern                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `http/contract.py`                                  | route table (paths, fields, status codes): drives dispatch and SERVER-CONTRACT.md      |
| `http/api.py`                                       | `(method, target, body)` → response over the chat service; field checks; error mapping |
| `http/bridge.py`                                    | the asyncio loop thread that owns all agent state; HTTP threads submit coroutines      |
| `http/server.py`                                    | `ThreadingHTTPServer`: body cap (413), CORS, one access-log line per request           |
| `http/contract_doc.py`, `http/contract_examples.py` | SERVER-CONTRACT.md renderer; examples produced by the real `Api`                       |
| `serve.py`                                          | serve mode: wires loop, manager, service, API, server; SIGTERM/SIGINT shutdown         |

Tier 4 over HTTP (a prompt and one follow-up action, at most 3 GLM calls: `repair.max_attempts` = 1):
`AGENTIC_UI_TEST_TIERS=4 "$WORKFLOW_PYTHON" -m unittest tests.integration.test_http_llm -v`.

## Conversation (P5)

| Module                     | Concern                                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversation/prompts.py`  | user turn (paste + instruction), action turn (event + context + data model as JSON), repair text, no-questions                                                                                  |
| `conversation/repair.py`   | first reply + up to `repair.max_attempts` repairs in the same session, all problems quoted; outcome                                                                                             |
| `conversation/fallback.py` | the Russian "sorry" surface (Icon warning, Heading, Text, Button "Повторить" → `agent.retry`), `fallback.json`                                                                                  |
| `conversation/progress.py` | live state per chat: attempt n of max, last errors, elapsed ms (SV-C20)                                                                                                                         |
| `conversation/service.py`  | `prompt` (a duplicate joins the running one), `action` (`agent.retry` re-sends the last prompt), `cancel` (queued too), `progress`, `models`, `set_model`; per-chat state dropped with the chat |

An outcome is `ok` (valid messages), `fallback` (attempts used up, question without UI, timeout, crash, agent error;
`fallback.json` + last errors) or `cancelled`. `fallback.json` is regenerated with
`PYTHONPATH=src "$WORKFLOW_PYTHON" -m agentic_ui_server.conversation.fallback --write` (a test fails while stale).
Tier 4 end to end: `AGENTIC_UI_TEST_TIERS=4 "$WORKFLOW_PYTHON" -m unittest tests.integration.test_service_llm -v`.

## ACP module (P2)

| Module                                   | Concern                                                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.py`, `settings.py`               | frozen settings, precedence, coercion, errors naming the key; only reader of `os.environ`                                                                                                                                                   |
| `log.py`                                 | leveled logging, configurable format, secret redaction on every package logger (SV-C16)                                                                                                                                                     |
| `resources.py`                           | bundled data via `importlib.resources`; prompt + qwen settings overlay written content-addressed to `cache_dir`                                                                                                                             |
| `acp/protocol.py`                        | ACP literals from real code (protocol 1, methods, stop reasons, update kinds, error codes)                                                                                                                                                  |
| `acp/jsonrpc.py`                         | ndjson JSON-RPC over asyncio streams: id matching, quirks (`"id": ""` notifications, non-JSON lines), every inbound request answered                                                                                                        |
| `acp/client.py`                          | initialize, authenticate, session/new\|load, set_mode (fallback set_config_option), model selection, prompt, cancel; `fs/*`, `terminal/*`, `craft/*` → -32601                                                                               |
| `acp/permissions.py`                     | auto-approve: allow_always else allow_once (SV-C10); questions rejected (SV-C14)                                                                                                                                                            |
| `agent/spawn.py`                         | argv/env/cwd like ru-code: JS entry rule, lean flags, env registry written last                                                                                                                                                             |
| `agent/process.py`                       | only spawner: own process group, live stderr to the log (`[chat pid=N]`), SIGTERM → SIGKILL                                                                                                                                                 |
| `agent/turn.py`                          | folds `session/update` frames into text, thoughts, tool calls, plan, usage, kinds                                                                                                                                                           |
| `agent/handshake.py`, `agent/session.py` | one chat = one process + one ACP session: start, turn timeout, cancel with kill backstop, crash → restart with `session/load`                                                                                                               |
| `agent/manager.py`                       | chat id → session: FIFO per chat, bounded queue, cancel without the lock, cap on live processes (LRU idle eviction) + idle reaper (forgets the chat, its work dir and its service state); one process per chat, no pool, no spares (SV-C19) |
| `selfcheck.py`, `__main__.py`            | `--check-agent` operator self-check                                                                                                                                                                                                         |

Lean spawn: `QWEN_SYSTEM_MD=<our prompt>`, `--core-tools none` + every non-core tool excluded by name, settings
overlay (`QWEN_CODE_SYSTEM_SETTINGS_PATH`: no computer-use, no follow-up suggestion call) → exactly one LLM request
per turn, `tools: []`. No ACP mode is ever set unless `agent.mode` is configured (no yolo, SV-C10).
