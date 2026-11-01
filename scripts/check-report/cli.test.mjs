/**
 * DEC-028 checker CLI on the static fixture tree (--root fixtures/repo, never the live repo): a pass
 * line and exit 0, problem lines prefixed with the file and exit 1, missing files reported.
 * Run: node --test "scripts/check-report/*.test.mjs"
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../check-report.mjs", import.meta.url));
const root = fileURLToPath(new URL("./fixtures/repo", import.meta.url));
const run = (...args) =>
  spawnSync(process.execPath, [cli, "--root", root, ...args], { cwd: root, encoding: "utf8" });
const has = (problems, pattern) =>
  assert.ok(
    problems.some((p) => pattern.test(p)),
    `no problem matching ${pattern} in:\n${problems.join("\n")}`,
  );

test("CLI passes the fixture reports, prints one line per problem and exits 1 [DEC-028]", () => {
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^1 report\(s\) pass the DEC-028 format$/m);
  const bad = run("../prose-line.md");
  assert.equal(bad.status, 1);
  const lines = bad.stderr.trim().split("\n");
  assert.ok(lines.slice(0, -1).every((line) => line.startsWith("../prose-line.md")));
  has(lines, /file name must be/);
  const missing = run("docs/server/reports/info-X-none.md");
  assert.equal(missing.status, 1);
  has(missing.stderr.split("\n"), /info-X-none.md: file not found/);
});
