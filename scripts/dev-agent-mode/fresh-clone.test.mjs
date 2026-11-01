// A4F end to end of README "Run locally" steps 1-3 on a fresh clone (review A4-A02): `git clone` of the committed
// HEAD, `pnpm install --frozen-lockfile` (offline, from the project's store), the config edited (scripted agent),
// `pnpm dev:agent-mode`, no `pnpm build`: /agent and a chat turn work through the proxy, Ctrl+C stops both, the
// clone still has no packages/ui-kit-one-catalog/dist. Needs Python 3.13 (python3.13 on the project-local PATH).
// Run: . scripts/workflow-env.sh && node --test scripts/dev-agent-mode/fresh-clone.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { projectEnv } from "./env.mjs";
import { cleanup, job, leftOf, pageWorks, root, scripted, tmp } from "./fixtures/test-lib.mjs";

const env = projectEnv(root);
const DIST = join("packages", "ui-kit-one-catalog", "dist");

/** The pnpm store this checkout was installed from (like scripts/clean-clone.sh: the clone installs offline). */
function storeDir() {
  const modules = readFileSync(join(root, "node_modules", ".modules.yaml"), "utf8");
  return dirname(/^storeDir: (.+)$/m.exec(modules)[1].trim()); // ends in the store version (v10)
}

/** A fresh clone of HEAD with its dependencies installed and nothing built: its path. */
function freshClone() {
  const clone = join(tmp("agent-mode-fresh"), "clone");
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", root, clone], { env });
  const offline = ["--frozen-lockfile", "--offline", "--config.confirmModulesPurge=false"];
  const install = ["install", ...offline, "--store-dir", storeDir()];
  execFileSync("pnpm", install, { cwd: clone, env: { ...env, CI: "true" }, stdio: "ignore" });
  return clone;
}

test("[A4-A02] a fresh clone, install, config, pnpm dev:agent-mode, no pnpm build: /agent and a chat turn work", async () => {
  const clone = freshClone();
  const run = await scripted();
  assert.equal(existsSync(join(clone, DIST)), false, "a fresh clone has no built catalog");
  const args = ["dev:agent-mode", "--config", run.config, "--web-port", String(run.web)];
  const helper = job("pnpm", args, { cwd: clone, env });
  try {
    await helper.waitFor(/\(Ctrl\+C stops both\)/);
    await pageWorks(`http://127.0.0.1:${run.web}`);
    process.kill(-helper.child.pid, "SIGINT");
    assert.equal(await helper.exited, 0, helper.output());
    assert.deepEqual(await leftOf(run), [], helper.output());
    assert.equal(existsSync(join(clone, DIST)), false, "the helper builds nothing");
  } finally {
    cleanup(run, helper);
    rmSync(clone, { recursive: true, force: true });
  }
});
