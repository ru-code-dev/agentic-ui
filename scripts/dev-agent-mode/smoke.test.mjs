// DEC-057 end to end, no LLM: `pnpm dev:agent-mode` and the manual two-terminal way against the in-repo scripted ACP
// agent (apps/playground/e2e/agent/fake-agent.mjs); /agent and the API through the dev proxy; clean stop, no orphan
// processes; a server that dies; the first run; README terminal 1 run literally from a bare env (A4-A01). Needs
// Python 3.13 (python3.13 on the project-local PATH). Every test kills what is left of its run in a `finally`.
// Run: . scripts/workflow-env.sh && node --test scripts/dev-agent-mode/smoke.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { groupAlive, startChild, stopChild } from "./children.mjs";
import { EDIT_MESSAGE, TEMPLATE } from "./config.mjs";
import { projectEnv } from "./env.mjs";
import {
  AGENT,
  cleanup,
  HELPER,
  job,
  pageWorks,
  processAlive,
  processesWith,
  root,
  scripted,
  tmp,
} from "./fixtures/test-lib.mjs";

const env = projectEnv(root);
const quiet = () => {};

/** Pids the helper and the server logged: the two children and every agent process the server spawned. */
const loggedPids = (output) =>
  [...output.matchAll(/started \(pid (\d+)\)|spawned pid=(\d+)/g)].map((m) => Number(m[1] ?? m[2]));

async function stopsClean(run, output) {
  const pids = loggedPids(output);
  assert.ok(pids.length >= 3, output);
  assert.match(output, /agent-mode: stopped/);
  for (const pid of pids)
    assert.equal(processAlive(pid) || groupAlive(pid), false, `pid ${pid} survived`);
  assert.deepEqual(processesWith(run.token), []);
  assert.deepEqual(processesWith(run.config), []);
}

/** Waits until `url` answers 200 (`tail()` for the error). */
async function until200(url, tail, ms = 120_000) {
  for (const end = Date.now() + ms; ; await delay(250)) {
    const answer = await fetch(url).catch(() => undefined);
    if (answer?.status === 200) return;
    if (Date.now() > end) throw new Error(`no ${url}:\n${tail().join("\n")}`);
  }
}

/**
 * README "Run locally" terminal 1, literally (only `--config agent-server.local.toml` → the run's config, so the
 * owner's own file is never touched), started from a bare env: PATH without WORKFLOW/ and a stand-in HOME.
 */
function readmeTerminal1(run, home) {
  const lines = readFileSync(join(root, "README.md"), "utf8").split("\n");
  const line = lines.filter((one) => /#\s*terminal 1\s*$/.test(one));
  assert.equal(line.length, 1, "one README line ends in `# terminal 1`");
  const command = line[0].replace(/\s*#\s*terminal 1\s*$/, "");
  assert.equal(command.split(" --config agent-server.local.toml").length, 2, command);
  const PATH = process.env.PATH.split(":")
    .filter((dir) => !dir.includes("/WORKFLOW/"))
    .join(":");
  return startChild(
    {
      name: "terminal 1",
      cmd: "bash",
      args: [
        "-c",
        command.replace(" --config agent-server.local.toml", ` --config '${run.config}'`),
      ],
      cwd: root,
      env: { PATH, HOME: home },
    },
    quiet,
  );
}

/** A config like the first run's (template), agent.bin = the scripted agent, no work_root/cache_dir (A4-A01). */
async function templateRun() {
  const run = await scripted({ dirs: false });
  const toml = readFileSync(TEMPLATE, "utf8")
    .replace(/^port = 8787/m, `port = ${run.server}`)
    .replace(/^bin = "qwen".*$/m, `bin = ${JSON.stringify(AGENT)}\nacp_flag = ""\nbase_args = []`)
    .replace(/^extra_args = \[\]/m, `extra_args = [${JSON.stringify(run.token)}]`);
  writeFileSync(run.config, toml);
  const home = join(run.dir, "home");
  mkdirSync(home);
  return { run, home };
}

test("[DEC-057] pnpm dev:agent-mode: server + web, /agent and the API through the proxy, Ctrl+C stops both, no orphans", async () => {
  const run = await scripted();
  const args = ["dev:agent-mode", "--config", run.config, "--web-port", String(run.web)];
  const helper = job("pnpm", args, { env });
  try {
    await helper.waitFor(new RegExp(`page http://127\\.0\\.0\\.1:${run.web}/agent`));
    assert.match(
      helper.output(),
      new RegExp(`agent server is up: http://127\\.0\\.0\\.1:${run.server}/api/health`),
    );
    await pageWorks(`http://127.0.0.1:${run.web}`);
    process.kill(-helper.child.pid, "SIGINT"); // what a terminal's Ctrl+C does: SIGINT to the foreground group
    assert.equal(await helper.exited, 0, helper.output());
    await stopsClean(run, helper.output());
  } finally {
    cleanup(run, helper);
  }
});

test("[DEC-057, SV-C18] from a bare env (nothing sourced, no setup): it runs and writes nothing to HOME", async () => {
  const run = await scripted({ dirs: false }); // chat dirs and the cache come from the env (XDG_* in WORKFLOW/)
  const home = join(run.dir, "home");
  mkdirSync(home);
  const bare = { PATH: process.env.PATH, HOME: home };
  const args = [HELPER, "--config", run.config, "--web-port", String(run.web)];
  const helper = job(process.execPath, args, { env: bare });
  try {
    await helper.waitFor(/\(Ctrl\+C stops both\)/);
    await pageWorks(`http://127.0.0.1:${run.web}`);
    process.kill(-helper.child.pid, "SIGTERM");
    assert.equal(await helper.exited, 0, helper.output());
    await stopsClean(run, helper.output());
    assert.deepEqual(readdirSync(home, { recursive: true }), []);
  } finally {
    cleanup(run, helper);
  }
});

test("[A4-A01] README terminal 1, run literally from a bare env: the server works and writes 0 files under HOME", async () => {
  const { run, home } = await templateRun();
  const server = readmeTerminal1(run, home);
  try {
    await until200(`http://127.0.0.1:${run.server}/api/health`, server.tail);
    await pageWorks(`http://127.0.0.1:${run.server}`, { page: false }); // a chat dir + the prompt cache
    await stopChild(server, 8000);
    assert.deepEqual(readdirSync(home, { recursive: true }), [], `${home} must stay empty`);
  } finally {
    await stopChild(server, 1000);
    cleanup(run);
  }
});

test("[DEC-057] the manual way: python3.13 -m agentic_ui_server --config <file> + pnpm dev (web only) through its proxy", async () => {
  const { run, home } = await templateRun();
  const server = readmeTerminal1(run, home); // terminal 1 = the README line (A4-A01), no work_root/cache_dir
  const web = startChild(
    {
      name: "web",
      cmd: "pnpm",
      args: ["dev", "--port", String(run.web)],
      cwd: root,
      env: { ...env, AGENT_SERVER_URL: `http://127.0.0.1:${run.server}` },
    },
    quiet,
  );
  try {
    // `pnpm dev` binds `localhost` (vite's default); fetch resolves it the way the browser of the owner does.
    const origin = `http://localhost:${run.web}`;
    await until200(`${origin}/api/health`, () => [...server.tail(), ...web.tail()]);
    await pageWorks(origin);
  } finally {
    await Promise.all([stopChild(server, 8000), stopChild(web)]);
    cleanup(run);
  }
  assert.deepEqual(processesWith(run.token), []);
  assert.deepEqual(processesWith(run.config), []);
  assert.deepEqual(readdirSync(home, { recursive: true }), []);
});

test("[DEC-057] a server that cannot start ends the helper with its exit code and last log lines; no web", async () => {
  const run = await scripted();
  // A Python that is 3.13 and loads the config, but whose server run fails at once (a port race, a crash, …).
  const python = execFileSync("bash", ["-c", "command -v python3.13"], { env, encoding: "utf8" });
  const wrapper = join(run.dir, "python");
  const serve = 'echo "boom: the server cannot start" >&2; exit 3';
  const body = `case " $* " in *" -c "*|*--print-config*) exec ${python.trim()} "$@" ;; esac\n${serve}`;
  writeFileSync(wrapper, `#!/bin/sh\n${body}\n`);
  chmodSync(wrapper, 0o755);
  try {
    const helper = spawnSync(
      process.execPath,
      [HELPER, "--config", run.config, "--web-port", String(run.web)],
      { cwd: root, env: { ...env, AGENTIC_UI_PYTHON: wrapper }, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(helper.status, 3, helper.stdout + helper.stderr);
    assert.match(
      helper.stdout,
      /the agent server exited \(code 3\); its last log lines:\nagent-mode: {3}boom: the server cannot start/,
    );
    assert.doesNotMatch(helper.stdout, /web started|agent server is up/);
  } finally {
    cleanup(run);
  }
});

test("[DEC-057] first run: the local config is created from the template, the helper says what to edit and exits", () => {
  const fakeRoot = tmp("agent-mode-first"); // the default path of a stand-in root: the owner's file stays as is
  const main = `import(${JSON.stringify(HELPER)}).then(async (m) => (process.exitCode = await m.main([], ${JSON.stringify(fakeRoot)})))`;
  const helper = spawnSync(process.execPath, ["-e", main], { cwd: root, env, encoding: "utf8" });
  assert.equal(helper.status, 0, helper.stderr);
  assert.ok(helper.stdout.includes(EDIT_MESSAGE), helper.stdout);
  const config = join(fakeRoot, "agent-server.local.toml");
  assert.equal(readFileSync(config, "utf8"), readFileSync(TEMPLATE, "utf8"));
  const loads = spawnSync(
    "python3.13",
    ["-m", "agentic_ui_server", "--print-config", "--config", config],
    { cwd: root, env: { ...env, PYTHONPATH: "apps/agent-server/src" }, encoding: "utf8" },
  );
  assert.equal(loads.status, 0, loads.stderr);
  assert.equal(JSON.parse(loads.stdout).agent.bin, "qwen");
});
