// P10-clean-clone: scripts/clean-clone.sh starts from committed files only, reuses only the documented caches and
// never copies secrets. The full run (setup, install, pnpm check) is the P10 run dump clean-clone.log.
// Run: node --test scripts/clean-clone.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

test("[P10-clean-clone] the clone holds exactly the committed HEAD, links only the documented caches, no secrets", () => {
  mkdirSync(join(root, "WORKFLOW/tmp"), { recursive: true });
  const parent = mkdtempSync(join(root, "WORKFLOW/tmp/clean-clone-test-"));
  const dest = join(parent, "clone");
  try {
    const result = spawnSync("bash", [join(root, "scripts/clean-clone.sh")], {
      encoding: "utf8",
      env: { ...process.env, CLEAN_CLONE_DEST: dest, CLEAN_CLONE_ONLY: "clone" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(dest, "rev-parse", "HEAD"), git(root, "rev-parse", "HEAD"));
    assert.equal(git(dest, "status", "--porcelain"), "");
    for (const absent of [
      "node_modules",
      "packages/ui-kit-one-catalog/dist",
      "apps/agent-server/dist",
      "WORKFLOW/secrets",
      "WORKFLOW/qwen-home",
    ])
      assert.ok(!existsSync(join(dest, absent)), `${absent} must not be in a clean clone`);
    const platform = `${process.platform === "darwin" ? "darwin" : "linux"}-${execFileSync("uname", ["-m"], { encoding: "utf8" }).trim()}`;
    const tools = join(dest, "WORKFLOW/tools", platform);
    assert.ok(lstatSync(tools).isSymbolicLink());
    assert.equal(readlinkSync(tools), join(root, "WORKFLOW/tools", platform));
    assert.match(result.stdout, /reusing .*pnpm store and corepack cache/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
