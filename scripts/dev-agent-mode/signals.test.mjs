// A4F end to end of how a `pnpm dev:agent-mode` run ends or is refused (review A4-A03, A4-A04, A4-A08, A4b-D1),
// with the scripted ACP agent and one live chat agent: a closed terminal and Ctrl+\ in a real pty, a second Ctrl+C,
// a SIGKILL of the helper, ports already in use, a second run, a server whose agent CLI is missing (503).
// Every test kills what is left of its run in a `finally`. Needs Python 3.13 (python3.13 on the project-local PATH).
// Run: . scripts/workflow-env.sh && node --test scripts/dev-agent-mode/signals.test.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { projectEnv } from "./env.mjs";
import { cleanup, HELPER, job, leftOf, pageWorks, root, scripted } from "./fixtures/test-lib.mjs";

const env = projectEnv(root);
const PTY = join(root, "scripts", "dev-agent-mode", "fixtures", "pty-run.py");
const READY = /\(Ctrl\+C stops both\)/;
const helperArgs = (run) => [HELPER, "--config", run.config, "--web-port", String(run.web)];

/** One chat turn through the page proxy: a live agent process the stop must end too. */
async function chatTurn(run) {
  const turn = await fetch(`http://127.0.0.1:${run.web}/api/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: "signals", text: "Покажи форму заявки" }),
  });
  assert.equal((await turn.json()).status, "ok");
}

/** `pnpm dev:agent-mode` in a terminal (pty) until ready, one chat turn, then `action`; the driver's output. */
async function inTerminal(run, action) {
  const command = `cd '${root}' && pnpm dev:agent-mode --config '${run.config}' --web-port ${run.web}`;
  const driver = spawn("python3.13", ["-I", PTY, action, READY.source, command], { env });
  let output = "";
  driver.stdout.on("data", (data) => (output += data));
  driver.stderr.on("data", (data) => (output += data));
  const exited = once(driver, "close");
  try {
    for (const end = Date.now() + 120_000; !/^READY$/m.test(output); await delay(100))
      if (Date.now() > end || driver.exitCode !== null) throw new Error(`not ready:\n${output}`);
    await chatTurn(run);
    driver.stdin.end("go\n");
    await exited;
    return output;
  } finally {
    driver.kill("SIGKILL");
  }
}

test("[A4-A04] closing the terminal (SIGHUP to the foreground job) leaves 0 processes of the run", async () => {
  const run = await scripted();
  try {
    const output = await inTerminal(run, "close");
    assert.deepEqual(await leftOf(run), [], output);
  } finally {
    cleanup(run);
  }
});

test("[A4b-D1] Ctrl+Backslash in the terminal (SIGQUIT to the foreground job) stops both: 0 processes left", async () => {
  const run = await scripted();
  try {
    const output = await inTerminal(run, "quit");
    assert.match(output, /agent-mode: stopping the agent server and the web dev server/);
    assert.deepEqual(await leftOf(run), [], output);
  } finally {
    cleanup(run);
  }
});

test("[A4-A04] a second Ctrl+C while stopping does not cut the stop short: exit 0, 0 processes left", async () => {
  const run = await scripted();
  const helper = job(process.execPath, helperArgs(run), { env });
  try {
    await helper.waitFor(READY);
    await chatTurn(run);
    let secondWhileStopping;
    helper.child.stdout.on("data", () => {
      if (secondWhileStopping !== undefined || !/agent-mode: stopping/.test(helper.output()))
        return;
      secondWhileStopping = !/agent-mode: stopped/.test(helper.output());
      try {
        process.kill(-helper.child.pid, "SIGINT"); // at once, while the children are being stopped
      } catch {
        secondWhileStopping = false; // the helper was gone already: the test proves nothing then
      }
    });
    process.kill(-helper.child.pid, "SIGINT");
    assert.equal(await helper.exited, 0, helper.output());
    assert.equal(secondWhileStopping, true, helper.output());
    assert.deepEqual(await leftOf(run, 2000), [], helper.output());
  } finally {
    cleanup(run, helper);
  }
});

test("[A4-A08] a helper killed with SIGKILL takes the server, vite and the live agent along: 0 processes left", async () => {
  const run = await scripted();
  const helper = job(process.execPath, helperArgs(run), { env });
  try {
    await helper.waitFor(READY);
    await chatTurn(run);
    process.kill(helper.child.pid, "SIGKILL"); // the helper only, like `kill -9 <pid>`
    assert.equal(await helper.exited, "SIGKILL");
    // within the server's own agent grace (2 s), well under the watch's 8 s SIGKILL grace: its SIGTERM did it
    assert.deepEqual(await leftOf(run, 5000), []);
  } finally {
    cleanup(run, helper);
  }
});

/** An HTTP server on `port` that answers like a health endpoint (but is not the agent server). */
async function foreign(port) {
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}');
  }).listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}

/** The helper run to its end. */
const helperSync = (run) =>
  spawnSync(process.execPath, helperArgs(run), {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });

/** The helper with `which` port held by another HTTP server: refused before anything starts. */
async function refusedWhenTaken(which) {
  const run = await scripted();
  const port = which === "server" ? run.server : run.web;
  const other = await foreign(port);
  try {
    const helper = helperSync(run);
    assert.equal(helper.status, 1, helper.stdout + helper.stderr);
    const what = which === "server" ? "server\\.port of \\S+server\\.toml" : "--web-port";
    assert.match(helper.stderr, new RegExp(`^agent-mode: port ${port} in use \\(${what}`));
    assert.doesNotMatch(helper.stdout, /started \(pid|is up|Ctrl\+C stops both|edit /);
  } finally {
    other.close();
    cleanup(run);
  }
}

test('[A4-A03] the server port held by another program: "port N in use", nothing started, no success line', () =>
  refusedWhenTaken("server"));

test('[A4-A03, A4-A04] the web port held by another program: "port N in use", nothing started, no success line', () =>
  refusedWhenTaken("web"));

test("[A4-A03] a second run with the same config is refused; the first keeps serving", async () => {
  const run = await scripted();
  const first = job(process.execPath, helperArgs(run), { env });
  try {
    await first.waitFor(READY);
    const second = helperSync(run);
    assert.equal(second.status, 1);
    assert.match(second.stderr, new RegExp(`port ${run.server} in use`));
    assert.doesNotMatch(second.stdout, /is up|Ctrl\+C stops both/);
    await pageWorks(`http://127.0.0.1:${run.web}`);
    process.kill(-first.child.pid, "SIGINT");
    assert.equal(await first.exited, 0, first.output());
  } finally {
    cleanup(run, first);
  }
});

test("[A4-A04] an agent CLI that is not found: /health 503 → 'up but not ready' and what to edit, in that config", async () => {
  const run = await scripted();
  const toml = readFileSync(run.config, "utf8").replace(/^bin = .*$/m, 'bin = "/nonexistent/qwen"');
  writeFileSync(run.config, toml);
  const helper = job(process.execPath, helperArgs(run), { env });
  try {
    await helper.waitFor(READY);
    const out = helper.output();
    assert.match(out, /agent-mode: agent server is up but not ready \(HTTP 503\): \{/);
    assert.match(
      out,
      /agent-mode: edit \S+server\.toml: set agent\.bin \(your qwen\) and agent\.env/,
    );
    assert.doesNotMatch(out, /agent server is up: /);
    process.kill(-helper.child.pid, "SIGINT");
    assert.equal(await helper.exited, 0, out);
  } finally {
    cleanup(run, helper);
  }
});
