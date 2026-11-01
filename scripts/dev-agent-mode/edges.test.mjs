// A4F unit tests of the `pnpm dev:agent-mode` helper's edges (review A4-A03..A4-A08, A4b-D1): AGENTIC_UI_PYTHON,
// CLI misconfig, ports in use and foreign answers, exit codes of a timeout / a signal death / an outside stop,
// stop signals, and the guards for a helper that dies. Run: node --test scripts/dev-agent-mode/edges.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ensureLocalConfig, isAgentHealth, LOCAL_CONFIG, parseArgs, TEMPLATE } from "./config.mjs";
import { STOP_SIGNALS, webSpec } from "../dev-agent-mode.mjs";
import {
  fakes,
  freePort,
  HELPER,
  helperRun as helper,
  job,
  killAll,
  pidsIn,
  root,
  run,
  script,
  survivors,
  tmp,
} from "./fixtures/test-lib.mjs";
import { portsInUse } from "./ports.mjs";
import { findPython } from "./python.mjs";

const GUARDED = join(root, "scripts", "dev-agent-mode", "fixtures", "guarded.mjs");
const never = new Promise(() => {});

const oneLine = (text) => text.trim().split("\n").length === 1 && !/^\s+at /m.test(text);

test("[A4-A05] AGENTIC_UI_PYTHON is the only candidate: 3.12, missing, a directory or not Python fails with one line", () => {
  const dir = tmp();
  script(dir, "python3.13", "echo python 3.13.5"); // a good one on PATH must not be taken instead
  const env = (chosen) => ({ PATH: dir, AGENTIC_UI_PYTHON: chosen });
  const old = script(dir, "old-python", "echo python 3.12.3");
  assert.deepEqual(findPython(env(old)), {
    error: `AGENTIC_UI_PYTHON=${old} is Python 3.12.3, need 3.13`,
  });
  assert.equal(
    findPython(env("/opt/none/python3.13")).error,
    "AGENTIC_UI_PYTHON=/opt/none/python3.13 is not found, need 3.13",
  );
  mkdirSync(join(dir, "pydir"));
  assert.equal(
    findPython(env(join(dir, "pydir"))).error,
    `AGENTIC_UI_PYTHON=${join(dir, "pydir")} is a directory, need 3.13`,
  );
  const liar = script(dir, "liar", "echo 3.13.0");
  assert.match(
    findPython(env(liar)).error,
    /^AGENTIC_UI_PYTHON=\S+ is not Python \(exit 0, printed "3\.13\.0"\), need 3\.13$/,
  );
  const mine = script(dir, "mine", "echo python 3.13.9");
  assert.deepEqual(findPython(env(mine)), { python: mine, version: "3.13.9" });
  const run3 = helper(["--config", TEMPLATE], { ...process.env, AGENTIC_UI_PYTHON: old });
  assert.equal(run3.status, 1);
  assert.equal(run3.stderr, `agent-mode: AGENTIC_UI_PYTHON=${old} is Python 3.12.3, need 3.13\n`);
});

test("[A4-A07] --help prints the usage and exits 0; a typo --config is an error naming it, nothing is created", () => {
  const help = helper(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^usage: pnpm dev:agent-mode \[--config PATH\] \[--web-port N\]/);
  assert.equal(parseArgs(["-h"], "/repo").help, true);
  const dir = tmp();
  const typo = join(dir, "agent-server.lcoal.toml");
  const run1 = helper(["--config", typo]);
  assert.equal(run1.status, 2);
  assert.ok(oneLine(run1.stderr), run1.stderr);
  assert.match(run1.stderr, /config \S+agent-server\.lcoal\.toml not found/);
  assert.equal(existsSync(typo), false);
  const deep = helper(["--config", join(dir, "nope", "x.toml")]);
  assert.equal(deep.status, 2);
  assert.ok(oneLine(deep.stderr), deep.stderr);
  assert.match(deep.stderr, /config \S+nope\/x\.toml not found/);
  assert.throws(
    () => ensureLocalConfig(join(dir, "nope", LOCAL_CONFIG)),
    /^Error: cannot create \S+: ENOENT$/,
  );
});

test("[A4-A07] the first run creates only the default config and names the file it created", () => {
  const fakeRoot = tmp();
  const code = `import(${JSON.stringify(HELPER)}).then(async (m) => (process.exitCode = await m.main([], ${JSON.stringify(fakeRoot)})))`;
  const first = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(
    first.stdout,
    `agent-mode: created ${LOCAL_CONFIG} from the template\nagent-mode: edit ${LOCAL_CONFIG}: set agent.bin (your qwen) and agent.env, then restart\n`,
  );
  assert.equal(readFileSync(join(fakeRoot, LOCAL_CONFIG), "utf8"), readFileSync(TEMPLATE, "utf8"));
});

test("[A4-A07] an AGENTIC_UI_PYTHON whose --print-config is not JSON, or a bad TOML: one line, the server's code", () => {
  const dir = tmp();
  const config = join(dir, "c.toml");
  writeFileSync(config, "[server]\nport = 1\n");
  const fake = script(
    dir,
    "py",
    'case "$1" in -c) echo python 3.13.1 ;; *) echo "3.13.0 ok" ;; esac',
  );
  const garbage = helper(["--config", config], { ...process.env, AGENTIC_UI_PYTHON: fake });
  assert.equal(garbage.status, 1);
  assert.ok(oneLine(garbage.stderr), garbage.stderr);
  assert.match(garbage.stderr, /--print-config printed no JSON \("3\.13\.0 ok"\)/);
  writeFileSync(config, "[server\nport = 1\n");
  const bad = helper(["--config", config]);
  assert.equal(bad.status, 2, bad.stderr); // the server's own code for a config error
  assert.ok(oneLine(bad.stderr), bad.stderr);
  assert.match(bad.stderr, /config error: .*Expected '\]'/);
});

test("[A4-A03] a port in use is named before anything starts; only the agent server's /health JSON counts", async () => {
  const taken = createServer().listen(0, "127.0.0.1");
  await new Promise((resolve) => taken.once("listening", resolve));
  const { port } = taken.address();
  try {
    const free = await freePort();
    assert.equal(await portsInUse([{ port: free, host: "127.0.0.1", what: "x" }]), undefined);
    assert.equal(
      await portsInUse([
        { port: free, host: "127.0.0.1", what: "a" },
        { port, host: "0.0.0.0", what: "--web-port" },
      ]),
      `port ${port} in use (--web-port)`,
    );
  } finally {
    taken.close();
  }
  assert.equal(
    isAgentHealth({ status: 503, body: '{"status":"degraded","contractVersion":"c sha256:1"}' }),
    true,
  );
  assert.equal(isAgentHealth({ status: 200, body: '{"status":"ok"}' }), false);
  assert.equal(isAgentHealth({ status: 200, body: "ok" }), false);
});

test("[A4-A03] an answer that is not the server's own: no 'is up', no web, exit 1", async () => {
  const children = await fakes(["serve", "not the agent server"]);
  const server = { ...children.server, accept: isAgentHealth };
  let announced = false;
  const onServerReady = () => (announced = true);
  // A stop after 10 s: a helper that took the answer for its server would run on until then, and exit 0.
  const { done, lines, pids } = run({ ...children, server }, delay(10_000), { onServerReady });
  try {
    assert.equal(await done, 1);
    assert.equal(announced, false);
    assert.match(
      lines.join("\n"),
      /answered HTTP 200, but not as the agent server: "not the agent server"; stopping/,
    );
    assert.doesNotMatch(lines.join("\n"), /web started/);
  } finally {
    killAll(pids());
  }
});

test("[A4-A04] a server that never answers: the start timeout ends the helper with 1, all stopped", async () => {
  const { done, lines, pids } = run(await fakes(["silent"]), never, { startTimeoutMs: 1000 });
  try {
    assert.equal(await done, 1);
    assert.match(lines.join("\n"), /did not answer within 1 s; stopping[^]*stopped/);
    assert.deepEqual(await survivors(pids()), []);
  } finally {
    killAll(pids());
  }
});

/** Starts both fakes until ready, then `kill(serverPid)`; `{ code, text }` of the run. */
async function killServerWhenReady(serverMode, signal) {
  const { promise: isReady, resolve: onReady } = Promise.withResolvers();
  const { done, lines, pids } = run(await fakes(serverMode), never, { onReady });
  try {
    await isReady;
    process.kill(pidsIn(lines)[0], signal);
    const code = await done;
    assert.deepEqual(await survivors(pids()), []);
    return { code, text: lines.join("\n") };
  } finally {
    killAll(pids());
  }
}

test("[A4-A04] a child killed by a signal ends the helper with 1, not 0", async () => {
  const { code, text } = await killServerWhenReady(["serve"], "SIGKILL");
  assert.equal(code, 1);
  assert.match(text, /the agent server exited \(signal SIGKILL\)/);
});

test("[A4-A06] a server stopped from outside (SIGTERM, exit code 0) ends the helper with 1, not 0", async () => {
  const { code, text } = await killServerWhenReady(["exit0-on-term"], "SIGTERM");
  assert.equal(code, 1);
  assert.match(text, /the agent server exited \(code 0\)/);
});

test("[A4-A04] the web child binds its host on exactly --web-port (--strictPort: a taken port fails, no other port)", () => {
  const spec = webSpec("/repo", 4321, { A: "1" }, "http://127.0.0.1:9");
  assert.deepEqual(spec.args, ["dev", "--host", "127.0.0.1", "--port", "4321", "--strictPort"]);
  assert.equal(spec.ready, "http://127.0.0.1:4321/");
  assert.deepEqual(spec.env, { A: "1", AGENT_SERVER_URL: "http://127.0.0.1:9" });
  // CP-04 (LIVE): --web-host 0.0.0.0 exposes the page on the LAN; the readiness probe stays on 127.0.0.1.
  const lan = webSpec("/repo", 4321, { A: "1" }, "http://127.0.0.1:9", "0.0.0.0");
  assert.deepEqual(lan.args, ["dev", "--host", "0.0.0.0", "--port", "4321", "--strictPort"]);
  assert.equal(lan.ready, "http://127.0.0.1:4321/");
});

test("[A4b-D1] Ctrl+Backslash (SIGQUIT) is a stop request like Ctrl+C, SIGTERM and a closed terminal", () => {
  assert.deepEqual(STOP_SIGNALS, ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]);
});

/** The guarded stand-in helper in `mode`, until its child listens: `{ stand, pids }`. */
async function guarded(mode) {
  const stand = job(process.execPath, [GUARDED, String(await freePort()), mode], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await stand.waitFor(/^ready$/m, 20_000);
  return { stand, pids: pidsIn(stand.output().split("\n")) };
}

test("[A4b-D1] an uncaught error in the helper: the exit handler kills every child group at once", async () => {
  const { stand, pids } = await guarded("throw");
  try {
    assert.equal(await stand.exited, 1);
    assert.equal(pids.length, 3, stand.output()); // the child, its worker, its detached grandchild
    assert.deepEqual(await survivors(pids, 3000), [], stand.output());
  } finally {
    killAll([...pids, stand.child.pid]);
  }
});

test("[A4-A08] a helper killed with SIGKILL: the orphan watch stops its children and everything they started", async () => {
  const { stand, pids } = await guarded("wait");
  try {
    process.kill(stand.child.pid, "SIGKILL");
    assert.equal(await stand.exited, "SIGKILL");
    // well under the watch's 8 s SIGKILL grace: its SIGTERM ends them at once
    assert.deepEqual(await survivors(pids, 4000), [], stand.output());
  } finally {
    killAll([...pids, stand.child.pid]);
  }
});
