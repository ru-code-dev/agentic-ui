// PR-03: every in-scope PG-* feature of the playground is proven by a Playwright e2e test (real user interaction),
// not only by unit tests. Run: node --test scripts/e2e-coverage.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PROJECT_BASE, resolveDoc } from "./project-docs.mjs";
import { jsTags } from "./traceability/tags.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
// Amendment A3: the ID list is a workflow record under WORKFLOW/project/ (or a legacy docs/ layout).
const IDS = resolveDoc(root, "docs/TRACEABILITY.ids.json");
const idsPresent = existsSync(join(root, IDS));

/** PG IDs that are build tooling, not a UI feature: proven by a real dev server / build, not by a browser. */
const NOT_UI = {
  "PG-30": [
    "apps/playground/scripts/dev-resolution.test.ts",
    "apps/playground/scripts/stale-dist.test.ts",
  ],
};

const specs = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "apps/playground/e2e"],
  {
    cwd: root,
    encoding: "utf8",
  },
)
  .split("\n")
  .filter(
    (path) =>
      path.endsWith(".spec.ts") &&
      !path.endsWith("agent-real.spec.ts") &&
      existsSync(join(root, path)),
  );
const tags = specs.flatMap((path) => jsTags(path, read(path)).tags);
const pgIds = idsPresent
  ? JSON.parse(read(IDS))
      .ids.filter((entry) => entry.id.startsWith("PG-") && entry.scope === "in")
      .map((entry) => entry.id)
  : [];

test("[PR-03] every in-scope PG-* feature has a Playwright e2e test", (t) => {
  if (!idsPresent) return t.skip(`${PROJECT_BASE}/docs/TRACEABILITY.ids.json absent (fresh clone)`);
  assert.equal(pgIds.length, 30);
  const missing = pgIds.filter((id) => !(id in NOT_UI) && !tags.some((tag) => tag.id === id));
  assert.deepEqual(missing, []);
});

test("[PR-03] the build-tooling exception is proven by its own tests", (t) => {
  if (!idsPresent) return t.skip(`${PROJECT_BASE}/docs/TRACEABILITY.ids.json absent (fresh clone)`);
  for (const [id, files] of Object.entries(NOT_UI)) {
    assert.ok(pgIds.includes(id), id);
    for (const file of files) assert.match(read(file), new RegExp(`\\[${id}`), file);
  }
});

test("[PR-03] the interaction gaps found by the P10 audit have e2e tests", (t) => {
  if (!idsPresent) return t.skip(`${PROJECT_BASE}/docs/TRACEABILITY.ids.json absent (fresh clone)`);
  const audited = tags.filter((tag) => tag.id === "PR-03").map((tag) => tag.test);
  assert.ok(audited.length >= 15, `${audited.length} PR-03 tests`);
  const covered = new Set(tags.filter((tag) => audited.includes(tag.test)).map((tag) => tag.id));
  for (const id of [
    "PG-01",
    "PG-03",
    "PG-07",
    "PG-08",
    "PG-10",
    "PG-11",
    "PG-12",
    "PG-14",
    "PG-15",
    "PG-17",
    "PG-20",
    "PG-21",
    "PG-22",
    "PG-25",
    "PG-26",
  ])
    assert.ok(covered.has(id), id);
});
