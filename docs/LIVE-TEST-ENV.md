# Live test environment

A machine that runs the agent server + playground against a local, OpenAI-compatible LLM endpoint, so the
`/agent` chat and the Integration pages can be exercised with a real model. The repo stays provider-neutral: the
machine's real endpoint, models and key live only in the gitignored `WORKFLOW/llm.env` (never committed). This
file is the generic how-to; the machine's own facts (its IP, the model names, the proxy) are in the gitignored
`WORKFLOW/live/README.md` on that machine.

## 1. One-time setup

1. `. scripts/workflow-env.sh && pnpm install --frozen-lockfile`
2. `bash scripts/setup-workflow.sh` — builds Python 3.13, qwen-code and the isolated qwen home into `WORKFLOW/`.
3. Create the gitignored `WORKFLOW/llm.env` (chmod 600) with the machine's endpoint:

   ```sh
   AGENTIC_UI_LLM_BASE_URL=http://<host>:<port>/v1   # the local OpenAI-compatible endpoint
   AGENTIC_UI_LLM_KEY=<key>                          # its API key / proxy password
   AGENTIC_UI_LLM_MODELS=<model-1>,<model-2>,<model-3>
   AGENTIC_UI_LLM_DEFAULT=<model-1>
   ```

   Re-run `bash scripts/setup-workflow.sh` so the qwen home's `settings.json` is rebuilt from it (one provider
   entry per model, the default model, the key in its env block).

4. The gitignored `agent-server.local.toml` at the repo root is created from the template on the first
   `pnpm dev:agent-mode`; point `agent.bin` at this machine's qwen and keep the key in `agent.env`
   (the file is gitignored). On a qwen fork with a built-in model you need no `WORKFLOW/llm.env` and no key.

## 2. Start / stop / status / logs

```sh
pnpm dev:agent-mode                 # server (127.0.0.1:8787) + playground (127.0.0.1:3458); Ctrl+C stops both
pnpm dev:agent-mode --web-host 0.0.0.0   # also expose the page on the LAN (the agent server stays on 127.0.0.1)
pnpm dev:agent-mode --web-port 4000      # a different page port
```

- **Page:** `http://127.0.0.1:3458/agent` (and `http://127.0.0.1:3458/integration/*`). With `--web-host 0.0.0.0`
  the page is also at `http://<machine-ip>:3458/agent` from other devices on the LAN; the agent server is never
  exposed — the page proxies `/api` to it.
- **Health:** `curl -s http://127.0.0.1:3458/api/health` → `status: ok`, `agentFound: true`, a `contractVersion`.
- **Models:** `curl -s 'http://127.0.0.1:3458/api/models?chatId=probe'` → every model the qwen session advertises.
- **Stop:** Ctrl+C in the foreground run. A detached run (`setsid nohup … &` with a PID file under `WORKFLOW/live/`)
  is stopped with `kill -TERM -<pid>` (the process group). Logs: whatever file the launch redirected to
  (e.g. `WORKFLOW/live/live.log`).
- **Restart:** stop, then `pnpm dev:agent-mode` again.

## 3. Switching models in the chat

The `/agent` page has a **Модель** dropdown listing every model the qwen session advertises (from the qwen home's
provider settings, or a production fork's built-in list). Pick one; the choice applies to that chat's next turn.
Each turn's result names the model it ran on.

## 4. If the LLM endpoint is down

`/api/health` still answers (the server is up), but a prompt returns an `agent_unavailable` error (the qwen child
cannot authenticate or reach the endpoint). Check the endpoint is running and that `WORKFLOW/llm.env` has the right
base URL and key, then restart. Real-LLM tests (`pnpm e2e` tier 4, the opt-in server tiers) skip cleanly when
`WORKFLOW/llm.env` is absent or the endpoint does not answer.

## 5. Updating after new commits

The repo folder is shared / pulled as usual (`git pull`); `WORKFLOW/` is gitignored and stays. After pulling,
restart `pnpm dev:agent-mode`. If `pnpm-lock.yaml` changed, run `pnpm install --frozen-lockfile` first; if the
contract changed, nothing extra is needed for dev (the page reads the workspace sources).

## 6. Frontend tests

```sh
pnpm e2e        # Playwright against the production build + the real agent server (scripted agent, no LLM)
pnpm check      # the full gate
```

Tier-4 (real LLM) e2e, opt-in, needs `WORKFLOW/llm.env`:
`cd apps/playground && npx playwright test -c playwright.real.config.ts`.
