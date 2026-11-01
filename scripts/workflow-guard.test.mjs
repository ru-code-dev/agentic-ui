// SV-C18: build/test/serve scripts refuse to run outside the WORKFLOW dev shell. Run: node --test scripts/workflow-guard.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GUARDED, outsideWorkflow } from "./workflow-guard.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const inside = Object.fromEntries(
  GUARDED.map((name) => [name, join(root, "WORKFLOW", name.toLowerCase())]),
);

test("[SV-C18] the guard names every variable that is unset or points outside WORKFLOW/", () => {
  assert.deepEqual(outsideWorkflow(inside, root), []);
  assert.deepEqual(
    outsideWorkflow({ ...inside, XDG_CACHE_HOME: "/home/x/.cache", VP_HOME: undefined }, root),
    ["XDG_CACHE_HOME", "VP_HOME"],
  );
  assert.deepEqual(outsideWorkflow({ ...inside, TMPDIR: join(root, "WORKFLOW-evil") }, root), [
    "TMPDIR",
  ]);
});

test("[SV-C18] without the dev shell the guard exits 1; pnpm check, build, test, e2e and dev run it first", () => {
  const bare = spawnSync(process.execPath, [join(root, "scripts/workflow-guard.mjs")], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: "/nonexistent" },
  });
  assert.equal(bare.status, 1);
  assert.match(bare.stderr, /workflow-env\.sh/);
  const ok = spawnSync(process.execPath, [join(root, "scripts/workflow-guard.mjs")], {
    env: { PATH: process.env.PATH, ...inside },
  });
  assert.equal(ok.status, 0);
  const { scripts } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const name of ["check", "build", "test", "e2e", "dev"])
    assert.match(scripts[name], /^node scripts\/workflow-guard\.mjs && /, name);
});
