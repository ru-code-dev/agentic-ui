/**
 * A4-D02: every `grep …` command REMAP.md tells the reader to run finds what it is for: copied
 * literally (a table cell's `\|` is a `|` once rendered), it lists at least one file. A pipe inside a
 * table, padding or a stale pattern made one of them match nothing before.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const commands = [...readFileSync(`${root}/REMAP.md`, "utf8").matchAll(/`(grep [^`]+)`/g)].map(
  (m) => m[1].replaceAll("\\|", "|"),
);

test("[A4-D02] REMAP's grep commands, run as written, each find a file", () => {
  assert.ok(commands.length > 0, "REMAP.md names grep commands");
  for (const command of commands) {
    const out = execFileSync("bash", ["-c", command], { cwd: root, encoding: "utf8" });
    assert.notEqual(out.trim(), "", `no match: ${command}`);
  }
});
