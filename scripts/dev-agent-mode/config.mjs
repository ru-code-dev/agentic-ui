/**
 * DEC-057: the helper's local server config. `agent-server.local.toml` at the repo root (gitignored) is created
 * from the committed template on the first run and never overwritten; any other `--config` path must exist
 * (A4-A07: a typo is an error, not a new file). The server's own `--print-config` gives the effective address
 * (host, port, base path), so the helper never parses TOML itself.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_CONFIG = "agent-server.local.toml";
export const TEMPLATE = fileURLToPath(new URL("agent-server.local.template.toml", import.meta.url));
export const DEFAULT_WEB_PORT = 3458;
export const DEFAULT_WEB_HOST = "127.0.0.1";
export const USAGE = [
  "usage: pnpm dev:agent-mode [--config PATH] [--web-port N] [--web-host HOST]",
  `  --config PATH   agent server config (default: ${LOCAL_CONFIG} at the repo root, created from the template)`,
  `  --web-port N    the playground's port (default ${DEFAULT_WEB_PORT}); the page is http://127.0.0.1:N/agent`,
  `  --web-host HOST the playground's bind host (default ${DEFAULT_WEB_HOST}); 0.0.0.0 reaches it from the LAN`,
  "                  (the agent server always stays on 127.0.0.1; the page proxies /api to it)",
  "  Python: $AGENTIC_UI_PYTHON when set (must be 3.13), else python3.13 or python3 (3.13)",
].join("\n");

/** What to do after the first run, naming the config file `shown` (A4-A07). */
export const editMessage = (shown = LOCAL_CONFIG) =>
  `edit ${shown}: set agent.bin (your qwen) and agent.env, then restart`;
export const EDIT_MESSAGE = editMessage();

/**
 * Creates `path` from the template when it is missing and `create` (the default path only): `{ path, created }`;
 * an existing file is kept. A missing path that may not be created, or a copy that fails, throws a one-line error.
 */
export function ensureLocalConfig(path, { create = true, template = TEMPLATE } = {}) {
  if (existsSync(path)) return { path, created: false };
  if (!create)
    throw new Error(
      `config ${path} not found (only the default ${LOCAL_CONFIG} is created from the template)`,
    );
  try {
    copyFileSync(template, path);
  } catch (error) {
    throw new Error(`cannot create ${path}: ${error.code ?? error.message}`, { cause: error });
  }
  return { path, created: true };
}

/**
 * `--config PATH` (default: `<root>/agent-server.local.toml`, `isDefault`), `--web-port N` (default 3458) and
 * `--web-host HOST` (default 127.0.0.1, or `$AGENTIC_UI_WEB_HOST`; 0.0.0.0 exposes the page on the LAN, CP-04);
 * `--help` / `-h` → `{ help: true }`.
 */
export function parseArgs(argv, root, env = process.env) {
  const config = join(root, LOCAL_CONFIG);
  const options = {
    config,
    webPort: DEFAULT_WEB_PORT,
    webHost: env.AGENTIC_UI_WEB_HOST || DEFAULT_WEB_HOST,
    isDefault: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--help" || argv[i] === "-h") return { ...options, help: true };
    const [name, inline] = argv[i].split(/=(.*)/s);
    const value = inline ?? argv[(i += 1)];
    if (value === undefined) throw new Error(`${name} needs a value`);
    if (name === "--config") options.config = resolve(value);
    else if (name === "--web-port" && /^\d+$/.test(value)) options.webPort = Number(value);
    else if (name === "--web-host" && value) options.webHost = value;
    else
      throw new Error(
        `unknown option ${name} ${value} (use --config PATH, --web-port N, --web-host HOST, --help)`,
      );
  }
  options.isDefault = options.config === config;
  return options;
}

/**
 * The server address from `--print-config` JSON: `{ origin, health, bind }` for the proxy target, the readiness
 * probe and the free-port check (`bind` = the configured `{ host, port }`). A wildcard bind host is probed on
 * 127.0.0.1. The page calls `/api` (same-origin, proxied), so another base path cannot work and is an error.
 */
export function serverAddress(effective) {
  const { host, port, base_path: basePath } = effective.server;
  const path = /^https?:\/\//.test(basePath) ? new URL(basePath).pathname : basePath;
  if (path.replace(/\/+$/, "") !== "/api")
    throw new Error(
      `server.base_path is "${basePath}"; the page calls /api: set base_path = "/api"`,
    );
  const probe = ["0.0.0.0", "::", ""].includes(host) ? "127.0.0.1" : host;
  const origin = `http://${probe.includes(":") ? `[${probe}]` : probe}:${port}`;
  return { origin, health: `${origin}/api/health`, bind: { host, port } };
}

/** Whether `{ status, body }` is the agent server's /health (JSON with `contractVersion`, A4-A03): 200 or 503. */
export function isAgentHealth({ body }) {
  try {
    return typeof JSON.parse(body)?.contractVersion === "string";
  } catch {
    return false;
  }
}
