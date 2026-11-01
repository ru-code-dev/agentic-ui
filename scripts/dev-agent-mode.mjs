/**
 * DEC-057 `pnpm dev:agent-mode`: the agent server and the playground dev server together, in one terminal.
 * Server config: `agent-server.local.toml` at the repo root (gitignored; created from
 * scripts/dev-agent-mode/agent-server.local.template.toml on the first run, then the helper exits so you can edit
 * it); another `--config` path must exist. Python: $AGENTIC_UI_PYTHON when set (must be 3.13), else the first of
 * python3.13, python3 that is 3.13. Both children run in the project-local env of scripts/workflow-env.sh
 * (SV-C18), read by the helper itself: nothing to source, no setup-workflow.sh. Both ports must be free before
 * anything starts. Ctrl+C (also Ctrl+\, a closed terminal, SIGTERM) stops both; a child that dies stops the other,
 * with its exit code and last lines; a helper that dies takes them along (guard.mjs).
 * Usage: node scripts/dev-agent-mode.mjs [--config PATH] [--web-port N] [--help]
 */
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  editMessage,
  ensureLocalConfig,
  isAgentHealth,
  parseArgs,
  serverAddress,
  USAGE,
} from "./dev-agent-mode/config.mjs";
import { projectEnv } from "./dev-agent-mode/env.mjs";
import { guardChildren } from "./dev-agent-mode/guard.mjs";
import { portsInUse } from "./dev-agent-mode/ports.mjs";
import { findPython } from "./dev-agent-mode/python.mjs";
import { supervise } from "./dev-agent-mode/supervise.mjs";

/** The signals that are a stop request: Ctrl+C, SIGTERM, a closed terminal, Ctrl+\ (A4b-D1). */
export const STOP_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];

const log = (line) => console.log(`agent-mode: ${line}`);
const fail = (line, code = 1) => {
  console.error(`agent-mode: ${line}`);
  return code;
};

/** The effective server settings (`--print-config`): parsed JSON, or a one-line error with the exit code. */
function effectiveConfig(python, config, env, root) {
  const run = spawnSync(python, ["-m", "agentic_ui_server", "--print-config", "--config", config], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  if (run.status !== 0) return { error: (run.stderr || run.stdout).trim(), code: run.status ?? 1 };
  try {
    return { settings: JSON.parse(run.stdout) };
  } catch {
    const said = run.stdout.trim().split("\n")[0].slice(0, 80);
    return {
      error: `${python} --print-config printed no JSON ("${said}"): is it Python 3.13?`,
      code: 1,
    };
  }
}

/**
 * The web child: `vp dev` of the playground on `host`:`port` (default 127.0.0.1, DEV-D3). CP-04 (LIVE): pass
 * `--web-host 0.0.0.0` (or set it in the config) to reach the page from the LAN; the readiness probe stays on
 * 127.0.0.1 since a wildcard bind answers there too. The agent server always stays on 127.0.0.1 (the page proxies
 * `/api` to it), so only the web port is exposed.
 */
export const webSpec = (root, port, env, origin, host = "127.0.0.1") => ({
  name: "web",
  cmd: join(root, "apps", "playground", "node_modules", ".bin", "vp"),
  args: ["dev", "--host", host, "--port", String(port), "--strictPort"],
  cwd: join(root, "apps", "playground"),
  env: { ...env, AGENT_SERVER_URL: origin },
  ready: `http://127.0.0.1:${port}/`,
});

/** The helper; resolves with its exit code. */
export async function main(argv, root) {
  let options;
  try {
    options = parseArgs(argv, root);
  } catch (error) {
    return fail(error.message, 2);
  }
  if (options.help) return (console.log(USAGE), 0);
  const shown = relative(root, options.config) || options.config;
  try {
    if (ensureLocalConfig(options.config, { create: options.isDefault }).created) {
      log(`created ${shown} from the template`);
      log(editMessage(shown));
      return 0;
    }
  } catch (error) {
    return fail(error.message, 2);
  }
  const env = { ...projectEnv(root), PYTHONPATH: join(root, "apps", "agent-server", "src") };
  const found = findPython(env);
  if (found.error) return fail(found.error);
  const effective = effectiveConfig(found.python, options.config, env, root);
  if (effective.error) return fail(`${shown}: ${effective.error}`, effective.code);
  let address;
  try {
    address = serverAddress(effective.settings);
  } catch (error) {
    return fail(`${shown}: ${error.message}`, 2);
  }
  const taken = await portsInUse([
    { ...address.bind, what: `server.port of ${shown}; an earlier run still going?` },
    { port: options.webPort, host: options.webHost, what: "--web-port" },
  ]);
  if (taken) return fail(taken);
  log(`Python ${found.version} (${found.python}), config ${shown}`);

  const web = webSpec(root, options.webPort, env, address.origin, options.webHost);
  // `on`, not `once`: a second Ctrl+C while stopping must not kill the helper before its children.
  const stop = new Promise((resolve) => {
    for (const signal of STOP_SIGNALS) process.on(signal, resolve);
  });
  const unguard = guardChildren();
  const code = await supervise({
    server: {
      name: "agent server",
      cmd: found.python,
      args: ["-m", "agentic_ui_server", "--config", options.config],
      cwd: root,
      env,
      ready: address.health,
      accept: isAgentHealth,
    },
    web,
    stop,
    log,
    write: (line) => console.log(line),
    onServerReady: ({ status, body }) => {
      if (status === 200) return log(`agent server is up: ${address.health}`);
      log(`agent server is up but not ready (HTTP ${status}): ${body.slice(0, 200)}`);
      log(editMessage(shown));
    },
    onReady: () => {
      log(`agent server ${address.origin}/api   page ${web.ready}agent   (Ctrl+C stops both)`);
      if (["0.0.0.0", "::", ""].includes(options.webHost))
        log(`page also on the LAN: http://<this-machine-ip>:${options.webPort}/agent`);
    },
  });
  unguard();
  return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = await main(
    process.argv.slice(2),
    fileURLToPath(new URL("..", import.meta.url)),
  );
