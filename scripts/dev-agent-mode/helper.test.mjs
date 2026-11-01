// DEC-057 unit tests of the `pnpm dev:agent-mode` helper: local config, Python detection, project env, and the
// supervisor (both children stopped, a dying child). Run: node --test scripts/dev-agent-mode/helper.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tomlKeysOf } from "../docs-refs/extract.mjs";
import { outsideWorkflow } from "../workflow-guard.mjs";
import { groupAlive, startChild, stopChild } from "./children.mjs";
import { ensureLocalConfig, LOCAL_CONFIG, parseArgs, serverAddress, TEMPLATE } from "./config.mjs";
import { projectEnv } from "./env.mjs";
import { FAKE, fakes, freePort, killAll, root, run, survivors, tmp } from "./fixtures/test-lib.mjs";
import { findPython } from "./python.mjs";

const tomlKeys = (text) => tomlKeysOf([{ lang: "toml", lines: text.split("\n") }]);

test("[DEC-057] the local config is created from the template once; later edits are kept; it is gitignored", () => {
  const path = join(tmp(), LOCAL_CONFIG);
  assert.deepEqual(ensureLocalConfig(path), { path, created: true });
  assert.equal(readFileSync(path, "utf8"), readFileSync(TEMPLATE, "utf8"));
  writeFileSync(path, '[agent]\nbin = "/opt/my-qwen"\n');
  assert.deepEqual(ensureLocalConfig(path), { path, created: false });
  assert.equal(readFileSync(path, "utf8"), '[agent]\nbin = "/opt/my-qwen"\n');
  const ignored = execFileSync("git", ["check-ignore", LOCAL_CONFIG], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(ignored.trim(), LOCAL_CONFIG);
});

test("[DEC-057] the template sets agent.bin and agent.env, and only keys the server knows", () => {
  const example = readFileSync(
    join(root, "apps/agent-server/agentic-ui-server.example.toml"),
    "utf8",
  );
  const known = new Set(tomlKeys(example));
  const keys = tomlKeys(readFileSync(TEMPLATE, "utf8"));
  assert.ok(keys.includes("agent.bin") && keys.includes("agent.env"), keys.join(", "));
  assert.deepEqual(
    keys.filter((key) => !known.has(key)),
    [],
  );
});

test("[DEC-057] options: --config, --web-port, --web-host (defaults: the root local config, 3458, 127.0.0.1); unknown ones fail", () => {
  assert.deepEqual(parseArgs([], "/repo", {}), {
    config: "/repo/agent-server.local.toml",
    webPort: 3458,
    webHost: "127.0.0.1",
    isDefault: true,
  });
  assert.deepEqual(parseArgs(["--config", "/x/a.toml", "--web-port=3470"], "/repo", {}), {
    config: "/x/a.toml",
    webPort: 3470,
    webHost: "127.0.0.1",
    isDefault: false,
  });
  // CP-04 (LIVE): --web-host 0.0.0.0 (and $AGENTIC_UI_WEB_HOST as the default) expose the page on the LAN.
  assert.equal(parseArgs(["--web-host", "0.0.0.0"], "/repo", {}).webHost, "0.0.0.0");
  assert.equal(parseArgs([], "/repo", { AGENTIC_UI_WEB_HOST: "0.0.0.0" }).webHost, "0.0.0.0");
  assert.equal(
    parseArgs(["--web-host=127.0.0.1"], "/repo", { AGENTIC_UI_WEB_HOST: "0.0.0.0" }).webHost,
    "127.0.0.1",
  );
  assert.throws(
    () => parseArgs(["--web-port", "80a"], "/repo", {}),
    /unknown option --web-port 80a/,
  );
  assert.throws(() => parseArgs(["--port", "1"], "/repo", {}), /unknown option --port/);
  assert.throws(() => parseArgs(["--config"], "/repo", {}), /--config needs a value/);
});

test("[DEC-057] the server address comes from the effective settings; the page needs base_path /api", () => {
  const at = (host, base_path) => serverAddress({ server: { host, port: 8787, base_path } });
  assert.deepEqual(at("127.0.0.1", "/api"), {
    origin: "http://127.0.0.1:8787",
    health: "http://127.0.0.1:8787/api/health",
    bind: { host: "127.0.0.1", port: 8787 },
  });
  assert.equal(at("0.0.0.0", "https://example.com/api/").origin, "http://127.0.0.1:8787");
  assert.equal(at("::", "/api").origin, "http://127.0.0.1:8787");
  assert.equal(at("::1", "/api").origin, "http://[::1]:8787");
  assert.throws(
    () => at("127.0.0.1", "/agent-api"),
    /base_path is "\/agent-api".*set base_path = "\/api"/,
  );
});

test("[DEC-057] Python: the first of $AGENTIC_UI_PYTHON, python3.13, python3 that is 3.13, else an error", () => {
  const dir = tmp();
  const fake = (name, version) => {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\necho python ${version}\n`);
    chmodSync(file, 0o755);
    return file;
  };
  const env = (extra) => ({ PATH: dir, ...extra });
  fake("python3", "3.12.3");
  assert.match(
    findPython(env()).error,
    /no Python 3\.13 found \(tried python3\.13: not found, python3: 3\.12\.3\).*AGENTIC_UI_PYTHON/,
  );
  fake("python3", "3.13.2");
  assert.deepEqual(findPython(env()), { python: "python3", version: "3.13.2" });
  fake("python3.13", "3.13.5");
  assert.deepEqual(findPython(env()), { python: "python3.13", version: "3.13.5" });
  const mine = fake("my-python", "3.13.9");
  assert.deepEqual(findPython(env({ AGENTIC_UI_PYTHON: mine })), {
    python: mine,
    version: "3.13.9",
  });
});

test("[DEC-057, SV-C18] the children's env is the project-local one from workflow-env.sh, from a bare env", () => {
  const env = projectEnv(root, { PATH: process.env.PATH, HOME: "/nonexistent-home" });
  assert.deepEqual(outsideWorkflow(env, root), []);
  assert.equal(env.HOME, "/nonexistent-home");
  assert.equal(env._, undefined); // bash's "last command" is not passed on
  // workflow-env.sh prepends WORKFLOW/tools/<os>-<arch>/bin unless PATH already has it (e.g. under pnpm run).
  assert.ok(
    env.PATH.split(":").some((dir) => /\/WORKFLOW\/tools\/[^/]+-[^/]+\/bin$/.test(dir)),
    env.PATH,
  );
});

test("[DEC-057] a stop request (Ctrl+C) stops both children and everything they started; exit 0", async () => {
  const { promise: stop, resolve: requestStop } = Promise.withResolvers();
  const { promise: isReady, resolve: onReady } = Promise.withResolvers();
  const { done, lines, pids } = run(await fakes(["serve"]), stop, { onReady });
  try {
    await isReady;
    assert.equal(pids().length, 6, lines.join("\n")); // 2 children, 2 workers, 2 detached grandchildren
    requestStop();
    assert.equal(await done, 0);
    assert.deepEqual(await survivors(pids()), [], lines.join("\n"));
    assert.ok(lines.includes("stopped"), lines.join("\n"));
  } finally {
    killAll(pids());
  }
});

test("[DEC-057] a server that dies stops the web; the helper exits with its code and prints its last lines", async () => {
  const { done, lines, pids } = run(await fakes(["die-after", "1500", "3"]), new Promise(() => {}));
  try {
    assert.equal(await done, 3);
    const text = lines.join("\n");
    assert.match(
      text,
      /the agent server exited \(code 3\); its last log lines:\n {2}worker \d+\n {2}grandchild \d+\n[^]*fake child: boom/,
    );
    assert.match(text, /web started/);
    assert.deepEqual(await survivors(pids()), [], text);
  } finally {
    killAll(pids());
  }
});

test("[DEC-057] a server that cannot start: its code, its output, the web is never started", async () => {
  const { done, lines, pids } = run(await fakes(["die-now", "4"]), new Promise(() => {}));
  try {
    assert.equal(await done, 4);
    assert.match(lines.join("\n"), /the agent server exited \(code 4\)[^]*cannot start/);
    assert.doesNotMatch(lines.join("\n"), /web started/);
  } finally {
    killAll(pids());
  }
});

test("[DEC-057] a child that ignores SIGTERM is killed after the grace time, with its whole group", async () => {
  const port = await freePort();
  const lines = [];
  const spec = { name: "stubborn", cmd: process.execPath, cwd: root, env: process.env };
  const child = startChild({ ...spec, args: [FAKE, String(port), "ignore-term"] }, (line) =>
    lines.push(line),
  );
  try {
    while (!lines.some((line) => line.includes("listening")))
      await new Promise((r) => setTimeout(r, 50));
    const started = Date.now();
    await stopChild(child, 400);
    assert.ok(Date.now() - started >= 400);
    assert.equal(groupAlive(child.pid), false);
    assert.equal((await child.exited).signal, "SIGKILL");
  } finally {
    killAll([child.pid]);
  }
});
