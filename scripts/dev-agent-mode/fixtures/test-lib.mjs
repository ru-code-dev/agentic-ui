// DEC-057 shared helpers of the dev:agent-mode suites: free ports, temp dirs under WORKFLOW/tmp, fake children for
// `supervise`, scripted-agent configs and helper jobs for the smoke tests, and the orphan scan + cleanup that every
// test runs in a `finally` (A4-A04: a failing test leaves no process behind).
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { groupAlive } from "../children.mjs";
import { supervise } from "../supervise.mjs";

export const root = fileURLToPath(new URL("../../..", import.meta.url));
export const HELPER = join(root, "scripts", "dev-agent-mode.mjs");
export const FAKE = fileURLToPath(new URL("fake-child.mjs", import.meta.url));
export const AGENT = join(root, "apps", "playground", "e2e", "agent", "fake-agent.mjs");
const tmpBase = join(root, "WORKFLOW", "tmp");
mkdirSync(tmpBase, { recursive: true });
export const tmp = (name = "agent-mode-unit") => mkdtempSync(join(tmpBase, `${name}-`));

/** An executable shell script `name` in `dir` with `body`; its path. */
export function script(dir, name, body) {
  const file = join(dir, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}

/** The helper run to its end (for cases that fail before it spawns anything). */
export const helperRun = (args, env = process.env) =>
  spawnSync(process.execPath, [HELPER, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });

export const freePort = () =>
  new Promise((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

export const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

/** Waits up to `ms` until none of `pids` (processes or groups) is alive; the pids still alive. */
export async function survivors(pids, ms = 3000) {
  const left = () => pids.filter((pid) => processAlive(pid) || groupAlive(pid));
  for (const end = Date.now() + ms; left().length && Date.now() < end; ) await delay(50);
  return left();
}

/** A fake child spec for `supervise` on `port`; `mode` = the fake's mode args. */
export const fakeSpec = (name, port, mode) => ({
  name,
  cmd: process.execPath,
  args: [FAKE, String(port), ...mode],
  cwd: root,
  env: process.env,
  ready: `http://127.0.0.1:${port}/`,
});

/** Two fake children for `supervise`. */
export async function fakes(serverMode, webMode = ["serve"]) {
  const [serverPort, webPort] = [await freePort(), await freePort()];
  return {
    server: fakeSpec("agent server", serverPort, serverMode),
    web: fakeSpec("web", webPort, webMode),
  };
}

/** Pids in log lines: children (`(pid N)`), their workers and grandchildren. */
export const pidsIn = (lines) =>
  lines.flatMap((line) =>
    [...line.matchAll(/\(pid (\d+)\)|(?:grandchild|worker) (\d+)/g)].map((m) =>
      Number(m[1] ?? m[2]),
    ),
  );

/** Runs `supervise` and records every line; `pids()` = every pid it and the fakes logged. */
export function run(children, stop, { onReady = () => {}, ...more } = {}) {
  const lines = [];
  const log = (line) => lines.push(line);
  const done = supervise({ ...children, stop, log, onReady, startTimeoutMs: 20_000, ...more });
  return { done, lines, pids: () => pidsIn(lines) };
}

/** SIGKILL to every pid and its group (test cleanup). */
export function killAll(pids) {
  for (const pid of pids)
    for (const target of [-pid, pid])
      try {
        process.kill(target, "SIGKILL");
      } catch {
        // gone already
      }
}

/** A run dir with a server config on the scripted agent; `token` marks every agent process (orphan scan). */
export async function scripted({ dirs = true, extra = [] } = {}) {
  const dir = tmp("agent-mode-smoke");
  const token = `--agent-mode-smoke-${dir.split("-").pop()}`;
  const [server, web] = [await freePort(), await freePort()];
  const config = join(dir, "server.toml");
  const toml = [
    "[server]",
    `port = ${server}`,
    "[agent]",
    `bin = ${JSON.stringify(AGENT)}`,
    'acp_flag = ""',
    "base_args = []",
    `extra_args = [${JSON.stringify(token)}]`,
    ...(dirs
      ? [
          `work_root = ${JSON.stringify(join(dir, "chats"))}`,
          `cache_dir = ${JSON.stringify(join(dir, "cache"))}`,
        ]
      : []),
    ...extra,
  ];
  writeFileSync(config, `${toml.join("\n")}\n`);
  return { dir, token, config, server, web };
}

/** Starts a command in its own process group (like a terminal job); `waitFor(re)` waits for an output line. */
export function job(cmd, args, options) {
  const child = spawn(cmd, args, { cwd: root, detached: true, ...options });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (data) => (output += data));
  const exited = new Promise((resolve) =>
    child.once("close", (code, signal) => resolve(code ?? signal)),
  );
  const waitFor = async (re, ms = 120_000) => {
    for (const end = Date.now() + ms; !re.test(output); await delay(100))
      if (Date.now() > end) throw new Error(`no ${re} in:\n${output}`);
  };
  return { child, exited, waitFor, output: () => output };
}

/** Whether `line` names `marker` not followed by a digit (`--port 4000` is not `--port 40001`). */
const names = (line, marker) =>
  line
    .split(marker)
    .slice(1)
    .some((after) => !/^\d/.test(after));

/** Every process whose command line names one of `markers`. */
export function processesWith(...markers) {
  return execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" })
    .split("\n")
    .filter((line) => markers.some((marker) => names(line, marker)) && !line.includes("ps -eo"));
}

/** The markers of every process of a smoke run: agents (token), the server (config), vite (web port). */
export const runMarkers = (run) => [run.token, run.config, `--port ${run.web}`];

/** Waits up to `ms` until no process of `run` is left; the lines still there. */
export async function leftOf(run, ms = 12_000) {
  for (const end = Date.now() + ms; processesWith(...runMarkers(run)).length && Date.now() < end; )
    await delay(200);
  return processesWith(...runMarkers(run));
}

/** Test cleanup: SIGKILL to the job's group and every process of the run. */
export function cleanup(run, ...jobs) {
  killAll(jobs.map((one) => one.child.pid).filter(Boolean));
  const pids = processesWith(...runMarkers(run)).map((line) => Number(line.trim().split(/\s+/)[0]));
  killAll(pids);
}

/** /agent, /api/health and one /api/prompt turn through the page origin's dev proxy (or the server itself). */
export async function pageWorks(origin, { page = true } = {}) {
  if (page) {
    const answer = await fetch(`${origin}/agent`);
    assert.equal(answer.status, 200);
    assert.match(await answer.text(), /<div id="root"><\/div>/);
  }
  const health = await (await fetch(`${origin}/api/health`)).json();
  assert.equal(health.status, "ok");
  assert.equal(health.agentFound, true);
  const turn = await fetch(`${origin}/api/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: "smoke", text: "Покажи форму заявки" }),
  });
  const outcome = await turn.json();
  assert.equal(outcome.status, "ok", JSON.stringify(outcome));
  assert.ok(
    outcome.messages.some((message) => message.createSurface),
    JSON.stringify(outcome),
  );
}
