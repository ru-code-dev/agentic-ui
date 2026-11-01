/**
 * DOC-11: the vite-plus task-cache self-heal. Each case builds a fake repo root under WORKFLOW/tmp
 * (SV-C18) with a task cache in a given state and runs the healer on it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { healTaskCache, TASK_CACHE } from "./vp-cache-heal.mjs";

const tmp = join(fileURLToPath(new URL("..", import.meta.url)), "WORKFLOW", "tmp");
mkdirSync(tmp, { recursive: true });
const roots = [];
after(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function rootWithCache() {
  const root = mkdtempSync(join(tmp, "vp-cache-"));
  roots.push(root);
  const version = join(root, TASK_CACHE, "v17");
  mkdirSync(version, { recursive: true });
  return { root, db: join(version, "cache.db") };
}

test("a cache.db that does not open is deleted with its task-cache folder [DOC-11]", () => {
  const { root, db } = rootWithCache();
  mkdirSync(db);
  const result = healTaskCache(root);
  assert.equal(result.removed, true);
  assert.match(result.problems[0], /cache\.db: /);
  assert.equal(existsSync(join(root, TASK_CACHE)), false);
});

test("a corrupt cache.db is deleted [DOC-11]", () => {
  const { root, db } = rootWithCache();
  writeFileSync(db, "not a sqlite file, just text that is long enough to have a header");
  assert.equal(healTaskCache(root).removed, true);
  assert.equal(existsSync(join(root, TASK_CACHE)), false);
});

test("a healthy cache and a missing cache are left alone [DOC-11]", () => {
  const { root, db } = rootWithCache();
  const created = new DatabaseSync(db);
  created.exec("CREATE TABLE t (x)");
  created.close();
  assert.deepEqual(healTaskCache(root), { removed: false, problems: [] });
  assert.equal(existsSync(db), true);
  const empty = mkdtempSync(join(tmp, "vp-cache-"));
  roots.push(empty);
  assert.deepEqual(healTaskCache(empty), { removed: false, problems: [] });
});
