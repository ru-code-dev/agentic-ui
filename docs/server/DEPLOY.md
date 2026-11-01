# DEPLOY — agent server + playground on one machine

Everything the owner needs to run the agent server (`agentic-ui-server.pyz`, Python 3.13, stdlib only) next to the
static playground build. Every repo path, command, CLI flag and config key named here is checked by
`scripts/docs-refs.test.mjs` (a renamed flag or key fails `pnpm check`). Server-side paths (`/opt/...`, `/etc/...`,
`/var/...`) are examples; pick your own.

| Piece | Built by (dev machine) | On the server |
| --- | --- | --- |
| agent server | `pnpm build` → `apps/agent-server/dist/agentic-ui-server.pyz` | one file + one TOML config + a systemd unit |
| playground | `pnpm build` (root) or `pnpm build:subpath` (subfolder) → `apps/playground/dist/` | static files behind nginx |
| hand-over bundle | `pnpm build` → `handover/` (committed) | not needed by our server (it is for a production backend) |

Dev machine (builds everything, once): Node 24, pnpm 10, a `python3.13` on PATH (or `bash scripts/setup-workflow.sh`,
which installs one into `WORKFLOW/`), then `. scripts/workflow-env.sh && pnpm install --frozen-lockfile` in the repo
root. Without a Python 3.13, `pnpm build` stops at `scripts/server-generate.sh` ("no Python 3.13").

## 1. Install Python 3.13 (once)

The pyz needs only a Python 3.13 interpreter, no pip packages, no venv.

```sh
# Debian 13 / Ubuntu 25.04+: the distribution package
sudo apt install python3.13
# Ubuntu 24.04: the deadsnakes PPA
sudo add-apt-repository ppa:deadsnakes/ppa && sudo apt update && sudo apt install python3.13
python3.13 --version            # Python 3.13.x
```

The custom Qwen CLI needs Node.js (24.x like the dev machine) when its entry is a `.js` file (`agent.node`).

## 2. Copy the pyz

```sh
# once, on the server: service user, its state + cache dirs (section 4 runs before systemd creates them), install dirs
ssh server 'sudo useradd --system --home /var/lib/agentic-ui agentic-ui'
ssh server 'sudo install -d -o agentic-ui -g agentic-ui /var/lib/agentic-ui /var/cache/agentic-ui'
ssh server 'sudo install -d -o "$(id -un)" /opt/agentic-ui && sudo install -d /etc/agentic-ui'
. scripts/workflow-env.sh && pnpm build              # dev machine, repo root (pnpm build refuses to run without the env, SV-C18)
scp apps/agent-server/dist/agentic-ui-server.pyz server:/opt/agentic-ui/agentic-ui-server.pyz.new
ssh server 'python3.13 /opt/agentic-ui/agentic-ui-server.pyz.new --version'
# agentic-ui-server 0.1.0 (urn:agentic-ui:catalog:ui-kit-one:v1 sha256:<12 hex>) = contractVersion in handover/manifest.json
ssh server 'mv /opt/agentic-ui/agentic-ui-server.pyz.new /opt/agentic-ui/agentic-ui-server.pyz'
```

Nothing else is copied: the contract, the system prompt and the A2UI schemas are inside the pyz. The service user
`agentic-ui` owns `/var/lib/agentic-ui` (chat cwds, the fork's home) and `/var/cache/agentic-ui` (materialised prompt);
an unwritable `agent.cache_dir` stops `--check-agent` with `PermissionError`.

## 3. Config for the custom Qwen fork (`/etc/agentic-ui/server.toml`)

Precedence: code defaults < this TOML (`--config`) < env `AGENTIC_UI_*` < CLI flags. Every key with its default:
`apps/agent-server/agentic-ui-server.example.toml`. Unknown keys are errors. No provider, model, auth method or
mode is set by default (SV-C15): the fork brings its own provider and model. Do not copy the provider flags of
`apps/agent-server/config.dev.toml` (they exist for stock qwen against a local test LLM endpoint in tests only).

```toml
[server]
host = "127.0.0.1"
port = 8787
base_path = "/api"          # same value as AGENT_API_BASE in apps/playground/src/agent/endpoint.ts

[agent]
bin = "/opt/custom-qwen/bin/cli.js"     # the fork's CLI; .js runs with agent.node
node = "/usr/bin/node"
acp_flag = "--acp"                      # "--experimental-acp" for old builds
extra_args = []                         # fork-specific flags only (no provider flags needed)
home = "/var/lib/agentic-ui/qwen-home"  # the fork's profile dir (written to every agent.env_names.home name)
env = { QWEN_SANDBOX = "false", QWEN_CODE_SUPPRESS_YOLO_WARNING = "1" }
model = ""                              # optional: a model name of the fork's own list; "" = the fork's default
work_root = "/var/lib/agentic-ui/chats" # one empty cwd per chat
cache_dir = "/var/cache/agentic-ui"     # the materialised system prompt + settings overlay

[agent.env_names]                       # only if the fork renamed the QWEN_* variables
home = ["QWEN_HOME"]
system_prompt = ["QWEN_SYSTEM_MD"]

[limits]
max_live_agents = 4                     # one CLI process per chat (~180 MB each), LRU + idle reaper

[log]
level = "INFO"
```

`agent.bin` may be a symlink (e.g. a `current` link to the active release): the server spawns its real path,
because qwen-code started through a symlinked entry exits without output.

Secrets of the fork (API keys) go into an env file read by systemd (`EnvironmentFile`), never into the TOML;
`agent.inherit_env = true` (default) passes them to the CLI. Values of env vars named `*_KEY`, `*_TOKEN`, `*_SECRET`
or `*PASSWORD*` are redacted from the moment the settings load; a key variable with another name goes into
`agent.env_names.secrets = ["FORK_LICENSE"]`. Verify the effective settings (secrets masked):

```sh
python3.13 /opt/agentic-ui/agentic-ui-server.pyz --print-config --config /etc/agentic-ui/server.toml
```

## 4. Smoke against the fork (before the first start, after every fork upgrade)

The fork binary was not available during development; this is the one check left for the owner (P2-I2).

```sh
sudo -u agentic-ui python3.13 /opt/agentic-ui/agentic-ui-server.pyz --check-agent --config /etc/agentic-ui/server.toml
# JSON report: "ok": true, agentInfo, authMethods, modes, model (the fork's current model), "stopReason": "end_turn", "text": "OK"
sudo -u agentic-ui python3.13 /opt/agentic-ui/agentic-ui-server.pyz --check-agent --config /etc/agentic-ui/server.toml --text 'Reply with exactly: OK'
```

Then one HTTP turn on the running service (section 5): it must return `"status": "ok"` with `messages`:

```sh
curl -s http://127.0.0.1:8787/api/prompt -H 'Content-Type: application/json' \
  -d '{"chatId":"smoke-1","text":"Имя,Сумма\nАнна,1200\n\nПокажи таблицей с итогом."}'
```

If `ok` is false: `--log-level DEBUG --set log.acp_wire=true` shows every ACP frame (redacted); differing flags or
env names go into `agent.acp_flag`, `agent.extra_args`, `agent.env_names`.

## 5. systemd unit (`/etc/systemd/system/agentic-ui.service`)

```ini
[Unit]
Description=agentic-ui agent server
After=network.target

[Service]
User=agentic-ui
ExecStart=/usr/bin/python3.13 /opt/agentic-ui/agentic-ui-server.pyz --config /etc/agentic-ui/server.toml
EnvironmentFile=-/etc/agentic-ui/agent.env
Environment=XDG_STATE_HOME=/var/lib/agentic-ui/state XDG_CACHE_HOME=/var/cache/agentic-ui
StateDirectory=agentic-ui
CacheDirectory=agentic-ui
Restart=on-failure
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

`sudo systemctl daemon-reload && sudo systemctl enable --now agentic-ui`. SIGTERM closes the HTTP server and every
agent process (own process groups); `KillMode=mixed` lets the server do that before systemd kills leftovers.

## 6. nginx (owner's routing)

The playground calls `{AGENT_API_BASE}/prompt`, ... on its own origin. A `/prompt` turn waits for the whole agent
turn incl. repairs (`timeouts.request_s` = 600 s by default), so the proxy timeout must be longer: keep
`proxy_read_timeout` ≥ `timeouts.request_s` + a margin (660 s below). With a shorter one the client gets a 504 while
the server keeps working; its retry of the same prompt then joins the still running request instead of starting a
second agent turn (`SERVER-CONTRACT.md` "Duplicate retry"), and a deploy restart answers 503 `shutting_down`.

```nginx
# root deploy: playground at /, API at /api/
location /api/ {
    proxy_pass http://127.0.0.1:8787;      # no URI part: the full /api/... path reaches the server
    proxy_read_timeout 660s;
    proxy_send_timeout 660s;
    client_max_body_size 1m;               # = server.max_body_bytes
}
location / {
    root /var/www/agentic-ui;
    try_files $uri $uri/ /index.html;
}
```

Subfolder deploy (`some-server.com/agentic-ui/`): first set `AGENT_API_BASE = "/agentic-ui/api"` in
`apps/playground/src/agent/endpoint.ts` (compiled into the page) and `base_path = "/agentic-ui/api"` in the TOML (or
keep both at `/api` and route `/api/` as above), then build with `pnpm build:subpath` (`PLAYGROUND_BASE=/agentic-ui/`):

```nginx
location /agentic-ui/api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_read_timeout 660s;
    proxy_send_timeout 660s;
    client_max_body_size 1m;
}
location /agentic-ui/ {
    alias /var/www/agentic-ui/;
    try_files $uri $uri/ /agentic-ui/index.html;
}
```

Copy the static build: `rsync -a --delete apps/playground/dist/ server:/var/www/agentic-ui/` (`dist-subpath` is
the e2e copy of the subfolder build; deploy what `pnpm build:subpath` wrote to `apps/playground/dist/`).
An API on another origin (`https://someserver.com/agent-api`) needs `server.cors_origins` to list the playground's
origin.

Images (A5-08): the agent UI renders model output. An `Avatar` `src` is any URL a reply carries (also composed from
pasted data with `formatString`), and the browser loads it on render with no click. The page that shows agent UI
(the playground here, the host page in production) MUST send a Content-Security-Policy that limits images to its
own hosts. List the image hosts the agent may show; the host owns CSP as it owns auth:

```nginx
location / {
    add_header Content-Security-Policy "img-src 'self' data: https://images.example.com" always;
    # ... root / try_files as above
}
```

## 7. Health check

```sh
curl -s http://127.0.0.1:8787/api/health
# {"status": "ok", "version": "...", "agentFound": true, "liveSessions": 0, "maxLiveAgents": 4, "contractVersion": "urn:agentic-ui:catalog:ui-kit-one:v1 sha256:<12 hex>"}
```

HTTP 503 with `"status": "degraded"` when `agent.bin` is not found. Use it for monitoring and after every restart.

## 8. Logs

Everything goes to stderr → journald: `journalctl -u agentic-ui -f`. Startup (config, secrets masked), every agent
spawn (argv + env keys only), the agent's own stderr live with a `[chat pid=N]` prefix, turns (stop reason,
duration), repairs, fallbacks, timeouts, cancels, crashes and restarts, one line per HTTP request (never bodies).
Level and format: `[log] level` / `format` or `AGENTIC_UI_LOG_LEVEL`; `--log-level DEBUG` for one run;
`log.acp_wire = true` logs every ACP frame (truncated, redacted). Secrets are redacted from every record.

## 9. Upgrade

1. `. scripts/workflow-env.sh && pnpm build` on the dev machine (the contract, prompt and data are regenerated into the pyz).
2. Copy as `agentic-ui-server.pyz.new`, check `--version`, keep the old file as `agentic-ui-server.pyz.prev`, `mv` the
   new one in place, `sudo systemctl restart agentic-ui`, then the health check and one `/prompt` (section 4).
3. Deploy the playground build of the same commit: the page embeds the contract version at build time and shows a
   version-mismatch placeholder instead of rendering when the server's `contractVersion` differs (DEC-056).
4. Rollback: move `agentic-ui-server.pyz.prev` back and restart.
5. A production backend that replaces our server takes `handover/` instead: when `version` in
   `handover/manifest.json` changes, it replaces all files (no changelog).
